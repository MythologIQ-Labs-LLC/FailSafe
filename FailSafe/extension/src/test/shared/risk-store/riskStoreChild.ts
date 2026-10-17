/**
 * Child process for the #517 multi-process risk-store tests (not a suite).
 *
 * Usage: node riskStoreChild.js <mode> <workspace> <tag> <count> <staleMs>
 * Prints "ready", waits for <workspace>/go, does its work, then prints one
 * JSON result line. Lock-holding modes keep the process alive with their own
 * timer, because proper-lockfile's refresh timer is unref'd.
 *
 * v6.0.8 lock-queue modes (#528): `hold-for` takes the lock at once, holds it
 * for <count> ms and signals held/released with wall-clock times;
 * `delete-foreign-ticket` deletes the first queue ticket another process
 * takes and signals when it did.
 */

import * as fs from "fs";
import * as path from "path";
import { RiskStore } from "../../../shared/risk-store";
import { acquireRiskLock } from "../../../shared/risk-store/riskStoreLock";
import { writeFileAtomicSync } from "../../../shared/writeFileAtomic";
import { RiskRegisterManager } from "../../../roadmap/services/RiskRegisterManager";
import { RiskManager } from "../../../qorelogic/risk/RiskManager";

const [mode, ws, tag, countArg, staleArg] = process.argv.slice(2);
const count = Number(countArg || "0");
const staleMs = Number(staleArg || "5000");
const risksPath = path.join(ws, ".failsafe", "risks", "risks.json");

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function signal(name: string, body: unknown): void {
  fs.writeFileSync(path.join(ws, `${name}.signal`), JSON.stringify(body));
}

function waitForGo(): void {
  process.stdout.write("ready\n");
  const go = path.join(ws, "go");
  while (!fs.existsSync(go)) sleepSync(1);
}

function hammer(write: (i: number) => void): void {
  waitForGo();
  const startedAt = Date.now();
  let errors = 0;
  let firstAt = 0;
  let lastAt = 0;
  let firstError = "";
  for (let i = 0; i < count; i++) {
    try {
      write(i);
      lastAt = Date.now();
      if (!firstAt) firstAt = lastAt;
    } catch (error) {
      errors++;
      firstError = firstError || String(error);
    }
  }
  process.stdout.write(JSON.stringify({ tag, errors, firstError, startedAt, firstAt, lastAt }) + "\n");
}

function keepAlive(): void {
  setInterval(() => undefined, 1000);
}

function lockIno(): string {
  return String(fs.lstatSync(`${risksPath}.lock`, { bigint: true }).ino);
}

/** The lock directory identity the store compares: ino and mtime (Linux reuses inodes). */
function lockMtime(): string {
  return String(fs.lstatSync(`${risksPath}.lock`, { bigint: true }).mtimeNs);
}

function main(): void {
  console.log = console.info = console.warn = (): void => undefined;
  switch (mode) {
    case "store-mutate": {
      const store = new RiskStore(ws);
      hammer((i) => store.mutate((doc) => { doc.risks.push({ id: `${tag}-${i}` }); }));
      return;
    }
    case "rrm-upsert": {
      const mgr = new RiskRegisterManager(ws);
      hammer((i) => { mgr.upsertRisk({ id: `${tag}-${i}`, title: `${tag} ${i}` }); });
      return;
    }
    case "rm-create": {
      const mgr = new RiskManager(ws, "seeded-project");
      hammer((i) => {
        mgr.createRisk({
          title: `${tag} ${i}`, description: "d", category: "security", severity: "low",
          impact: "i", mitigation: "m", source: "manual", sourceAgent: tag,
        });
      });
      return;
    }
    case "hold-and-kill": {
      const store = new RiskStore(ws);
      store.mutate((doc) => { doc.risks.push({ id: "seed-1" }, { id: "seed-2" }); });
      store.mutate((doc) => {
        doc.risks.length = 0;
        process.kill(process.pid, "SIGKILL");
      });
      return;
    }
    case "hold-forever": {
      acquireRiskLock(risksPath, { timeoutMs: 5000, staleMs });
      signal("held", { ino: lockIno() });
      keepAlive();
      return;
    }
    case "steal-and-hold":
    case "steal-write-and-hold": {
      // Steal only a lock the parent already holds.
      while (!fs.existsSync(`${risksPath}.lock`)) sleepSync(5);
      acquireRiskLock(risksPath, { timeoutMs: 15000, staleMs });
      if (mode === "steal-write-and-hold") {
        writeFileAtomicSync(risksPath, JSON.stringify({ risks: [{ id: "X" }] }, null, 2));
      }
      signal("stolen", { ino: lockIno(), mtimeNs: lockMtime() });
      keepAlive();
      return;
    }
    case "hold-for": {
      const lock = acquireRiskLock(risksPath, { timeoutMs: 5000, staleMs });
      signal("held", { at: Date.now() });
      sleepSync(count);
      const at = Date.now();
      lock.release();
      signal("released", { at });
      return;
    }
    case "delete-foreign-ticket": {
      const queueDir = `${risksPath}.queue`;
      process.stdout.write("ready\n");
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        let names: string[] = [];
        try { names = fs.readdirSync(queueDir); } catch { /* not created yet */ }
        const foreign = names.find((n) => !n.includes(`-${process.pid}-`));
        if (foreign) {
          fs.unlinkSync(path.join(queueDir, foreign));
          signal("deleted", { at: Date.now(), name: foreign });
          return;
        }
        sleepSync(1);
      }
      signal("deleted", { at: 0, name: "" });
      return;
    }
    default:
      throw new Error(`unknown mode ${mode}`);
  }
}

main();

/**
 * Child process for the v6.0.8 replay-nonce store tests (#472; not a suite).
 *
 * Usage: node replayGuardChild.js <mode> <root> <arg>
 *   consume <root> <nonce>  validate before the start signal, then consume
 *   issue   <root> <count>  issue <count> nonces after the start signal
 *   consume-now <root> <nonce>  consume at once (no start signal; for spawnSync)
 * Prints "ready" (after an optional JSON "pre" line), waits for <root>/go,
 * does its work, then prints one JSON result line and exits.
 */

import * as fs from "fs";
import * as path from "path";
import { SecurityReplayGuard } from "../../governance/SecurityReplayGuard";

const [mode, root, arg] = process.argv.slice(2);

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForGo(): void {
  process.stdout.write("ready\n");
  const go = path.join(root, "go");
  while (!fs.existsSync(go)) sleepSync(1);
}

function main(): void {
  console.log = console.info = console.warn = console.debug = console.error = (): void => undefined;
  const guard = new SecurityReplayGuard(root, { cleanupIntervalMs: 3_600_000 });
  if (mode === "consume") {
    process.stdout.write(JSON.stringify({ pre: guard.validateNonce(arg).valid }) + "\n");
    waitForGo();
    const result = guard.consumeNonce(arg, `child-${process.pid}`);
    process.stdout.write(JSON.stringify({ valid: result.valid, reason: result.reason ?? null }) + "\n");
  } else if (mode === "consume-now") {
    const result = guard.consumeNonce(arg, `child-${process.pid}`);
    process.stdout.write(JSON.stringify({ valid: result.valid, reason: result.reason ?? null }) + "\n");
  } else if (mode === "issue") {
    waitForGo();
    const startedAt = Date.now();
    const nonces: string[] = [];
    let errors = 0;
    for (let i = 0; i < Number(arg); i++) {
      try { nonces.push(guard.generateNonce({ child: process.pid })); } catch { errors++; }
    }
    process.stdout.write(JSON.stringify({ nonces, errors, startedAt, lastAt: Date.now() }) + "\n");
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
  guard.dispose();
  process.exit(0);
}

main();

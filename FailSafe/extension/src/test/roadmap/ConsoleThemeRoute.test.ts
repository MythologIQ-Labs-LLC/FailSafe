// #601: the shared app theme authority and its Console routes, over real HTTP on 127.0.0.1.
// Only a request that passes the Console request guard AND carries the per-process theme key may
// change the theme; reads are open to Console pages; the before-paint script only ever contains a
// supported theme name.
import { describe, it, beforeEach, afterEach } from "mocha";
import { strict as assert } from "assert";
import * as http from "http";
import type { AddressInfo } from "net";
import express from "express";
import { consoleHostGuard } from "../../roadmap/routes/consoleRequestGuard";
import { registerConsoleThemeRoutes, themeKeyMatches } from "../../roadmap/routes/ConsoleThemeRoute";
import {
  CONSOLE_THEMES, ConsoleThemeAuthority, memoryThemeStore, type ConsoleThemeStore,
} from "../../roadmap/services/ConsoleThemeAuthority";

const KEY = "k".repeat(43);

interface Reply { status: number; body: string; json: Record<string, unknown> | null; type: string }

function request(port: number, method: string, path: string, headers: Record<string, string>, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers, setHost: false }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        let json: Record<string, unknown> | null = null;
        try { json = JSON.parse(data); } catch { json = null; }
        resolve({ status: res.statusCode ?? 0, body: data, json, type: String(res.headers["content-type"] ?? "") });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe("#601 Console theme authority", () => {
  it("defaults to mythiq and reports that no theme was chosen", () => {
    assert.deepEqual(new ConsoleThemeAuthority(memoryThemeStore()).current(), { theme: "mythiq", explicit: false });
  });

  it("persists every supported theme and notifies once per change", async () => {
    const authority = new ConsoleThemeAuthority(memoryThemeStore());
    const seen: string[] = [];
    authority.onDidChange((t) => seen.push(t));
    for (const theme of CONSOLE_THEMES) assert.equal(await authority.set(theme), theme);
    // From the default (mythiq) each step is a real change, including pegasus -> mythiq.
    assert.deepEqual(seen, [...CONSOLE_THEMES]);
    assert.deepEqual(authority.current(), { theme: "atmosphere", explicit: true });
    await authority.set("atmosphere");
    assert.equal(seen.length, CONSOLE_THEMES.length, "setting the same theme again does not notify");
  });

  it("refuses unsupported values without writing", async () => {
    let writes = 0;
    const store: ConsoleThemeStore = { read: () => ({ value: undefined, explicit: false }), write: async () => { writes += 1; } };
    const authority = new ConsoleThemeAuthority(store);
    for (const bad of ["dark", "Crimson", "", null, 7, ["crimson"], { theme: "crimson" }, "crimson\"]{}"]) {
      assert.equal(await authority.set(bad), null);
    }
    assert.equal(writes, 0);
  });

  it("an unsupported stored value reads as the default", () => {
    const store: ConsoleThemeStore = { read: () => ({ value: "neon", explicit: true }), write: async () => undefined };
    assert.deepEqual(new ConsoleThemeAuthority(store).current(), { theme: "mythiq", explicit: false });
  });

  it("publishes a change made outside the authority (Settings UI, another window)", () => {
    let value: unknown = "mythiq";
    let fire: () => void = () => undefined;
    const store: ConsoleThemeStore = {
      read: () => ({ value, explicit: true }),
      write: async (t) => { value = t; },
      onExternalChange: (l) => { fire = l; return { dispose: () => { fire = () => undefined; } }; },
    };
    const authority = new ConsoleThemeAuthority(store);
    const seen: string[] = [];
    authority.onDidChange((t) => seen.push(t));
    value = "pegasus";
    fire();
    fire();
    assert.deepEqual(seen, ["pegasus"]);
  });

  it("compares theme keys in constant time and refuses empty or missing keys", () => {
    assert.equal(themeKeyMatches(KEY, KEY), true);
    assert.equal(themeKeyMatches(`${KEY}x`, KEY), false);
    assert.equal(themeKeyMatches("", KEY), false);
    assert.equal(themeKeyMatches(undefined, KEY), false);
    assert.equal(themeKeyMatches([KEY], KEY), false);
    assert.equal(themeKeyMatches(KEY, ""), false);
  });
});

describe("#601 Console theme routes", () => {
  let server: http.Server;
  let port: number;
  let authority: ConsoleThemeAuthority;
  let host: string;

  beforeEach(async () => {
    authority = new ConsoleThemeAuthority(memoryThemeStore());
    const app = express();
    app.use(consoleHostGuard());
    app.use(express.json());
    registerConsoleThemeRoutes(app, { authority, themeKey: KEY, rejectIfRemote: () => false });
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
    host = `127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  const post = (headers: Record<string, string>, body: unknown) =>
    request(port, "POST", "/api/v1/ui/theme", { Host: host, ...headers }, typeof body === "string" ? body : JSON.stringify(body));
  const good = () => ({ Origin: `http://${host}`, "Content-Type": "application/json", "X-FailSafe-Theme-Key": KEY });

  it("GET returns the current theme without caching", async () => {
    const r = await request(port, "GET", "/api/v1/ui/theme", { Host: host });
    assert.equal(r.status, 200);
    assert.equal(r.json?.theme, "mythiq");
    assert.equal(r.json?.explicit, false);
    assert.equal(r.json?.revision, 0);
    assert.match(String(r.json?.epoch), /^[0-9a-f]{16}$/);
  });

  it("theme.js applies only the stored supported theme", async () => {
    await authority.set("crimson");
    const r = await request(port, "GET", "/api/v1/ui/theme.js", { Host: host });
    assert.equal(r.status, 200);
    assert.match(r.type, /javascript/);
    assert.equal(r.body, 'document.documentElement.setAttribute("data-theme", "crimson");\n');
  });

  it("an authorized Console page changes the theme for every listener", async () => {
    const seen: string[] = [];
    authority.onDidChange((t) => seen.push(t));
    const r = await post(good(), { theme: "pegasus" });
    assert.equal(r.status, 200);
    assert.equal(r.json?.ok, true);
    assert.equal(r.json?.theme, "pegasus");
    assert.equal(r.json?.revision, 1, "each change advances the revision");
    assert.deepEqual(authority.current(), { theme: "pegasus", explicit: true });
    assert.deepEqual(seen, ["pegasus"]);
  });

  const refused: Array<[string, Record<string, string>, unknown, number]> = [
    ["no theme key", { Origin: "", "Content-Type": "application/json" }, { theme: "crimson" }, 401],
    ["a wrong theme key", { "X-FailSafe-Theme-Key": "nope" }, { theme: "crimson" }, 401],
    ["another web page's Origin", { Origin: "http://evil.example" }, { theme: "crimson" }, 403],
    ["a null Origin", { Origin: "null" }, { theme: "crimson" }, 403],
    ["a VS Code webview Origin", { Origin: "vscode-webview://abc" }, { theme: "crimson" }, 403],
    ["a simple text/plain form post", { "Content-Type": "text/plain" }, JSON.stringify({ theme: "crimson" }), 415],
    ["an unsupported theme", {}, { theme: "neon" }, 400],
    ["a selector-injection value", {}, { theme: 'crimson"] body{display:none} [x="' }, 400],
  ];
  for (const [name, override, body, status] of refused) {
    it(`refuses ${name} and changes nothing`, async () => {
      const headers: Record<string, string> = { ...good(), ...override };
      for (const k of Object.keys(headers)) if (headers[k] === "") delete headers[k];
      if (name === "no theme key") delete headers["X-FailSafe-Theme-Key"];
      const r = await post(headers, body);
      assert.equal(r.status, status, r.body);
      assert.equal(r.json?.ok, false);
      assert.deepEqual(authority.current(), { theme: "mythiq", explicit: false });
    });
  }

  it("refuses a DNS-rebinding Host before any route runs", async () => {
    const r = await request(port, "POST", "/api/v1/ui/theme",
      { Host: `attacker.example:${port}`, Origin: `http://attacker.example:${port}`, "Content-Type": "application/json", "X-FailSafe-Theme-Key": KEY },
      JSON.stringify({ theme: "crimson" }));
    assert.equal(r.status, 403);
    assert.deepEqual(authority.current(), { theme: "mythiq", explicit: false });
  });

  it("a non-browser local client without the key cannot write", async () => {
    const r = await request(port, "POST", "/api/v1/ui/theme", { Host: host, "Content-Type": "application/json" }, JSON.stringify({ theme: "crimson" }));
    assert.equal(r.status, 401);
    assert.deepEqual(authority.current(), { theme: "mythiq", explicit: false });
  });
});

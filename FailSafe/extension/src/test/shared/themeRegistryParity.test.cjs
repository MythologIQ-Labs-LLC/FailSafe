"use strict";
// #601 / #917 V2: the six app themes have one registry, CONSOLE_THEMES in
// ConsoleThemeAuthority.ts. The sidebar chrome renders it directly. Copies that a
// browser module or the package manifest must hold statically are checked here,
// in order, so any drift fails the build.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const EXT = path.resolve(__dirname, "..", "..", "..");
const read = (rel) => fs.readFileSync(path.join(EXT, rel), "utf8");
const quoted = (text) => [...text.matchAll(/['"]([a-z]+)['"]/g)].map((m) => m[1]);

/** The contributed setting; `configuration` may be one object or an array of sections. */
function themeSetting() {
  const config = JSON.parse(read("package.json")).contributes.configuration;
  const setting = [config].flat().map((c) => c.properties?.["failsafe.console.theme"]).find(Boolean);
  assert.ok(setting, "failsafe.console.theme is not contributed");
  return setting;
}

function canonical() {
  const src = read("src/roadmap/services/ConsoleThemeAuthority.ts");
  const m = src.match(/export const CONSOLE_THEMES = \[([^\]]*)\] as const;/);
  assert.ok(m, "CONSOLE_THEMES literal not found");
  return quoted(m[1]);
}

const copies = {
  "theme-sync.js THEMES": () => {
    const m = read("src/roadmap/ui/modules/theme-sync.js").match(/export const THEMES = Object\.freeze\(\[([^\]]*)\]\)/);
    assert.ok(m, "theme-sync.js THEMES literal not found");
    return quoted(m[1]);
  },
  "package.json failsafe.console.theme enum": () => themeSetting().enum,
  "settings.js THEME_META keys": () => {
    const m = read("src/roadmap/ui/modules/settings.js").match(/const THEME_META = \{([\s\S]*?)\n\};/);
    assert.ok(m, "settings.js THEME_META not found");
    return [...m[1].matchAll(/^\s*([a-z]+): \{ id: '([a-z]+)'/gm)].map((x) => (assert.equal(x[1], x[2]), x[1]));
  },
  "theme-tokens.css [data-theme] blocks": () =>
    [...new Set([...read("src/roadmap/ui/theme-tokens.css").matchAll(/^\[data-theme="([a-z]+)"\] \{/gm)].map((m) => m[1]))],
};

test("the registry has the six supported themes and a member default", () => {
  const themes = canonical();
  assert.deepEqual(themes, ["pegasus", "mythiq", "midnight", "aurora", "crimson", "atmosphere"]);
  const def = read("src/roadmap/services/ConsoleThemeAuthority.ts").match(/DEFAULT_CONSOLE_THEME: ConsoleTheme = "([a-z]+)"/)[1];
  assert.ok(themes.includes(def));
  assert.match(read("src/roadmap/ui/modules/theme-sync.js"), new RegExp(`export const DEFAULT_THEME = '${def}';`));
  assert.equal(themeSetting().default, def);
});

for (const [name, load] of Object.entries(copies)) {
  test(`${name} matches CONSOLE_THEMES exactly, in order`, () => {
    assert.deepEqual(load(), canonical());
  });
}

test("the sidebar chrome and the settings chips derive from the registry instead of a literal list", () => {
  const sidebar = read("src/roadmap/FailSafeSidebarProvider.ts");
  assert.match(sidebar, /new Set\(\$\{JSON\.stringify\(CONSOLE_THEMES\)\}\)/);
  assert.doesNotMatch(sidebar, /'pegasus'|"pegasus"/);
  const settings = read("src/roadmap/ui/modules/settings.js");
  assert.match(settings, /import \{ THEMES, canChangeTheme \} from '\.\/theme-sync\.js';/);
  assert.match(settings, /const THEME_CHOICES = THEMES\.map\(/);
});

test("the parity check itself detects a drifted copy", () => {
  const drifted = quoted("'pegasus', 'mythiq', 'midnight', 'aurora', 'atmosphere', 'crimson'");
  assert.notDeepEqual(drifted, canonical());
});

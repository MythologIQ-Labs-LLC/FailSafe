#!/bin/sh
# usage: run703.sh <extension-root>  -- transpiles src/test/roadmap/delivery*.ts and runs them with mocha
E="$1"; cd "$E" || exit 2
rm -rf out/test/roadmap; mkdir -p out/test/roadmap
for f in src/test/roadmap/delivery-assessment-renderer*.test.ts src/test/roadmap/deliveryRenderer*.ts; do
  [ -f "$f" ] || continue
  b=$(basename "$f" .ts)
  node -e '
const ts=require("typescript"),fs=require("fs");
const o=ts.transpileModule(fs.readFileSync(process.argv[1],"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
fs.writeFileSync(process.argv[2],o.outputText);' "$f" "out/test/roadmap/$b.js"
done
npx mocha --ui tdd --timeout 20000 --reporter dot out/test/roadmap/delivery-assessment-renderer*.test.js 2>&1 | tail -${2:-15}

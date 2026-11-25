// usage: node razor703.cjs <extRoot> files...  -> function/test bodies > 40 lines, nesting > 3, nested ternaries
const path=require('path');const E=path.resolve(process.argv[2]);
const ts=require(path.join(E,'node_modules','typescript'));const fs=require('fs');
for (const f of process.argv.slice(3)) {
  const src=fs.readFileSync(path.resolve(E,f),'utf8'); const sf=ts.createSourceFile(f,src,ts.ScriptTarget.ES2022,true,f.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
  const lines=src.split(/\r?\n/).length; let maxFn=0, maxName='', maxNest=0, nestAt=0; const over=[]; let nt=0;
  const line=(p)=>sf.getLineAndCharacterOfPosition(p).line+1;
  const isFn=(n)=>ts.isFunctionLike(n)&&n.body;
  const NEST=new Set([ts.SyntaxKind.IfStatement,ts.SyntaxKind.ForStatement,ts.SyntaxKind.ForOfStatement,ts.SyntaxKind.ForInStatement,ts.SyntaxKind.WhileStatement,ts.SyntaxKind.DoStatement,ts.SyntaxKind.TryStatement,ts.SyntaxKind.SwitchStatement]);
  function walk(n,depth){
    if (isFn(n)) { const len=line(n.end)-line(n.getStart())+1; const nm=(n.name&&n.name.getText())||(n.parent&&ts.isCallExpression(n.parent)?n.parent.arguments[0]?.getText().slice(0,70):'<anon>')||'<anon>';
      if (len>40) over.push(`${line(n.getStart())}: ${len} lines ${nm}`); depth=0; }
    if (NEST.has(n.kind)) { depth++; if (depth>maxNest){maxNest=depth;nestAt=line(n.getStart());} }
    if (ts.isConditionalExpression(n) && (ts.isConditionalExpression(n.whenTrue)||ts.isConditionalExpression(n.whenFalse))) nt++;
    ts.forEachChild(n,(c)=>walk(c,depth));
  }
  walk(sf,0);
  console.log(`${f}: ${lines} lines; max nesting ${maxNest} (line ${nestAt}); nested ternaries ${nt}`); for (const o of over) console.log('   OVER40', o);
}

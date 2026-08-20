// Shared attribute-selector value escaping (#360). CSS.escape is authoritative
// when the platform provides it; the fallback covers CSS-less DOM shims and
// must be selector-safe on its own: backslashes BEFORE quotes (CodeQL
// js/incomplete-sanitization — a trailing \ would otherwise neutralize the
// quote escape), then CSS-newline characters as hex escapes (a raw \n \r \f
// inside a quoted CSS string is a parse error, not a mis-match).
export function escapeSelectorValue(value) {
  const str = String(value);
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\a ')
    .replace(/\r/g, '\\d ')
    .replace(/\f/g, '\\c ');
}

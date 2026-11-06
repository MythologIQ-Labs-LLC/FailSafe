# #601: map the Monitor's hard-coded neutral palette in roadmap.css onto the shared theme tokens.
# Status colors (red/amber/green badges, orbs, risk levels) keep their meaning and are left alone.
# Every replacement asserts its expected occurrence count, so a drifted file fails loudly.
import sys

path = sys.argv[1]
raw = open(path, 'rb').read()
bom = raw.startswith(b'\xef\xbb\xbf')
s = raw.decode('utf-8-sig')
crlf = '\r\n' in s
s = s.replace('\r\n', '\n')


def mix(tok, pct, other='transparent'):
    return f'color-mix(in srgb, var({tok}) {pct}%, {other})'


ROOT_OLD = """:root {
  --bg: #0b1220;
  --bg-soft: #0f1a2f;
  --card: #111f38;
  --card-soft: #152845;
  --line: #2e4770;
  --text: #e6eefb;
  --muted: #9fb1cd;
  --primary: #3d7dff;
  --good: #22c55e;
  --warn: #eab308;
  --bad: #ef4444;
}"""
ROOT_NEW = """:root {
  /* #601: the Monitor palette is derived from the shared theme tokens (theme-tokens.css), so
     it follows the app theme. --primary comes from the tokens directly: a :root definition
     here would tie with [data-theme] on specificity and, loading later, win. */
  --bg: var(--bg-dark);
  --bg-soft: color-mix(in srgb, var(--bg-dark) 70%, var(--bg-panel));
  --card: var(--bg-panel);
  --card-soft: color-mix(in srgb, var(--bg-panel) 88%, var(--primary));
  --line: var(--glass-border);
  --text: var(--text-main);
  --muted: var(--text-muted);
  --good: var(--accent-green);
  --warn: var(--accent-gold);
  --bad: var(--accent-red);
}"""

R = [
    (ROOT_OLD, ROOT_NEW, 1),
    ('rgba(66, 133, 244, 0.24)', mix('--primary', 24), 1),
    ('rgba(80, 215, 76, 0.12)', mix('--accent-green', 12), 1),
    ('#1a325a', 'var(--bg-dark)', 1),
    ('#122744', 'var(--bg-dark)', 1),
    ('rgba(61, 125, 255, 0.35)', mix('--primary', 35), 2),
    ('color: #f2f6ff', 'color: var(--text-main)', 1),
    ('rgba(112, 183, 255, 0.6)', mix('--accent-cyan', 60), 1),
    ('border: 1px solid #3a5f92', 'border: 1px solid var(--glass-border)', 1),
    ('color-mix(in srgb, #0d2447 88%, #050f21)', 'var(--bg-panel)', 1),
    ('color: #d9e6ff', 'color: var(--text-main)', 1),
    ('linear-gradient(135deg, #2f67de, #3d7dff 60%, #2fbb77)',
     'linear-gradient(135deg, color-mix(in srgb, var(--primary) 82%, #000), var(--primary) 60%, var(--accent-green))', 1),
    ('rgba(61, 125, 255, 0.18)', mix('--primary', 18), 1),
    ('rgba(61, 125, 255, 0.72)', mix('--primary', 72), 1),
    ('color: #d8e5ff', 'color: var(--text-main)', 2),
    ('background: #8090a6', 'background: var(--text-muted)', 1),
    ('color: #0d213e', 'color: var(--bg-panel)', 1),
    ('background: #4c627f', 'background: ' + mix('--text-muted', 55, 'var(--bg-panel)'), 1),
    ('color: #dce7fb', 'color: var(--text-main)', 1),
    ('linear-gradient(135deg, #2a88f3, #355cc8)',
     'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 78%, #000))', 1),
    ('rgba(42, 136, 243, 0.5)', mix('--primary', 50), 1),
    ('background: #23354d', 'background: ' + mix('--bg-panel', 82, 'var(--text-muted)'), 1),
    ('color: #647a96', 'color: var(--text-muted)', 1),
    ('border: 1px solid #3e587f', 'border: 1px solid var(--glass-border)', 1),
    ('background: rgba(12, 24, 42, 0.92)', 'background: var(--bg-panel)', 1),
    ('color: #9fb1cd', 'color: var(--text-muted)', 1),
    ('border-color: #425b82', 'border-color: var(--glass-border)', 1),
    ('color: #a9bddb', 'color: var(--text-muted)', 1),
    ('border-top: 1px solid #46618b', 'border-top: 1px solid var(--glass-border)', 1),
    ('border: 1px solid #3b577f', 'border: 1px solid var(--glass-border)', 1),
    ('background: rgba(10, 26, 48, 0.42)', 'background: var(--bg-deep)', 1),
    ('border: 1px solid rgba(85, 123, 177, 0.82)', 'border: 1px solid var(--glass-border)', 1),
    ('background: rgba(18, 42, 76, 0.92)', 'background: var(--bg-panel)', 1),
    ('color: #c5d9fb', 'color: var(--text-main)', 1),
    ('color: #e8f0ff', 'color: var(--text-main)', 1),
    ('#2f496f', 'var(--glass-border)', 5),
    ('border: 2px solid #5d6f8a', 'border: 2px solid var(--text-muted)', 1),
    ('border: 1px solid #7c3333', 'border: 1px solid ' + mix('--accent-red', 60, 'var(--bg-panel)'), 1),
    ('background: rgba(198, 74, 74, 0.22)', 'background: ' + mix('--accent-red', 22), 1),
    ('color: #ffd0d0', 'color: ' + mix('--accent-red', 55, 'var(--text-main)'), 1),
    ('background: rgba(198, 74, 74, 0.35)', 'background: ' + mix('--accent-red', 35), 1),
    ('border: 1px solid #435f87', 'border: 1px solid var(--glass-border)', 1),
    ('background: rgba(8, 20, 38, 0.25)', 'background: var(--bg-deep)', 1),
    ('background: #1a2b48', 'background: var(--bg-deep)', 1),
    ('border: 1px solid #5c789f', 'border: 1px solid var(--glass-border)', 1),
    ('border: 2px solid #8ca3c0', 'border: 2px solid var(--text-muted)', 1),
    ('background: rgba(200, 214, 229, 0.1)', 'background: ' + mix('--text-muted', 12), 1),
    ('linear-gradient(180deg, #8dc9ff 0%, #4f84f0 100%)', 'linear-gradient(180deg, var(--accent-cyan) 0%, var(--primary) 100%)', 1),
    ('stroke: #23395d', 'stroke: ' + mix('--text-muted', 25), 1),
    ('#3d7dff', 'var(--primary)', 3),
    ('background: #223a5f', 'background: ' + mix('--text-muted', 25), 1),
    ('border: 2px solid #162742', 'border: 2px solid var(--bg-panel)', 1),
    ('color: #c8d7f1', 'color: var(--text-main)', 1),
    ('border: 1px solid #3a5785', 'border: 1px solid var(--glass-border)', 1),
    ('background: rgba(14, 35, 66, 0.65)', 'background: var(--bg-deep)', 1),
    ('color-mix(in srgb, var(--muted) 88%, #c9d7ef)', 'var(--text-muted)', 1),
    ('color: #9dc4ff', 'color: var(--accent-cyan)', 1),
    ('color: #c8ddff', 'color: var(--text-main)', 1),
    ('color: #f8fafc', 'color: var(--text-main)', 1),
    ('background: rgba(0, 0, 0, 0.2)', 'background: var(--bg-deep)', 2),
    ('background: rgba(0, 0, 0, 0.15)', 'background: var(--bg-deep)', 1),
    ('background: rgba(255, 255, 255, 0.1)', 'background: ' + mix('--text-main', 10), 3),
    ('background: rgba(255, 255, 255, 0.2)', 'background: ' + mix('--text-main', 20), 2),
    ('linear-gradient(135deg, var(--primary), #2563eb)',
     'linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 78%, #000))', 2),
    ('background: rgba(61, 125, 255, 0.25)', 'background: ' + mix('--primary', 25), 1),
    ('background: rgba(61, 125, 255, 0.45)', 'background: ' + mix('--primary', 45), 1),
    ('background: rgba(61, 125, 255, 0.08)', 'background: ' + mix('--primary', 8), 1),
    ('background: rgba(61, 125, 255, 0.1)', 'background: ' + mix('--primary', 10), 1),
    ('background: rgba(0, 0, 0, 0.25)', 'background: var(--bg-deep)', 1),
    ('color: #a5d6ff', 'color: var(--accent-cyan)', 1),
    ('color: #22d3ee', 'color: var(--accent-cyan)', 1),
]
for old, new, n in R:
    count = s.count(old)
    if count != n:
        sys.exit(f'expected {n} x {old!r}, found {count}')
    s = s.replace(old, new)

# grade-d: the only orange here that is a text color.
i = s.index('.compliance-grade.grade-d')
j = s.index('}', i)
block = s[i:j]
assert block.count('#f97316') == 1
s = s[:i] + block.replace('#f97316', 'var(--accent-orange)') + s[j:]

if crlf:
    s = s.replace('\n', '\r\n')
open(path, 'wb').write((b'\xef\xbb\xbf' if bom else b'') + s.encode('utf-8'))
print('ok')

# Re-number drifted `path:from[-to]` (`anchor`) citations reported by FX1003 after a code edit.
# Input: the test:node log. For each "citation: DOC:LINE: PATH:FROM[-TO]: anchor "X" is not within 3 lines"
# finding, locate the anchor in PATH; if it occurs on exactly one line (or exactly one nearest the old
# position by the same shift as the other anchors in that file), shift the citation's line range by the
# same delta, editing only that citation on DOC:LINE. Anything ambiguous is reported, never guessed.
import re, sys, os

log, repo, base = sys.argv[1], sys.argv[2], sys.argv[3]
import subprocess
pat = re.compile(r"citation: (\S+?):(\d+): (\S+?):(\d+)(?:-(\d+))?: anchor \"(.*)\" is not within 3 lines")
findings = []
for line in open(log, encoding='utf-8', errors='replace'):
    m = pat.search(line.replace('\\"', '"'))
    if m:
        doc, dl, path, a, b, anchor = m.groups()
        findings.append((doc, int(dl), path, int(a), int(b) if b else None, anchor))

cache = {}
def lines_of(p):
    if p not in cache:
        cache[p] = open(os.path.join(repo, p), encoding='utf-8-sig').read().replace('\r\n', '\n').split('\n')
    return cache[p]

fixed, skipped = 0, []
docs = {}
for doc, dl, path, a, b, anchor in findings:
    src = lines_of(path)
    old_src = subprocess.run(['git', '-C', repo, 'show', f'{base}:{path}'], capture_output=True, text=True, encoding='utf-8').stdout.splitlines()
    end = b or a
    old_hits = [i + 1 for i, l in enumerate(old_src) if anchor in l and a - 3 <= i + 1 <= end + 3]
    new_hits = [i + 1 for i, l in enumerate(src) if anchor in l]
    if len(old_hits) != 1 or not new_hits:
        skipped.append((doc, dl, path, anchor, f'old {old_hits} new {new_hits}')); continue
    # The anchor's occurrence index in the old file maps to the same occurrence in the new file.
    k = [i + 1 for i, l in enumerate(old_src) if anchor in l].index(old_hits[0])
    if len(new_hits) != len([1 for l in old_src if anchor in l]):
        skipped.append((doc, dl, path, anchor, 'occurrence count changed')); continue
    delta = new_hits[k] - old_hits[0]
    old = f"{path}:{a}" + (f"-{b}" if b else "")
    new = f"{path}:{a + delta}" + (f"-{b + delta}" if b else "")
    if doc not in docs:
        raw = open(os.path.join(repo, doc), 'rb').read()
        docs[doc] = [raw.startswith(b'\xef\xbb\xbf'), b'\r\n' in raw, raw.decode('utf-8-sig').replace('\r\n', '\n').split('\n')]
    text = docs[doc][2]
    l = text[dl - 1]
    if l.count(old) < 1:
        skipped.append((doc, dl, path, anchor, f'citation text {old} not on line')); continue
    # Replace only the occurrence followed by this anchor (a line can cite the same path twice).
    idx = l.find(old + "` (`" + anchor)
    if idx < 0:
        idx = l.find(old)
    text[dl - 1] = l[:idx] + new + l[idx + len(old):]
    fixed += 1

for doc, (bom, crlf, text) in docs.items():
    s = '\n'.join(text)
    if crlf: s = s.replace('\n', '\r\n')
    open(os.path.join(repo, doc), 'wb').write((b'\xef\xbb\xbf' if bom else b'') + s.encode('utf-8'))
print(f'findings={len(findings)} fixed={fixed} skipped={len(skipped)}')
for s in skipped: print('SKIP', s)

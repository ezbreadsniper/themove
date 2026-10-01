"""Tiny exact-match multi-replace helper used during gauntlet passes: python edit.py spec.json"""
import json, sys
spec = json.load(open(sys.argv[1], encoding='utf-8'))
for path, pairs in spec.items():
    s = open(path, encoding='utf-8').read()
    for a, b in pairs:
        if a not in s:
            raise SystemExit(f"MISSING in {path}: {a[:80]!r}")
        s = s.replace(a, b)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
print('applied', sum(len(v) for v in spec.values()), 'edits')

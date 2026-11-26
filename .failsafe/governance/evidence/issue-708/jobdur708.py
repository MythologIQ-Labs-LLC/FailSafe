"""Job execution durations for #708: for each successful run in the saved run lists, read the job's
started_at/completed_at (latest attempt) and write a snapshot plus statistics. timeout-minutes counts
job execution time, so this is the comparable measure (run createdAt/updatedAt includes queueing and
re-run gaps)."""
import json, math, subprocess, sys
from datetime import datetime

D = sys.argv[1]
JOB = {'pr-full-test.yml': ('Full Test Suite (test:all)', 1800),
       'repo-standards-enforcement.yml': ('standards', 600),
       'vsix-proprietary-guardrails.yml': ('verify-vsix-guardrails', 600)}
ts = lambda s: datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()
out = {}
for wf, (job, limit) in JOB.items():
    runs = json.load(open(f'{D}/runs-{wf}.json', encoding='utf-8'))
    rows = []
    for r in runs:
        if r['conclusion'] != 'success':
            continue
        j = json.loads(subprocess.check_output(['gh', 'api', f"repos/MythologIQ-Labs-LLC/FailSafe/actions/runs/{r['databaseId']}/jobs"], text=True))
        match = [x for x in j['jobs'] if x['name'] == job]
        if len(match) != 1:
            raise SystemExit(f"{wf} run {r['databaseId']}: job {job!r} not found exactly once")
        x = match[0]
        rows.append({'run': r['databaseId'], 'attempt': x['run_attempt'], 'started_at': x['started_at'], 'completed_at': x['completed_at'],
                     'seconds': int(ts(x['completed_at']) - ts(x['started_at']))})
    d = sorted(row['seconds'] for row in rows)
    n = len(d)
    stats = {'window_created': [min(r['createdAt'] for r in runs), max(r['createdAt'] for r in runs)], 'runs': len(runs), 'success': n,
             'min': d[0], 'median_mean_of_middle_two': (d[(n - 1) // 2] + d[n // 2]) / 2, 'p95_nearest_rank': d[math.ceil(0.95 * n) - 1],
             'max': d[-1], 'limit': limit, 'headroom_at_max': round(limit / d[-1], 2), 'top5': d[-5:]}
    out[wf] = {'job': job, 'stats': stats, 'rows': rows}
    print(wf, json.dumps(stats))
json.dump(out, open(f'{D}/job-durations-snapshot.json', 'w', encoding='utf-8'), indent=1)

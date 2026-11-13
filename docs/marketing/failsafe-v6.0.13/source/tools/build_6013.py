"""Assemble "FailSafe v6.0.13: Statewright handoff" from one genuine take (VS Code window + whole Chrome window).

    <Sonic Rift python> build_6013.py <take dir> <out dir> [--provisional]

Picture: title card -> VS Code recording (FailSafe view, Command Palette) -> Chrome recording (Console, Integrations >
Catalog, the Statewright AI card, the real click, the Statewright page) -> end card. Recorded footage is cut for time
and framed (Chrome window scaled to 90.9 % to fit 1080 lines), never retimed or retouched. Two post-production
layers are added and documented: (1) a pointer drawn at the logged coordinates of the trusted CDP mouse events the take
performed (the capture excludes the OS cursor; no pointer is drawn where no event happened), and (2) irreversible
pixelation over the regions listed in <take>/redact.json (account name / initials), applied before scaling.
Audio: selected Sonic Rift narration takes + the owner-approved music bed, mixed with Sonic Rift Studio's engine.
"""
import json
import math
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

TAKE, OUT = Path(sys.argv[1]), Path(sys.argv[2])
PROVISIONAL = "--provisional" in sys.argv
W = Path(r"C:\dev\mythologiq\failsafe\_work\v6013-demo")
BUILD = OUT / "build"
BUILD.mkdir(parents=True, exist_ok=True)
SR = r"C:\LocalAI\Voice\Chatterbox\demo-v091\app\Sonic Rift"
FPS = 30
EXT = W / "rig" / "iso" / "ext" / "mythologiq.mythologiq-failsafe-6.0.13-win32-x64"
LOGO = EXT / "assets" / "release-branding" / "source-failsafe-studio.png"      # published 6.0.13 VSIX copy
MARK = EXT / "assets" / "release-branding" / "source-mythologiq-studio.webp"   # published 6.0.13 VSIX copy
FONT = Path(r"C:\dev\mythologiq\bob-media-handoff\bob-find-your-next-step-v1-review\brand\opener-source\DMSans[opsz,wght].ttf")
NAVY = (9, 14, 28)
WHITE, SILVER, DIM = (255, 255, 255, 255), (0xD4, 0xD5, 0xDA, 255), (0x9A, 0xA3, 0xB5, 255)
RELEASE = "https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/tag/v6.0.13"
PICKS = json.load(open(__import__("os").environ.get("PICKS") or W / "source" / "narration" / "picks.json", encoding="utf-8"))
LINES = json.load(open(__import__("os").environ.get("LINES") or W / "source" / "narration" / "lines.json", encoding="utf-8"))


def run(*args, **kw):
    r = subprocess.run([str(a) for a in args], capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise SystemExit("FAILED: " + " ".join(str(a) for a in args)[:800] + "\n" + r.stderr[-2500:])
    return r


def font(px, weight, opsz=14):
    f = ImageFont.truetype(str(FONT), px)
    f.set_variation_by_axes([opsz, weight])
    return f


# ------------------------------------------------------------------ cards (logos: canonical files, only scaled down)
def lockup(img, y):
    mark = Image.open(MARK).convert("RGBA")
    mark = mark.crop(mark.split()[3].getbbox())
    h = 54
    mark = mark.resize((round(mark.width * h / mark.height), h), Image.LANCZOS)
    bold, medium = font(26, 700, 21), font(26, 500, 21)
    d = ImageDraw.Draw(img)
    w = mark.width + 16 + d.textlength("MythologIQ", font=bold) + d.textlength(" Labs", font=medium)
    x = (img.width - w) / 2
    img.alpha_composite(mark, (round(x), round(y - h / 2)))
    x += mark.width + 16
    d.text((x, y), "MythologIQ", font=bold, fill=WHITE, anchor="lm")
    d.text((x + d.textlength("MythologIQ", font=bold), y), " Labs", font=medium, fill=SILVER, anchor="lm")


def card(path, lines, logo_px, logo_y, lockup_y):
    img = Image.new("RGBA", (1920, 1080), NAVY + (255,))
    logo = Image.open(LOGO).convert("RGBA")
    assert logo_px <= logo.width, "the FailSafe logo is never scaled up"
    logo = logo.resize((logo_px, logo_px), Image.LANCZOS)
    img.alpha_composite(logo, ((1920 - logo_px) // 2, logo_y))
    d = ImageDraw.Draw(img)
    for text, y, px, weight, fill in lines:
        d.text((960, y), text, font=font(px, weight, 14 if px < 40 else 30), fill=fill, anchor="mm")
    if lockup_y:
        lockup(img, lockup_y)
    img.convert("RGB").save(path)


TITLE, END = BUILD / "card-title.png", BUILD / "card-end.png"
card(TITLE, [("FailSafe v6.0.13", 690, 88, 700, WHITE), ("Statewright AI  ·  website handoff", 780, 38, 500, SILVER)], 360, 230, 975)
card(END, [("FailSafe v6.0.13", 560, 84, 700, WHITE), ("Open Statewright run history from FailSafe.", 650, 40, 500, SILVER),
           (RELEASE, 740, 27, 500, DIM)], 280, 170, 975)

# ------------------------------------------------------------------ pointer graphics
SS = 4
arrow = [(0, 0), (0, 17), (4.2, 13.3), (7, 19.6), (9.6, 18.5), (6.9, 12.4), (12.3, 12.4)]
k = 1.45 * SS
ptr = Image.new("RGBA", (round(16 * k), round(23 * k)), (0, 0, 0, 0))
d = ImageDraw.Draw(ptr)
pts = [(1.5 * SS + x * k, 1.5 * SS + y * k) for x, y in arrow]
d.polygon(pts, fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=round(1.3 * SS))
PTR = BUILD / "pointer.png"
ptr.resize((ptr.width // SS, ptr.height // SS), Image.LANCZOS).save(PTR)
ring = Image.new("RGBA", (64 * SS, 64 * SS), (0, 0, 0, 0))
ImageDraw.Draw(ring).ellipse((4 * SS, 4 * SS, 60 * SS, 60 * SS), outline=(255, 255, 255, 200), width=3 * SS)
RING = BUILD / "click-ring.png"
ring.resize((64, 64), Image.LANCZOS).save(RING)

# ------------------------------------------------------------------ timeline from the take's event log
E = json.load(open(TAKE / "events.json", encoding="utf-8"))
def ev(name, nth=0):
    return [e for e in E["events"] if e["name"] == name][nth]["t"]

TITLE_S, XF, END_S, FADE_OUT = 5.0, 0.5, float(__import__("os").environ.get("END_SECONDS", "9.0")), 0.8
V_IN = ev("vscode.failsafeView") - 2.4
V_OUT = ev("vscode.palette.enter") + 1.1
C_IN = ev("chrome.capture.start") + 0.15
C_OUT = ev("take.end") - 0.4
# PROVIDER mode: the Statewright segment comes from a separately supplied, already-redacted page-viewport clip
# (PROVIDER_CLIP). The take is cut on the first recorded frame in which the new tab paints Statewright's page.
PROVIDER = __import__("os").environ.get("PROVIDER_CLIP")
P_LEN = float(__import__("os").environ.get("PROVIDER_SECONDS", "18.6"))
CUT_INFO = None
if PROVIDER:
    import numpy as np
    C_IN = ev("console.overview") - 1.4
    t_tab, crop_top = ev("chrome.newTab"), E["stage"]["console"]["cropTop"]
    r = subprocess.run(["ffmpeg", "-v", "info", "-copyts", "-i", str(TAKE / "console.mkv"), "-vf",
                        f"select='between(t,{t_tab - 0.2:.3f},{t_tab + 2.0:.3f})',showinfo,crop=1920:40:0:{crop_top + 20}",
                        "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
    pts = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", r.stderr.decode("utf-8", "replace"))]
    fr = np.frombuffer(r.stdout, np.uint8).reshape(-1, 40, 1920, 3)
    painted = [t for t, f in zip(pts, fr) if t > t_tab and f.mean() < 200]   # page header (dark purple) replaces the blank white tab
    C_OUT = painted[0]
    CUT_INFO = {"new_tab": t_tab, "first_painted_frame": C_OUT, "frames_scanned": len(pts)}
v_len, c_len = V_OUT - V_IN, C_OUT - C_IN
film_v = lambda t: TITLE_S - XF + (t - V_IN)
film_c = lambda t: TITLE_S - XF + v_len + (t - C_IN)
END_AT = film_c(C_OUT) + (P_LEN if PROVIDER else 0) - XF
TOTAL = END_AT + END_S
CROP = E["stage"]["console"]["cropTop"]           # Chrome toolbar height in the window recording (108)
S = 1080 / (1080 + CROP)                          # whole window scaled to 1080 lines
CW = round(1920 * S / 2) * 2
CX = (1920 - CW) // 2

# ------------------------------------------------------------------ clips
X264 = ["-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv444p", "-r", str(FPS)]
base = lambda a, b: f"fps={FPS}:start_time=0,tpad=stop_mode=clone:stop_duration=60,trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS"

vclip = BUILD / "clip-1-vscode.mkv"
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-copyts", "-i", TAKE / "vscode.mkv", "-vf", base(V_IN, V_OUT) + ",setsar=1",
    "-frames:v", round(v_len * FPS), "-an", *X264, vclip)

# redaction (source window coordinates, from <take>/redact.json: [{"x","y","w","h","from_event"}]); pixelate + blur
red = json.load(open(TAKE / "redact.json", encoding="utf-8")) if (TAKE / "redact.json").exists() else []
fc = f"[0:v]{base(C_IN, C_OUT)},format=yuv444p[src];"
cur = "src"
for i, r in enumerate(red):
    t0 = ev(r["from_event"]) - C_IN - 0.2
    bx = max(4, r["w"] // 10)
    fc += (f"[{cur}]split[a{i}][b{i}];[b{i}]crop={r['w']}:{r['h']}:{r['x']}:{r['y']},scale={max(1, r['w'] // bx)}:{max(1, r['h'] // bx)}:flags=area,"
           f"scale={r['w']}:{r['h']}:flags=neighbor,boxblur=8:2[p{i}];[a{i}][p{i}]overlay={r['x']}:{r['y']}:enable='gte(t,{max(0, t0):.3f})'[r{i}];")
    cur = f"r{i}"
fc += f"color=c=0x090E1C:s=1920x1080:r={FPS}[bg];[{cur}]scale={CW}:1080:flags=lanczos[sc];[bg][sc]overlay={CX}:0:shortest=1[fr];"

# pointer: logged CDP mouse positions (Console page CSS px, dpr 1.25) -> output px; shown until 1.0 s after the link click
P = [p for p in E["pointer"] if C_IN <= p["t"]]
click_t = [p["t"] for p in E["pointer"] if p.get("down")]
hide_at = min(ev("console.link.click") + 1.0, ev("chrome.newTab") + 0.15) - C_IN  # never over the provider page
dpr = E["stage"]["console"]["metrics"]["dpr"]
to_out = lambda x, y: (CX + x * dpr * S, (y * dpr + CROP) * S)
cmds = []
first = to_out(P[0]["x"], P[0]["y"]) if P else (960, 540)
for p in P:
    x, y = to_out(p["x"], p["y"])
    cmds.append(f"{p['t'] - C_IN:.3f} overlay@ptr x {x:.1f}, overlay@ptr y {y:.1f};")
(BUILD / "pointer.cmd").write_text("\n".join(cmds) + "\n", encoding="utf-8")
ring_en = "+".join(f"between(t,{c - C_IN:.3f},{c - C_IN + 0.35:.3f})" for c in click_t) or "0"
cmdfile = (BUILD / "pointer.cmd").as_posix().replace(":", "\\:")
fc += (f"[fr]sendcmd=f='{cmdfile}'[fr2];[2:v]format=rgba[ptr];[fr2][ptr]overlay@ptr=x={first[0]:.1f}:y={first[1]:.1f}:eval=frame:"
       f"enable='lt(t,{hide_at:.3f})'[pp];")
# click ring centred on the pointer tip at each logged mouse-down
for j, c in enumerate(click_t):
    x, y = to_out(*[(p["x"], p["y"]) for p in E["pointer"] if p.get("down") and p["t"] == c][0])
    fc += f"[3:v]format=rgba,split=1[rg{j}];[{'pp' if j == 0 else f'q{j - 1}'}][rg{j}]overlay={x - 32:.1f}:{y - 32:.1f}:enable='between(t,{c - C_IN:.3f},{c - C_IN + 0.35:.3f})'[q{j}];"
last = f"q{len(click_t) - 1}" if click_t else "pp"
fc += f"[{last}]setsar=1[v]"
cclip = BUILD / "clip-2-chrome.mkv"
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-copyts", "-i", TAKE / "console.mkv", "-f", "lavfi", "-i", "nullsrc=s=16x16",
    "-loop", "1", "-i", PTR, "-loop", "1", "-i", RING, "-filter_complex", fc, "-map", "[v]", "-frames:v", round(c_len * FPS), "-an", *X264, cclip)

# provider clip: native pixels (no scaling), centred on navy
inputs = [vclip, cclip]
if PROVIDER:
    pw, ph = [int(v) for v in run("ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", PROVIDER).stdout.strip().split(",")]
    assert pw <= 1920 and ph <= 1080
    pclip = BUILD / "clip-3-statewright.mkv"
    run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", PROVIDER, "-filter_complex",
        f"color=c=0x090E1C:s=1920x1080:r={FPS}[bg];[0:v]fps={FPS},tpad=stop_mode=clone:stop_duration=30,trim=end={P_LEN:.3f},setpts=PTS-STARTPTS[p];"
        f"[bg][p]overlay={(1920 - pw) // 2}:{(1080 - ph) // 2}:shortest=1,setsar=1[v]", "-map", "[v]", "-frames:v", round(P_LEN * FPS), "-an", *X264, pclip)
    inputs.append(pclip)
NB = len(inputs)
# ------------------------------------------------------------------ picture
fcp = (f"[0:v]fps={FPS},format=yuv444p,settb=AVTB[tc];"
       + "".join(f"[{i + 1}:v]fps={FPS},format=yuv444p,settb=AVTB,setpts=PTS-STARTPTS[v{i + 1}];" for i in range(NB))
       + f"[{NB + 1}:v]fps={FPS},format=yuv444p,settb=AVTB[ec];"
       + "".join(f"[v{i + 1}]" for i in range(NB)) + f"concat=n={NB}:v=1,settb=AVTB,setpts=PTS-STARTPTS[body];"
       f"[tc][body]xfade=transition=fade:duration={XF}:offset={TITLE_S - XF:.3f}[tb];"
       f"[tb][ec]xfade=transition=fade:duration={XF}:offset={END_AT:.3f}[all];"
       f"[all]fade=t=in:st=0:d=0.6,fade=t=out:st={TOTAL - FADE_OUT:.3f}:d={FADE_OUT},format=yuv420p[v]")
picture = BUILD / "picture.mkv"
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-t", TITLE_S, "-i", TITLE, *[x for f in inputs for x in ("-i", f)],
    "-loop", "1", "-t", END_S, "-i", END, "-filter_complex", fcp, "-map", "[v]", "-t", f"{TOTAL:.3f}",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-r", FPS, picture)

# ------------------------------------------------------------------ narration cues, mix
def dur(f):
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f).stdout)

starts = {
    "N1": 0.5,
    "N2": film_v(ev("vscode.failsafeView")) + 0.5,
    "N3": film_c([e for e in E["events"] if e["name"] == "click.down" and e.get("what") == "Integrations"][0]["t"]) - 0.7,
    "N4": film_c(ev("console.link.hover")) - 1.3,
    "N5": film_c(C_OUT) + 0.45 if PROVIDER else film_c(ev("statewright.load")) + 1.2,
    "N6": END_AT + 0.5,
}
cues = []
for k in ["N1", "N2", "N3", "N4", "N5", "N6"]:
    f = Path(PICKS[k])
    cues.append({"scene": k, "file": str(f), "take": f.name, "start": round(starts[k], 3), "seconds": round(dur(f), 3), "text": LINES[k]})
for a, b in zip(cues, cues[1:]):
    gap = b["start"] - (a["start"] + a["seconds"])
    a["gap_after"] = round(gap, 3)
    assert gap >= 0.25, f"narration overlap {a['scene']} -> {b['scene']}: {gap:.2f}s"
assert cues[-1]["start"] + cues[-1]["seconds"] <= TOTAL - 1.0, "N6 runs past the end"
MIX = BUILD / "mix"
__import__("shutil").rmtree(MIX, ignore_errors=True); MIX.mkdir()  # fresh Studio project each build
json.dump(cues, open(MIX / "cues.json", "w", encoding="utf-8"), indent=1)
env = dict(**__import__("os").environ, PROJECT_NAME="failsafe-6.0.13-statewright", FILM_SECONDS=f"{TOTAL:.3f}", FADE_IN="1.5", FADE_OUT="3.0",
           MUSIC=str(Path(r"C:\dev\mythologiq\failsafe\docs\marketing\failsafe-v6.0.12\audio\music-candidates\MUSIC_bed_takeC.wav")),
           MUSIC_GAIN_DB="-12", DUCK_DB="-9")
run(Path(SR) / ".venv" / "Scripts" / "python.exe", W / "source" / "tools" / "mix_narration_6013.py", SR, W / "audio" / "profiles" / "studio-6013",
    MIX / "cues.json", MIX, env=env)
master = MIX / "export-failsafe-6.0.13-statewright" / "master.wav"
if not master.exists():
    master = next((MIX / "export-failsafe-6.0.13-statewright").rglob("*.wav"))

# ------------------------------------------------------------------ final MP4
name = "FailSafe-v6.0.13-Statewright-Demo" + ("-PROVISIONAL" if PROVISIONAL else "")
mp4 = OUT / f"{name}.mp4"
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", picture, "-i", master, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{TOTAL:.3f}", "-movflags", "+faststart",
    "-metadata", "title=FailSafe v6.0.13: Open Statewright run history from FailSafe", mp4)

# ------------------------------------------------------------------ captions (sentence timing from pauses measured in each take)
def pauses(f):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(f), "-af", "silencedetect=noise=-38dB:d=0.4", "-f", "null", "-"], capture_output=True, text=True)
    s = [float(m) for m in re.findall(r"silence_start: ([0-9.]+)", r.stderr)]
    e = [float(m) for m in re.findall(r"silence_end: ([0-9.]+)", r.stderr)]
    return [(a, b) for a, b in zip(s, e) if b - a >= 0.5]

def lead_trail(f):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(f), "-af", "silencedetect=noise=-40dB:d=0.05", "-f", "null", "-"], capture_output=True, text=True)
    s = [float(m) for m in re.findall(r"silence_start: ([0-9.]+)", r.stderr)]
    e = [float(m) for m in re.findall(r"silence_end: ([0-9.]+)", r.stderr)]
    lead = e[0] if s and s[0] < 0.02 and e else 0.0
    return lead

SPOKEN = json.load(open(__import__('os').environ.get('SPOKEN') or W / 'source' / 'narration' / 'lines-spoken.json', encoding='utf-8'))
subs, report = [], []
for c in cues:
    sents = [s.strip() for s in re.split(r"(?<=[.?!])\s+(?=[A-Z])", c["text"]) if s.strip()]
    total = c["seconds"]
    gaps = pauses(c["file"])
    if len(gaps) > len(sents) - 1:  # keep the longest pauses (sentence breaks), drop shorter comma pauses
        gaps = sorted(sorted(gaps, key=lambda g: g[1] - g[0], reverse=True)[:len(sents) - 1])
    paras = [q for q in SPOKEN.get(c["scene"], "").split("\n\n") if q.strip()]
    per = [len([x for x in re.split(r"(?<=[.?!])\s+(?=[A-Z])", q.strip()) if x.strip()]) for q in paras]
    if len(gaps) == len(sents) - 1:
        edges = [lead_trail(c["file"])] + [x for g in gaps for x in g] + [total]
        spans = [(edges[2 * i], edges[2 * i + 1]) for i in range(len(sents))]
        method = "measured pauses"
    elif sum(per) == len(sents) and len(gaps) >= len(paras) - 1 and len(paras) > 1:
        # measured paragraph pauses; sentences inside one spoken paragraph split by character share
        g = sorted(sorted(gaps, key=lambda x: x[1] - x[0], reverse=True)[:len(paras) - 1])
        edges = [lead_trail(c["file"])] + [x for q in g for x in q] + [total]
        spans, k = [], 0
        for i, n in enumerate(per):
            a, b = edges[2 * i], edges[2 * i + 1]
            group = sents[k:k + n]; chars = sum(len(x) for x in group); t = a
            for x in group:
                spans.append((t, t + (b - a) * len(x) / chars)); t += (b - a) * len(x) / chars
            k += n
        method = "measured paragraph pauses"
    else:
        chars = sum(len(s) for s in sents); t = 0.0; spans = []
        for s in sents:
            spans.append((t, t + total * len(s) / chars)); t += total * len(s) / chars
        method = "proportional"
    report.append({"scene": c["scene"], "sentences": len(sents), "pauses": len(gaps), "method": method})
    for s, (a, b) in zip(sents, spans):
        subs.append([c["start"] + a, c["start"] + b + 0.3, s])
for i in range(len(subs) - 1):
    subs[i][1] = min(subs[i][1], subs[i + 1][0] - 0.05)

def wrap(t, n=42):
    if len(t) <= n:
        return t
    mid = len(t) / 2
    best = min((i for i, ch in enumerate(t) if ch == " "), key=lambda i: abs(i - mid))
    return t[:best] + "\n" + t[best + 1:]

def ts(t):
    ms = round(t * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"

srt = "\n".join(f"{i + 1}\n{ts(a)} --> {ts(b)}\n{wrap(t)}\n" for i, (a, b, t) in enumerate(subs))
(OUT / f"{name}.en.srt").write_text(srt, encoding="utf-8")

edl = {"take": str(TAKE.name), "fps": FPS, "title_seconds": TITLE_S, "crossfade_seconds": XF, "end_card_seconds": END_S, "total_seconds": round(TOTAL, 3),
       "clips": [{"label": "vscode", "source": f"{TAKE.name}/vscode.mkv", "source_in": round(V_IN, 3), "source_out": round(V_OUT, 3),
                  "film_in": round(film_v(V_IN), 3), "film_out": round(film_v(V_OUT), 3), "framing": "full frame 1920x1080, 1:1"},
                 {"label": "chrome", "source": f"{TAKE.name}/console.mkv", "source_in": round(C_IN, 3), "source_out": round(C_OUT, 3),
                  "film_in": round(film_c(C_IN), 3), "film_out": round(film_c(C_OUT), 3),
                  "framing": f"whole Chrome window 1920x{1080 + CROP} scaled to {CW}x1080 (x={CX}), navy pillarbox"}],
       "provider_segment": ({"source": str(PROVIDER), "film_in": round(film_c(C_OUT), 3), "film_out": round(film_c(C_OUT) + P_LEN, 3),
                             "framing": "native pixels, centred on navy (no scaling)", "cut": CUT_INFO} if PROVIDER else None),
       "end_card_in": round(END_AT, 3), "pointer": {"source": "events.json pointer[] (trusted CDP mouse events)", "hidden_after_film": round(film_c(C_IN + hide_at), 3),
       "clicks_film": [round(film_c(c), 3) for c in click_t]}, "redactions": red, "narration": cues, "captions": report}
json.dump(edl, open(OUT / "edit-decision-list.json", "w", encoding="utf-8"), indent=1)
print(json.dumps({"total": round(TOTAL, 3), "mp4": str(mp4), "cues": [(c["scene"], c["start"], c["seconds"], c.get("gap_after")) for c in cues], "captions": report}, indent=1))

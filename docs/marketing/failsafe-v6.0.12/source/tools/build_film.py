"""Assemble "FailSafe: From Change to Confidence" (v6.0.12) from the genuine window recordings.

    python build_film.py <work dir> <out dir>

Inputs (work dir): take2/ and take2b/ (per-segment recordings of the VS Code window and of the Console page, with
events-<segment>.json on the capture clock), audio/master.wav. Every picture between the title card and the end card
is recorded product footage: cut for time, framed (one slow push-in, one side-by-side of the two synchronized
recordings), never retimed, recoloured or retouched. Cards are generated here from the approved logo files.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WORK, OUT = Path(sys.argv[1]), Path(sys.argv[2])
BUILD = WORK / "build"
BUILD.mkdir(parents=True, exist_ok=True)
FPS = 30
BRAND = Path(r"C:\dev\mythologiq\bob-media-handoff\bob-find-your-next-step-v1-review\brand\opener-source")
FONT = BRAND / "DMSans[opsz,wght].ttf"
MARK = BRAND / "mythologiq-silver-concept.webp"
ICON = WORK / "rig" / "vsix" / "unpacked" / "extension" / "media" / "icon.png"   # from the published 6.0.12 VSIX
NAVY = (9, 14, 28)


REUSE = False  # reuse clips already cut in this build folder


def run(*args):
    r = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("FAILED: " + " ".join(str(a) for a in args)[:600] + "\n" + r.stderr[-1500:])
    return r


EVENTS = {}


def ev(take, seg, name, nth=0, **match):
    key = (take, seg)
    if key not in EVENTS:
        EVENTS[key] = json.load(open(WORK / take / f"events-{seg}.json", encoding="utf-8"))["events"]
    hits = [e for e in EVENTS[key] if e["name"] == name and all(e.get(k) == v for k, v in match.items())]
    return hits[nth]["t"]


def font(px, weight, opsz=14):
    f = ImageFont.truetype(str(FONT), px)
    f.set_variation_by_axes([opsz, weight])
    return f


# ---------------------------------------------------------------- cards (generated; logos are the approved files)
def lockup(img, y, scale=1.0):
    """Small MythologIQ Labs lockup, centred at y (mark from the website's file, scaled down only)."""
    mark = Image.open(MARK).convert("RGBA")
    mark = mark.crop(mark.split()[3].getbbox())
    h = round(54 * scale)
    mark = mark.resize((round(mark.width * h / mark.height), h), Image.LANCZOS)
    bold, medium = font(round(26 * scale), 700, 21), font(round(26 * scale), 500, 21)
    d = ImageDraw.Draw(img)
    w = mark.width + 16 + d.textlength("MythologIQ", font=bold) + d.textlength(" Labs", font=medium)
    x = (img.width - w) / 2
    img.alpha_composite(mark, (round(x), round(y - h / 2)))
    x += mark.width + 16
    d.text((x, y), "MythologIQ", font=bold, fill=(255, 255, 255, 255), anchor="lm")
    d.text((x + d.textlength("MythologIQ", font=bold), y), " Labs", font=medium, fill=(0xD4, 0xD5, 0xDA, 255), anchor="lm")


def card(path, lines, icon_px, icon_y, with_lockup_y):
    img = Image.new("RGBA", (1920, 1080), NAVY + (255,))
    icon = Image.open(ICON).convert("RGBA")
    assert icon_px <= icon.width, "the FailSafe icon is never scaled up"
    icon = icon.resize((icon_px, icon_px), Image.LANCZOS)
    img.alpha_composite(icon, ((1920 - icon_px) // 2, icon_y))
    d = ImageDraw.Draw(img)
    for text, y, px, weight, fill in lines:
        d.text((960, y), text, font=font(px, weight, 14 if px < 40 else 30), fill=fill, anchor="mm")
    if with_lockup_y:
        lockup(img, with_lockup_y)
    img.convert("RGB").save(path)


WHITE, SILVER, DIM = (255, 255, 255, 255), (0xD4, 0xD5, 0xDA, 255), (0x9A, 0xA3, 0xB5, 255)
TITLE, END = BUILD / "card-title.png", BUILD / "card-end.png"
card(TITLE, [("FailSafe", 600, 92, 700, WHITE), ("From Change to Confidence", 690, 34, 500, SILVER)], 240, 300, 0)
card(END, [("FailSafe", 470, 96, 700, WHITE), ("Build with AI. Know what changed.", 566, 40, 500, SILVER),
           ("Version 6.0.12  ·  Free and open source", 640, 27, 500, DIM),
           ("Install “FailSafe (feat. Qor-Logic)” from the VS Code Marketplace or Open VSX", 760, 25, 500, SILVER),
           ("github.com/MythologIQ-Labs-LLC/FailSafe", 804, 25, 500, DIM)], 200, 190, 960)

# MythologIQ Labs opener (the studio's own generator), dissolving into the FailSafe title card
OPENER = BUILD / "opener"
run(sys.executable, BRAND / "make_opener.py", MARK, FONT, TITLE, OPENER)
opener = json.load(open(OPENER / "opener.json", encoding="utf-8"))

# ---------------------------------------------------------------- clips
X264 = ["-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv444p", "-r", str(FPS)]
clips = []


def base(a, b):
    return f"fps={FPS}:start_time=0,tpad=stop_mode=clone:stop_duration=60,trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS"


def clip(scene, label, take, seg, window, a, b, extra=""):
    out = BUILD / f"clip-{len(clips):02d}-{label}.mkv"
    n = round((b - a) * FPS)
    (out.exists() and REUSE) or run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-copyts", "-i", WORK / take / f"{window}-{seg}.mkv",
        "-vf", base(a, b) + extra + ",scale=1920:1080:flags=lanczos,setsar=1", "-frames:v", n, "-an", *X264, out)
    clips.append({"scene": scene, "label": label, "file": out.name, "source": f"{take}/{window}-{seg}.mkv",
                  "source_in": round(a, 3), "source_out": round(b, 3), "frames": n, "framing": extra.strip(",") or "full frame"})


def split(scene, label, take, seg, a, b):
    """Console page (left) beside the Monitor/SRE sidebar cut from the VS Code recording (right), same clock."""
    out = BUILD / f"clip-{len(clips):02d}-{label}.mkv"
    n = round((b - a) * FPS)
    lab = f"fontfile='{FONT.as_posix().replace(':', chr(92) + ':')}':fontsize=24:fontcolor=0xD4D5DA"
    fc = (f"color=c=0x090E1C:s=1920x1080:r={FPS}[bg];"
          f"[0:v]{base(a, b)},scale=1392:783:flags=lanczos[con];"
          f"[1:v]{base(a, b)},crop=360:1004:58:42,scale=-2:900:flags=lanczos[mon];"
          f"[bg][con]overlay=48:170:shortest=1[x];[x][mon]overlay=1516:104[y];"
          f"[y]drawbox=x=47:y=169:w=1394:h=785:color=0x9AA3B5@0.35:t=1,drawbox=x=1515:y=103:w=325:h=902:color=0x9AA3B5@0.35:t=1,"
          f"drawtext={lab}:text='Console':x=48:y=128,drawtext={lab}:text='Monitor  ·  SRE':x=1516:y=62[v]")
    run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-copyts", "-i", WORK / take / f"console-{seg}.mkv",
        "-copyts", "-i", WORK / take / f"vscode-{seg}.mkv", "-filter_complex", fc, "-map", "[v]", "-frames:v", n, "-an", *X264, out)
    clips.append({"scene": scene, "label": label, "file": out.name, "source": f"{take}/console-{seg}.mkv + {take}/vscode-{seg}.mkv",
                  "source_in": round(a, 3), "source_out": round(b, 3), "frames": n,
                  "framing": "side by side: Console page scaled to 72.5%, sidebar region of the VS Code window scaled to 89.6%"})


T = "take2"
# Scene 1: the workspace, FailSafe's Monitor opens
m = ev(T, "workspace", "workspace.monitor")
clip(1, "workspace", T, "workspace", "vscode", m - 3.4, m + 3.0)
# Scene 2: the Monitor (slow push-in), then the Console on first run
push = (",scale=3840:2160:flags=lanczos,zoompan=z='1+0.42*on/141':x=0:y='(ih-ih/zoom)*0.10':d=1:s=1920x1080:fps=30")
clip(2, "monitor-push-in", T, "workspace", "vscode", m + 3.0, m + 7.7, push)
b = ev(T, "setup", "setup.banner")
clip(2, "console-first-run", T, "setup", "console", b - 0.9, b + 4.9)
# Scene 2B: the real Install Qor-Logic Skills flow
c = ev(T, "setup", "setup.card")
clip(2.5, "skills-card", T, "setup", "console", c - 1.0, c + 1.8)
h = ev(T, "setup", "setup.hosts.claudeOnly")
clip(2.5, "skills-modal", T, "setup", "console", h - 1.2, h + 1.0)
d = ev(T, "setup", "setup.vscode.dialog")
clip(2.5, "vscode-approval", T, "setup", "vscode", d + 0.6, d + 3.0)
i = ev(T, "setup", "setup.installed")
clip(2.5, "skills-installed", T, "setup", "console", i - 1.0, i + 1.2)
o = ev(T, "setup", "setup.overview.noBanner")
clip(2.5, "console-ready", T, "setup", "console", o + 0.8, o + 3.1)
# Scene 3: one theme everywhere (take2b: the theme scene recorded again after the journey; see capture log)
B = "take2b"
p1 = ev(B, "themes", "theme.applied", 0, theme="pegasus")
au = ev(B, "themes", "theme.applied", 0, theme="aurora")
rl = ev(B, "themes", "themes.reload.monitor")
my = ev(B, "themes", "theme.applied", 0, theme="mythiq")
split(3, "theme-pegasus", B, "themes", p1 - 2.0, p1 + 4.0)
split(3, "theme-sre-aurora", B, "themes", au - 4.1, au + 2.6)
split(3, "theme-reload", B, "themes", rl - 0.4, rl + 2.2)
split(3, "theme-mythiq", B, "themes", my - 0.7, my + 1.4)
# Scene 4: the issue, the regression test, the failing run
clip(4, "issue", T, "issue", "vscode", ev(T, "issue", "issue.open") + 0.5, ev(T, "issue", "issue.open") + 4.0)
s = ev(T, "issue", "issue.test.saved")
clip(4, "regression-test", T, "issue", "vscode", s - 0.8, s + 3.4)
f = ev(T, "issue", "issue.npmtest.fail")
clip(4, "test-fails", T, "issue", "vscode", f + 0.3, f + 6.6)
# Scene 5: the fix and FailSafe's response
x = ev(T, "fix", "fix.saved")
clip(5, "fix-and-notice", T, "fix", "vscode", x - 1.2, x + 5.3)
g = ev(T, "fix", "fix.console.mode")
clip(5, "governance-mode", T, "fix", "console", g + 1.2, g + 3.6)
a_ = ev(T, "fix", "fix.console.audit")
clip(5, "audit-after-fix", T, "fix", "console", a_ + 0.8, a_ + 3.3)
# Scene 6: verify
v = ev(T, "verify", "verify.npmtest.pass")
clip(6, "tests-pass", T, "verify", "vscode", v + 0.6, v + 4.6)
df = ev(T, "verify", "verify.diff")
clip(6, "diff", T, "verify", "vscode", df + 0.5, df + 4.3)
va = ev(T, "verify", "verify.console.audit")
clip(6, "audit-log", T, "verify", "console", va + 0.8, va + 4.2)
# Scene 7: evidence and what is still pending
r = ev(T, "decision", "decision.risks")
clip(7, "risks", T, "decision", "console", r + 0.8, r + 2.5)
cp = ev(T, "decision", "decision.compliance")
clip(7, "compliance", T, "decision", "console", cp + 0.6, cp + 3.8)
dl = ev(T, "decision", "decision.delivery")
clip(7, "delivery-pending", T, "decision", "console", dl + 0.8, dl + 4.3)
ov = ev(T, "decision", "decision.overview")
clip(7, "overview", T, "decision", "console", ov + 0.8, ov + 5.0)
# Scene 8: closing two-shot
tw = ev(T, "closing", "closing.twoShot")
clip(8, "closing-two-shot", T, "closing", "vscode", tw + 1.0, tw + 5.5)

(BUILD / "concat.txt").write_text("".join(f"file '{c['file']}'\n" for c in clips), encoding="utf-8")
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", BUILD / "concat.txt", "-c", "copy", BUILD / "body.mkv")
body_s = sum(c["frames"] for c in clips) / FPS

# ---------------------------------------------------------------- intro + body + end card
INTRO_HOLD, XF, END_S, FADE_OUT = 2.3, 0.5, 9.7, 0.8
(BUILD / "opener.txt").write_text("".join(f"file '{Path(p).as_posix()}'\nduration {1 / FPS:.6f}\n" for p in opener["frames"]), encoding="utf-8")
intro_s = opener["seconds"] + INTRO_HOLD
total = intro_s - XF + body_s - XF + END_S
fc = (f"[0:v]fps={FPS},scale=1920:1080:flags=lanczos,format=yuv444p[op];[1:v]fps={FPS},format=yuv444p[tc];[op][tc]concat=n=2:v=1,settb=AVTB,setpts=PTS-STARTPTS[intro];"
      f"[2:v]fps={FPS},format=yuv444p,settb=AVTB,setpts=PTS-STARTPTS[body];[3:v]fps={FPS},format=yuv444p,settb=AVTB[end];"
      f"[intro][body]xfade=transition=fade:duration={XF}:offset={intro_s - XF:.3f}[ib];"
      f"[ib][end]xfade=transition=fade:duration={XF}:offset={intro_s - XF + body_s - XF:.3f}[all];"
      f"[all]fade=t=out:st={total - FADE_OUT:.3f}:d={FADE_OUT},format=yuv420p[v]")
picture = BUILD / "picture.mkv"
run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", BUILD / "opener.txt",
    "-loop", "1", "-t", INTRO_HOLD, "-i", TITLE, "-i", BUILD / "body.mkv", "-loop", "1", "-t", END_S, "-i", END,
    "-filter_complex", fc, "-map", "[v]", "-t", f"{total:.3f}", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-r", FPS, picture)

t = intro_s - XF
for c in clips:
    c["film_in"] = round(t, 3)
    t += c["frames"] / FPS
    c["film_out"] = round(t, 3)
edl = {"fps": FPS, "intro_seconds": intro_s, "crossfade_seconds": XF, "body_seconds": round(body_s, 3), "end_card_seconds": END_S,
       "total_seconds": round(total, 3), "clips": clips}
json.dump(edl, open(BUILD / "edit-decision-list.json", "w", encoding="utf-8"), indent=1)
print(json.dumps({k: v for k, v in edl.items() if k != "clips"}))
for c in clips:
    print(f"{c['film_in']:7.2f}-{c['film_out']:7.2f}  scene {c['scene']}  {c['label']}")

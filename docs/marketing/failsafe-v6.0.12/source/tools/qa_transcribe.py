"""Transcribe the finished film's audio with Sonic Rift's own transcriber (Whisper) and compare it with the script."""
import json, re, sys
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
APP, WAV, LINES, OUT = sys.argv[1:5]
sys.path.insert(0, APP)
from this_voice_thing.core import transcription
a, r = sf.read(WAV, dtype="float32", always_2d=True)
x = resample_poly(a.mean(axis=1), 16000, r).astype(np.float32)
heard = transcription.Transcriber().transcribe(x, language="en").text.strip()
norm = lambda t: re.sub(r"[^a-z0-9' ]", " ", t.lower().replace("’", "'").replace("-", " ")).split()
want = norm(" ".join(json.load(open(LINES, encoding="utf-8")).values()).replace("6.0.12", "6 0 12").replace("Qor-Logic", "core logic").replace("FailSafe", "failsafe"))
got = norm(heard.replace("6.0.12", "6 0 12"))
missing = [w for w in want if w not in got]; extra = [w for w in got if w not in want]
json.dump({"heard": heard, "script_words": len(want), "heard_words": len(got), "missing": missing, "extra": extra}, open(OUT, "w", encoding="utf-8"), indent=1)
print(len(want), len(got), "missing", missing, "extra", extra); print(heard)

"""Objective checks on Sonic Rift takes, run in the installed Sonic Rift Python (its transcriber and the
Chatterbox voice encoder installed with it). It does not pick a performance on its own: it reports wording,
pace, pitch, level and voice consistency so a listener's choice can be checked.

    python score_takes.py "<install>" <out.json> <expected.json> <wav> [<wav> ...]

expected.json maps a take's file name prefix (e.g. "VO_S01" or "narrator-design") to the words it should say.
With REFERENCE=<wav[,wav]> it also reports each take's voice similarity to that reference.
"""
import glob
import json
import os
import re
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

APP, OUT, EXPECTED, *WAVS = sys.argv[1:]
sys.path.insert(0, APP)
from chatterbox.models.voice_encoder import VoiceEncoder  # noqa: E402
from safetensors.torch import load_file  # noqa: E402
from this_voice_thing.core import transcription  # noqa: E402

expected = json.load(open(EXPECTED, encoding="utf-8-sig"))
enc = VoiceEncoder()
enc.load_state_dict(load_file(glob.glob(os.path.expanduser(
    r"~\.cache\huggingface\hub\models--ResembleAI--chatterbox\snapshots\*\ve.safetensors"))[0]))
enc.eval()
T = transcription.Transcriber()


def load(path):
    a, r = sf.read(path, dtype="float32", always_2d=True)
    return a, r


def mono16(a, r):
    return resample_poly(a.mean(axis=1), 16000, r).astype(np.float32)


def words(t):
    return re.sub(r"[^a-z0-9' ]", " ", t.lower().replace("’", "'")).split()


def frames_db(x, rate, hop_s=0.02):
    hop = int(rate * hop_s)
    return np.array([20 * np.log10(np.sqrt(np.mean(x[i:i + hop] ** 2)) + 1e-9) for i in range(0, len(x) - hop, hop)])


def pitch_hz(x16):
    try:
        import librosa
        f0, voiced, _ = librosa.pyin(x16, fmin=60, fmax=400, sr=16000, frame_length=1024)
        f0 = f0[voiced & ~np.isnan(f0)]
        return (round(float(np.median(f0)), 1), round(float(np.percentile(f0, 90) - np.percentile(f0, 10)), 1)) if len(f0) else (None, None)
    except Exception:
        return (None, None)


ref = None
if os.environ.get("REFERENCE"):
    ref = VoiceEncoder.utt_to_spk_embed(enc.embeds_from_wavs(
        [mono16(*load(p)) for p in os.environ["REFERENCE"].split(",")], sample_rate=16000))

rows = []
for path in WAVS:
    name = os.path.basename(path)
    key = next((k for k in sorted(expected, key=len, reverse=True) if name.startswith(k)), None)
    a, r = load(path)
    x16 = mono16(a, r)
    db = frames_db(x16, 16000)
    speech = db > (db.max() - 35)
    longest_gap = 0.0
    run = 0
    for s in speech:
        run = 0 if s else run + 1
        longest_gap = max(longest_gap, run * 0.02)
    heard = T.transcribe(x16, language="en").text.strip()
    want = words(expected[key]) if key else []
    got = words(heard)
    missing = [w for w in want if w not in got]
    extra = [w for w in got if w not in want]
    f0, f0_range = pitch_hz(x16)
    emb = enc.embeds_from_wavs([x16], sample_rate=16000)[0]
    row = {
        "file": name, "expected_key": key, "seconds": round(len(a) / r, 2), "sample_rate": r, "channels": a.shape[1],
        "speech_seconds": round(float(speech.sum() * 0.02), 2),
        "words_per_second": round(len(want) / max(float(speech.sum() * 0.02), 0.1), 2) if want else None,
        "peak_dbfs": round(float(20 * np.log10(np.abs(a).max() + 1e-9)), 2),
        "rms_dbfs": round(float(20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)), 2),
        "clipped_samples": int((np.abs(a) >= 0.999).sum()),
        "longest_internal_pause_s": round(longest_gap, 2),
        "median_pitch_hz": f0, "pitch_range_p10_p90_hz": f0_range,
        "heard": heard, "missing_words": missing, "extra_words": extra,
    }
    if ref is not None:
        row["similarity_to_reference"] = round(float(np.dot(ref, emb) / (np.linalg.norm(ref) * np.linalg.norm(emb))), 4)
    row["_emb"] = emb.tolist()
    rows.append(row)

# Voice consistency: each take against the mean of all the others
E = np.array([r.pop("_emb") for r in rows])
for i, row in enumerate(rows):
    if len(rows) > 1:
        rest = VoiceEncoder.utt_to_spk_embed(np.delete(E, i, axis=0))
        row["similarity_to_other_takes"] = round(float(E[i] @ rest / np.linalg.norm(E[i]) / np.linalg.norm(rest)), 4)
json.dump({"app": APP, "takes": rows}, open(OUT, "w", encoding="utf-8"), indent=1)
for row in rows:
    print(row["file"], f'{row["seconds"]}s', "wps", row["words_per_second"], "f0", row["median_pitch_hz"], row["pitch_range_p10_p90_hz"],
          "peak", row["peak_dbfs"], "gap", row["longest_internal_pause_s"], "sim", row.get("similarity_to_reference"), row.get("similarity_to_other_takes"),
          "missing", row["missing_words"], "extra", row["extra_words"], "|", row["heard"])

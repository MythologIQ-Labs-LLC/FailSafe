"""Lay the selected narration takes on a Sonic Rift Studio timeline and export the master with the app's own
mix engine (this_voice_thing.core: audio_project, audio_project_media, audio_project_export), headless.

    <Sonic Rift>\\.venv\\Scripts\\python.exe mix_narration.py "<Sonic Rift install>" <profile dir> <cues.json> <out dir>

cues.json: [{"scene": "S01", "file": "<take wav>", "start": 1.0, "text": "..."}, ...]  (start in film seconds)
Writes <out dir>/failsafe-6.0.12-film.sonicrift.json and <out dir>/export/ (master.wav, stems, manifest.json).
No processing happens here beyond what the app's export does: timeline placement, then its -16 LUFS master.
"""
import json
import sys
from pathlib import Path

APP, PROFILE, CUES, OUT = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
sys.path.insert(0, APP)
import soundfile as sf  # noqa: E402

from this_voice_thing import __version__  # noqa: E402
from this_voice_thing.core import audio_project as ap  # noqa: E402
from this_voice_thing.core.audio_project_export import export_project  # noqa: E402
from this_voice_thing.core.audio_project_media import ProjectMedia  # noqa: E402

RATE = 48000
PROFILE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
media = ProjectMedia(str(PROFILE), None)
cues = json.load(open(CUES, encoding="utf-8"))
clips, log = [], []
for cue in cues:
    audio, rate = sf.read(cue["file"], dtype="float32", always_2d=False)
    asset = media.import_voice_take(audio, int(rate))
    frames = round(len(audio) * RATE / rate)
    clips.append(ap.Clip(id=ap.new_id(), kind="voice", start_frame=round(cue["start"] * RATE), frame_count=frames,
                         asset_id=asset, text=cue["text"][:2000]))
    log.append({"scene": cue["scene"], "take": Path(cue["file"]).name, "source_rate": int(rate), "seconds": round(len(audio) / rate, 3),
                "start": cue["start"], "end": round(cue["start"] + len(audio) / rate, 3), "asset_id": asset})
project = ap.AudioProject(id=ap.new_id(), title="FailSafe 6.0.12: From Change to Confidence", sample_rate=RATE,
                          tracks=[ap.Track(id=ap.new_id(), kind="voice", name="Narration (Guide)", clips=clips)])
project.validate()
project_file = OUT / "failsafe-6.0.12-film.sonicrift.json"
ap.save_project(str(project_file), project)
export_dir = OUT / "export"
result = export_project(project, media, str(export_dir), target_lufs=-16.0, formats=("wav",), use_ducking=False, include_stems=True)
json.dump({"sonic_rift_version": __version__, "app": APP, "project": project_file.name, "export": str(export_dir), "cues": log,
           "export_result": result if isinstance(result, (dict, list, str, int, float, type(None))) else str(result)},
          open(OUT / "mix-log.json", "w", encoding="utf-8"), indent=1, default=str)
print("sonic rift", __version__, "clips", len(clips), "export", export_dir)

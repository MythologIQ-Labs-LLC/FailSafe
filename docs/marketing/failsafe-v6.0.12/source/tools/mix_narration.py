"""Lay the selected narration takes (and, optionally, a music bed) on a Sonic Rift Studio timeline and export the
master with the app's own mix engine (this_voice_thing.core: audio_project, audio_project_media, audio_project_duck,
audio_project_export), headless.

    <Sonic Rift>\\.venv\\Scripts\\python.exe mix_narration.py "<Sonic Rift install>" <profile dir> <cues.json> <out dir>

cues.json: [{"scene": "S01", "file": "<take wav>", "start": 1.0, "text": "..."}, ...]  (start in film seconds)
Environment (all optional):
    PROJECT_NAME     file stem for the project and export folder (default failsafe-6.0.12-film)
    MUSIC            a music take WAV made on Sonic Rift's Music page; it is kept in the profile's Sound Library
                     (the app's own "keep") and placed on a Sound track from 0 s to FILM_SECONDS
    MUSIC_GAIN_DB    Sound track level (Studio's Levels panel), default -14
    DUCK_DB          how far the Sound track drops while the voice is speaking (Studio's ducking), default -9
    FILM_SECONDS     length of the bed, default 113.5; FADE_IN / FADE_OUT seconds, default 1.5 / 4.0
Writes <out dir>/<PROJECT_NAME>.sonicrift.json and <out dir>/<export folder>/ (master.wav, stems, manifest.json).
No processing happens here beyond what the app's export does: timeline placement, ducking, then its -16 LUFS master.
"""
import json
import os
import sys
from pathlib import Path

APP, PROFILE, CUES, OUT = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
sys.path.insert(0, APP)
import soundfile as sf  # noqa: E402

from this_voice_thing import __version__  # noqa: E402
from this_voice_thing.core import audio_project as ap  # noqa: E402
from this_voice_thing.core.audio_project_export import export_project  # noqa: E402
from this_voice_thing.core.audio_project_media import ProjectMedia  # noqa: E402
from this_voice_thing.core.soundscape import assets as sound_assets  # noqa: E402

RATE = 48000
NAME = os.environ.get("PROJECT_NAME", "failsafe-6.0.12-film")
MUSIC = os.environ.get("MUSIC", "")
MUSIC_GAIN = float(os.environ.get("MUSIC_GAIN_DB", "-14"))
DUCK = float(os.environ.get("DUCK_DB", "-9"))
FILM = float(os.environ.get("FILM_SECONDS", "113.5"))
FADE_IN, FADE_OUT = float(os.environ.get("FADE_IN", "1.5")), float(os.environ.get("FADE_OUT", "4.0"))
PROFILE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
library = sound_assets.AssetLibrary(str(PROFILE))
media = ProjectMedia(str(PROFILE), library)
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
tracks = [ap.Track(id=ap.new_id(), kind="voice", name="Narration", clips=clips)]
music_log = None
if MUSIC:
    audio, rate = sf.read(MUSIC, dtype="float32", always_2d=True)
    name = "FailSafe film bed " + Path(MUSIC).stem
    asset = next((a for a in library.assets if a.name == name), None) or library.add(audio, int(rate), name, "ace_step_15", False)
    library.save()
    frames = min(round(FILM * RATE), round(len(audio) * RATE / rate))
    tracks.append(ap.Track(id=ap.new_id(), kind="sound", name="Music bed", gain_db=MUSIC_GAIN, clips=[
        ap.Clip(id=ap.new_id(), kind="sound", start_frame=0, frame_count=frames, asset_id="sound_" + asset.id,
                fade_in_frames=round(FADE_IN * RATE), fade_out_frames=round(FADE_OUT * RATE))]))
    music_log = {"take": Path(MUSIC).name, "sound_library_asset": asset.id, "track_gain_db": MUSIC_GAIN, "duck_db": DUCK,
                 "seconds": round(frames / RATE, 3), "fade_in_s": FADE_IN, "fade_out_s": FADE_OUT}
project = ap.AudioProject(id=ap.new_id(), title="FailSafe 6.0.12: From Change to Confidence", sample_rate=RATE, tracks=tracks,
                          duck_db=DUCK if MUSIC else ap.DEFAULT_DUCK_DB)
project.validate()
project_file = OUT / f"{NAME}.sonicrift.json"
ap.save_project(str(project_file), project)
export_dir = OUT / ("export" if NAME == "failsafe-6.0.12-film" else f"export-{NAME}")
result = export_project(project, media, str(export_dir), target_lufs=-16.0, formats=("wav",), use_ducking=bool(MUSIC), include_stems=True)
json.dump({"sonic_rift_version": __version__, "app": APP, "project": project_file.name, "export": export_dir.name, "cues": log, "music": music_log,
           "export_result": result if isinstance(result, (dict, list, str, int, float, type(None))) else str(result)},
          open(OUT / (f"mix-log-{NAME}.json" if NAME != "failsafe-6.0.12-film" else "mix-log.json"), "w", encoding="utf-8"), indent=1, default=str)
print("sonic rift", __version__, "clips", len(clips), "music", bool(MUSIC), "export", export_dir)

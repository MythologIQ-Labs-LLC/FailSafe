"""Music bed for "FailSafe: From Change to Confidence" (v6.0.12): Sonic Rift 0.9.1's Music page (ACE-Step 1.5, MIT), in the
installed app, off-screen. One Generate composes TAKES candidate takes of one through-composed cue; every WAV is the
app's own take file, copied with its take metadata. Adapted from the B.O.B. film's sonic_rift_music.py.

    QT_SCALE_FACTOR=1.5 MEDIA_PROFILE=<fresh profile> MUSIC_PROMPT=... MUSIC_STYLE=<json> [TAKES=3] [SECONDS=116] [SEED=...] [BPM=84] [KEY="D major"] \n        "<install>\.venv\Scripts\python.exe" failsafe_music.py "<install>" <out dir> dark 1600x900
"""
import json
import dataclasses
import faulthandler
import os
import shutil
import sys

if os.environ.get("STALL_DUMP"):  # diagnostics: dump every thread's stack if the run stalls
    faulthandler.dump_traceback_later(int(os.environ["STALL_DUMP"]), repeat=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sonic_rift_harness import *  # noqa: E402,F401,F403

TAKES = int(os.environ.get("TAKES", "4"))
SECONDS = int(os.environ.get("SECONDS", "120"))
SEED = int(os.environ.get("SEED", "20261103"))
BPM = int(os.environ.get("BPM", "76"))
KEY = os.environ.get("KEY", "D major")
PROMPT = os.environ["MUSIC_PROMPT"]
STYLE = json.loads(os.environ.get("MUSIC_STYLE", "{}"))


def plain(value):
    if dataclasses.is_dataclass(value):
        return {k: plain(v) for k, v in dataclasses.asdict(value).items()}
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    return value if isinstance(value, (str, int, float, bool, type(None))) else str(value)


try:
    from this_voice_thing import __version__
    from this_voice_thing.core.music import catalog as music_catalog
    LOG["app"] = {"version": __version__, "root": ROOT, "python": sys.executable, "profile": os.environ.get("MEDIA_PROFILE")}
    answered = []
    w.confirm_heavy_job = lambda cost, title: (answered.append(f"{title}: {cost.label}"), True)[1]
    w.show_page(w.PAGE_MUSIC)
    w.music_instrumental_checkbox.setChecked(True)
    w.music_plan_checkbox.setChecked(True)
    w.music_seconds_spin.setValue(SECONDS)
    w.music_takes_spin.setValue(TAKES)
    w.music_seed_spin.setValue(SEED)
    w.music_bpm_checkbox.setChecked(True)
    w.music_bpm_spin.setValue(BPM)
    w.music_key_combo.setCurrentIndex(w.music_key_combo.findData(KEY))
    w.music_meter_combo.setCurrentIndex(w.music_meter_combo.findData(4))
    w.music_prompt_input.setPlainText(PROMPT)
    for name, field in w.music_style_inputs.items():
        field.setText(STYLE.get(name, ""))
    request = w.music_request()
    if request.prompt != PROMPT:
        raise RuntimeError(f"the Music prompt is not the brief: {request.prompt!r}")
    engine = music_catalog.ENGINES[request.engine]
    from this_voice_thing.core.music import contract as music_contract
    problems = music_contract.validate(request, engine.capabilities)
    if problems:  # the page would show these in a dialog (stubbed off-screen) and silently not start
        raise RuntimeError("Music would refuse this request: " + " ".join(problems))
    LOG["caption_chars"] = len(request.caption())
    w.start_music()
    if wait_for(lambda: w.music_job is None and getattr(w, "music_task", None) is None and len(w.music_takes()) >= 1,
                5400, 1.0) is None:
        raise RuntimeError("music did not finish")
    takes = []
    for index, take in enumerate(w.music_takes()):
        dest = os.path.join(OUT, f"MUSIC_bed_take{chr(ord('A') + index)}.wav")
        shutil.copyfile(take.path, dest)
        takes.append({"file": dest, "take": plain(take)})
    shot("music_page")
    LOG["music"] = {"engine": engine.label, "repo_id": engine.repo_id, "model_revision": engine.model_revision,
                    "license": engine.license_name, "request": plain(request), "answered": answered, "takes": takes,
                    "result": {k: v for k, v in plain(w.music_result).items() if k != "takes"}}
except Exception:
    LOG["exception"] = traceback.format_exc()
finish()

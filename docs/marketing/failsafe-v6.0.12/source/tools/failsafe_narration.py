"""Narration for "FailSafe: From Change to Confidence" (v6.0.12), made in the installed Sonic Rift 0.9.1
(its own Python, models and UI code; the window stays off-screen). Nothing here synthesizes audio itself:
every WAV is a take the app saved.

The narrator is the existing synthetic "Guide" voice design (Qwen3 voice design, owner-picked 2026-10-30 for
the Sonic Rift film): Voices > New voice > Clone with the design clip as is, saved as a clip voice, then
Speech with Qwen3 voice cloning, TAKES takes of each line.

    QT_SCALE_FACTOR=1.5 MEDIA_PROFILE=<fresh profile> DESIGN=<guide-A.wav> LINES_FILE=<lines-spoken.json> [TAKES=4] \
        [ONLY=S03,S05] [TAKE_PREFIX=r2-] "<install>\.venv\Scripts\python.exe" failsafe_narration.py "<install>" <out dir> dark 1600x900

Adapted from demo-v091/tools/gen_guide.py and the B.O.B. film's sonic_rift_narration.py, which drive the same app.
"""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sonic_rift_harness import *  # noqa: E402,F401,F403

TAKES = int(os.environ.get("TAKES", "4"))
LINES = json.load(open(os.environ["LINES_FILE"], encoding="utf-8-sig"))
DESIGN = os.environ["DESIGN"]
SAYS = os.environ.get("SAYS", "A world can begin with just a few words.")
NARRATOR = os.environ.get("NARRATOR", "Guide")
ONLY = [s for s in os.environ.get("ONLY", "").split(",") if s]
TAKE_PREFIX = os.environ.get("TAKE_PREFIX", "")

try:
    from this_voice_thing import __version__
    from this_voice_thing.ui.pages import studio as studio_page
    LOG["app"] = {"version": __version__, "root": ROOT, "python": sys.executable, "profile": os.environ.get("MEDIA_PROFILE")}
    w.load_model(next(e for e in w.model_entries if e.get("label") == "Qwen3 voice cloning"))
    wait_for(lambda: w.model is not None and not w.model_is_loading, 1800, 0.3)

    class _SaveVoice:
        def __init__(self, _title, voice, *_a, **_k):
            self.voice = voice

        def exec(self):
            return 1

        def apply(self):
            self.voice.name = NARRATOR
            self.voice.tags = ["FailSafe 6.0.12 film", "synthetic", "designed"]
    studio_page.VoiceDetailsDialog = _SaveVoice
    w.studio_play_take = lambda *a, **k: None
    w.show_page(w.PAGE_STUDIO)
    w.set_studio_mode("clone")
    w.studio_set_source(DESIGN, SAYS, f"{NARRATOR} (designed)")
    row = max(i for i, take in enumerate(w.studio_takes) if take.origin == "source")
    w.studio_take_list.setCurrentRow(row)
    w.studio_save_voice()
    narrator = next(v for v in w.voice_library.voices if v.name == NARRATOR)
    w.take_audio_out.setVolume(0.0)
    w.show_page(w.PAGE_GENERATE)
    w.use_voice(narrator)
    # Speech > Finishing touches: the app's own Speed and Paragraph pause sliders (round 2: slower pace).
    if os.environ.get("SPEED"):
        w.speed_slider.set_value(float(os.environ["SPEED"]))
    if os.environ.get("PAUSE"):
        w.pause_slider.set_value(float(os.environ["PAUSE"]))
    LOG["finishing"] = w.current_finishing_settings().__dict__
    results = {}
    for scene, line in LINES.items():
        if ONLY and scene not in ONLY:
            continue
        w.text_input.setPlainText(line)
        takes = []
        for n in range(TAKES):
            before = w.current_audio_file
            w.start_generation()
            if wait_for(lambda: not w.is_generating and w.current_audio_file != before, 1800, 0.1) is None:
                raise RuntimeError(f"{scene} take {n + 1} did not finish")
            dest = os.path.join(OUT, f"VO_{scene}_{TAKE_PREFIX}take{n + 1}.wav")
            shutil.copyfile(w.current_audio_file, dest)
            takes.append({"file": dest, "app_output": w.current_audio_file})
            w.stop_audio()
        results[scene] = {"text_as_entered": line, "takes": takes}
        LOG["lines"] = results
        save_log()
    shot("narrator_speech_page")
    LOG["narrator_voice"] = {"name": narrator.name, "kind": narrator.kind, "origin": narrator.origin,
                             "clip": narrator.clip, "source_design": DESIGN, "says": SAYS, "model": "Qwen3 voice cloning"}
    LOG["settings"] = {k: w.app_settings.get(k) for k in ("sampling", "finishing", "qwen")}
except Exception:
    LOG["exception"] = traceback.format_exc()
finish()

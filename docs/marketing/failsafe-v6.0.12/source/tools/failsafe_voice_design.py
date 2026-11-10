"""Narrator voice candidates for the FailSafe 6.0.12 film, made in the installed Sonic Rift 0.9.1 (off-screen window).

    PHASE=design   Voices > New voice > Design with Qwen3 voice design: TAKES voices from one written description
                   (each take is a different synthetic voice saying the app's design passage).
    PHASE=samples  For each design clip: Voices > New voice > Clone (clip as is), save it, then Speech with
                   Qwen3 voice cloning reads SAMPLE once, so the candidates can be compared on a real line.

    QT_SCALE_FACTOR=1.5 MEDIA_PROFILE=<fresh profile> PHASE=... [DESCRIPTION=...] [TAKES=4] [SAMPLE=...] [SPEED=1.0] \
        "<install>\\.venv\\Scripts\\python.exe" failsafe_voice_design.py "<install>" <out dir> dark 1600x900

Adapted from the B.O.B. film's sonic_rift_narration.py. Nothing here synthesizes audio itself.
"""
import glob
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sonic_rift_harness import *  # noqa: E402,F401,F403

PHASE = os.environ["PHASE"]
TAKES = int(os.environ.get("TAKES", "4"))
PREFIX = os.environ.get("PREFIX", "narrator-design")
DESCRIPTION = os.environ.get("DESCRIPTION", "")
SAMPLE = os.environ.get("SAMPLE", "")


def pick_engine(combo, label):
    for index in range(combo.count()):
        entry = next((e for e in w.model_entries if w.entry_key(e) == combo.itemData(index)), None)
        if entry and entry.get("label") == label:
            combo.setCurrentIndex(index)
            return entry
    raise RuntimeError(f"no {label} entry in the Studio engine list")


def design():
    from this_voice_thing.core import voice_studio
    w.studio_play_take = lambda *a, **k: None
    w.show_page(w.PAGE_STUDIO)
    w.set_studio_mode("design")
    entry = pick_engine(w.studio_engine_combo, "Qwen3 voice design")
    w.studio_description_input.setText(DESCRIPTION)
    w.studio_count_spin.setValue(TAKES)
    w.studio_make_takes()
    done = wait_for(lambda: sum(1 for t in w.studio_takes if t.origin == "design") >= TAKES
                    and getattr(w, "studio_thread", None) is not None and not w.studio_thread.isRunning(), 3600, 0.5)
    if done is None:
        raise RuntimeError("design takes did not finish")
    takes = []
    for n, take in enumerate(t for t in w.studio_takes if t.origin == "design"):
        dest = os.path.join(OUT, f"{PREFIX}-{n + 1}.wav")
        shutil.copyfile(take.path, dest)
        takes.append({"file": dest, "label": take.label, "says": take.text, "seconds": round(take.seconds, 2)})
    LOG["design"] = {"engine": entry["label"], "repo_id": entry["repo_id"], "license": entry.get("license"),
                     "description": DESCRIPTION, "passage": voice_studio.DESIGN_PASSAGE, "takes": takes}


def samples():
    from this_voice_thing.core import voice_studio
    from this_voice_thing.ui.pages import studio as studio_page
    name = {"value": ""}

    class _SaveVoice:
        def __init__(self, _title, voice, *_a, **_k):
            self.voice = voice

        def exec(self):
            return 1

        def apply(self):
            self.voice.name = name["value"]
            self.voice.tags = ["FailSafe 6.0.12 film", "synthetic", "designed", "candidate"]
    studio_page.VoiceDetailsDialog = _SaveVoice
    w.load_model(next(e for e in w.model_entries if e.get("label") == "Qwen3 voice cloning"))
    wait_for(lambda: w.model is not None and not w.model_is_loading, 1800, 0.3)
    w.studio_play_take = lambda *a, **k: None
    w.take_audio_out.setVolume(0.0)
    results = []
    for clip in sorted(glob.glob(os.path.join(OUT, f"{PREFIX}-*.wav"))):
        tag = os.path.splitext(os.path.basename(clip))[0]
        if tag.endswith("-sample"):
            continue
        name["value"] = tag
        w.show_page(w.PAGE_STUDIO)
        w.set_studio_mode("clone")
        w.studio_set_source(clip, voice_studio.DESIGN_PASSAGE, f"{tag} (designed)")
        row = max(i for i, take in enumerate(w.studio_takes) if take.origin == "source")
        w.studio_take_list.setCurrentRow(row)
        w.studio_save_voice()
        voice = next(v for v in w.voice_library.voices if v.name == tag)
        w.show_page(w.PAGE_GENERATE)
        w.use_voice(voice)
        if os.environ.get("SPEED"):
            w.speed_slider.set_value(float(os.environ["SPEED"]))
        w.text_input.setPlainText(SAMPLE)
        before = w.current_audio_file
        w.start_generation()
        if wait_for(lambda: not w.is_generating and w.current_audio_file != before, 1800, 0.1) is None:
            raise RuntimeError(f"{tag}: sample did not finish")
        dest = os.path.join(OUT, f"{tag}-sample.wav")
        shutil.copyfile(w.current_audio_file, dest)
        w.stop_audio()
        results.append({"voice": tag, "design_clip": clip, "sample": dest})
        LOG["samples"] = results
        save_log()
    LOG["sample_text"] = SAMPLE
    LOG["finishing"] = w.current_finishing_settings().__dict__


try:
    from this_voice_thing import __version__
    LOG["app"] = {"version": __version__, "root": ROOT, "python": sys.executable, "profile": os.environ.get("MEDIA_PROFILE")}
    LOG["phase"] = PHASE
    design() if PHASE == "design" else samples()
except Exception:
    LOG["exception"] = traceback.format_exc()
finish()

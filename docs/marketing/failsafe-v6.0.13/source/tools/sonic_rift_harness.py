"""Drive the real Sonic Rift window off-screen for UI review and marketing captures.

    python <script> <repo root> <out dir> [dark|light] [WxH]

The window is never shown on the desktop (WA_DontShowOnScreen; grab() still renders it).
Modal dialogs are stubbed and recorded, the default model load and the local API server are
skipped, and everything the app writes stays in the repo root it is given (a worktree profile).
"""
import json
import os
import sys
import time
import traceback

ROOT, OUT = sys.argv[1], sys.argv[2]
THEME = sys.argv[3] if len(sys.argv) > 3 else "dark"
SIZE = tuple(int(v) for v in (sys.argv[4] if len(sys.argv) > 4 else "1600x900").split("x"))
os.chdir(ROOT)
sys.path.insert(0, ROOT)
sys.argv = ["main.py"]
os.makedirs(OUT, exist_ok=True)

from unittest.mock import patch  # noqa: E402

from PySide6.QtCore import QEventLoop, Qt, QTimer  # noqa: E402
from PySide6.QtWidgets import QApplication, QDialog, QFileDialog, QInputDialog, QMessageBox  # noqa: E402

from this_voice_thing.ui import main_window, taskbar  # noqa: E402
from this_voice_thing.ui import theme as ui_theme  # noqa: E402

DIALOGS = []
INPUT = {"text": "Demo", "multiline": ""}


def _dialog(kind):
    def stub(*args, **kwargs):
        DIALOGS.append({"kind": kind, "text": [a for a in args if isinstance(a, str)][:2]})
        return QMessageBox.StandardButton.Yes if kind == "question" else QMessageBox.StandardButton.Ok
    return stub


for p in (
    patch.object(QMessageBox, "information", _dialog("information")),
    patch.object(QMessageBox, "warning", _dialog("warning")),
    patch.object(QMessageBox, "critical", _dialog("critical")),
    patch.object(QMessageBox, "question", _dialog("question")),
    patch.object(QInputDialog, "getText", lambda *a, **k: (INPUT["text"], True)),
    patch.object(QInputDialog, "getMultiLineText", lambda *a, **k: (INPUT["multiline"], True)),
    patch.object(QFileDialog, "getOpenFileName", lambda *a, **k: ("", "")),
    patch.object(main_window.SonicRiftApp, "start_default_model_load", lambda self: None),
    patch.object(main_window.SonicRiftApp, "restart_api_server", lambda self: None),
):
    p.start()


def pump(seconds):
    loop = QEventLoop()
    QTimer.singleShot(int(seconds * 1000), loop.quit)
    loop.exec()


def wait_for(cond, timeout, step=0.05):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if cond():
            return time.monotonic() - start
        pump(step)
    return None


# A fresh profile per run (settings, outputs, libraries), so captures start clean and never touch
# the worktree's or the owner's data. Engines still come from the repo (paths.ENGINES_DIR).
PROFILE = os.environ.get("MEDIA_PROFILE")
if PROFILE:
    import shutil
    from this_voice_thing import paths
    os.makedirs(PROFILE, exist_ok=True)
    if not os.path.exists(os.path.join(PROFILE, "models.json")):
        shutil.copy(os.path.join(ROOT, "models.json"), os.path.join(PROFILE, "models.json"))
    patch.object(paths, "ROOT", PROFILE).start()

T0 = time.monotonic()
taskbar.set_process_app_id()
app = QApplication(sys.argv)
ui_theme.apply_theme(app)
ui_theme.use(app, ui_theme.DARK if THEME == "dark" else ui_theme.LIGHT)
w = main_window.SonicRiftApp()
if PROFILE:
    w.output_directory = os.path.join(PROFILE, "chatterbox_outputs")
    os.makedirs(w.output_directory, exist_ok=True)
w.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen, True)
_show = QDialog.show


def _offscreen_show(self):
    self.setAttribute(Qt.WidgetAttribute.WA_DontShowOnScreen, True)
    _show(self)


QDialog.show = _offscreen_show
w.show()
w.resize(*SIZE)
pump(0.8)

LOG = {"theme": THEME, "size": SIZE, "shots": [], "dialogs": DIALOGS}


def shot(name, widget=None, note=""):
    widget = widget or w
    pump(0.25)
    path = os.path.join(OUT, f"{name}.png")
    image = widget.grab()
    image.save(path)
    LOG["shots"].append({"name": name, "size": [image.width(), image.height()], "note": note})
    save_log()
    return path


def save_log():
    with open(os.path.join(OUT, f"log_{THEME}.json"), "w", encoding="utf-8") as handle:
        json.dump(LOG, handle, indent=1, default=str)


def load(backend, timeout=600):
    entry = next(e for e in w.model_entries if e.get("backend") == backend)
    w.load_model(entry)
    return wait_for(lambda: w.model is not None and not w.model_is_loading, timeout, 0.2)


def finish():
    save_log()
    w.close()
    pump(0.5)

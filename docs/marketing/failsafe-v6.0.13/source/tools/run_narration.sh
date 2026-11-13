#!/bin/sh
# Generates 3 takes of each v6.0.13 narration line in Sonic Rift 0.9.1 (Qwen3 voice cloning of narrator-male-3).
W="C:/dev/mythologiq/failsafe/_work/v6013-demo"
SR="C:/LocalAI/Voice/Chatterbox/demo-v091/app/Sonic Rift"
export QT_SCALE_FACTOR=1.5 MEDIA_PROFILE="$W/audio/profiles/sonic-rift-6013" \
  DESIGN="C:/dev/mythologiq/failsafe/docs/marketing/failsafe-v6.0.12/audio/voice-candidates/narrator-male-3.wav" \
  SAYS="Would you hand me the yellow measuring cup before the soup boils over? The quick thinker judged each chance, then sighed with real pleasure." \
  NARRATOR="FailSafe narrator" LINES_FILE="$W/source/narration/lines-spoken.json" TAKES=${TAKES:-3} SPEED=0.85 PAUSE=0.7 TAKE_PREFIX=${TAKE_PREFIX:-m3-}
"$SR/.venv/Scripts/python.exe" "$W/source/tools/failsafe_narration.py" "$SR" "$W/audio/takes" dark 1600x900

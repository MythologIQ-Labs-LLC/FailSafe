// FailSafe Command Center — Voice Controller Support (FX896, #236)
// createTransitionGate: promise-chain mutex so every voice transition
// (toggle / PTT / wake / model swap) runs exclusively and in queue order.
// applyVoiceSettings: the relocated VoiceController.loadSettings body. Per
// LD6 the auto-stop settings behavior lands on controller._onAutoStopSettings
// (composition hook) instead of assigning stt.onAutoStop — _wireStateEmit
// stays the sole stt.onAutoStop assignee, so the analyser-cache cleanup can
// never be clobbered again.

/** Serialize async transitions: run(fn) queues fn behind every previously
 *  queued transition. Callers observe fn's result/rejection; the internal
 *  chain itself never rejects. */
export function createTransitionGate() {
  const noop = () => {};
  let chain = Promise.resolve();
  return {
    run(fn) {
      const result = chain.then(fn, fn);
      chain = result.then(noop, noop);
      return result;
    },
  };
}

/** Apply persisted voice settings (relocated from VoiceController.loadSettings). */
export function applyVoiceSettings(controller, stt, store) {
  const timeout = store?.get('stt-silence-timeout');
  if (timeout) stt.setSilenceTimeout(Number(timeout));

  controller._onAutoStopSettings = () => {
    controller._completeAutoStop();
  };

  // LD7: the engine's wake trigger only signals; the controller starts
  // listening through its transition gate (single wake owner).
  stt.onWakeWordTriggered = () => controller._onWakeTriggered();

  const wakeEnabled = store?.get('wake-word-enabled');
  if (wakeEnabled === 'true' || wakeEnabled === true) {
    stt.startWakeWordListener();
  }
}

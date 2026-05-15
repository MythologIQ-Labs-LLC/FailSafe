// FailSafe Command Center — Whisper Pipeline Loader
// Vendored Transformers.js initialization and Web Speech API detection.

const WHISPER_MODULE = '../vendor/whisper/transformers.min.js';

export async function checkVendorAvailable() {
  try {
    await import(WHISPER_MODULE);
    return true;
  } catch {
    return false;
  }
}

export async function loadPipeline(...args) {
  const available = await checkVendorAvailable();
  if (!available) {
    throw new Error('Whisper Transformers.js not vendored at ' + WHISPER_MODULE);
  }

  const mod = await import(WHISPER_MODULE);

  if (mod.env) {
    mod.env.allowRemoteModels = true;
    mod.env.allowLocalModels = false;
    mod.env.backends.onnx.wasm.wasmPaths = '../vendor/whisper/';
  }

  return mod.pipeline(...args);
}

export async function checkMicAvailable() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(d => d.kind === 'audioinput');
  } catch {
    return false;
  }
}

// Evaluated at call time, not module load time, so tests that assign
// globalThis.SpeechRecognition after ES-module import hoisting still resolve
// the fake. (Module-level const captured the value before assignments could
// land — broke FX221 SttEngine tests.)
export function getSpeechRecognitionCtor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

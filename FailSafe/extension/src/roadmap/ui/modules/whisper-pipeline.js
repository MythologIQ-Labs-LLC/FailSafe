// FailSafe Command Center — Whisper Pipeline Wrapper
// Encapsulates loading, retry-on-timeout, teardown, and readiness state for the
// Whisper transcription pipeline. Extracted from stt-engine.js per plan
// v4.10.1a (B127). The optional `_loaderFn` constructor argument is provided
// for unit testing in CommonJS test harnesses where mocking the imported
// `loadPipeline` ESM binding would otherwise be awkward; production callers
// should rely on the default which delegates to ./whisper-loader.js.

import { loadPipeline as defaultLoadPipeline } from './whisper-loader.js';

const TIMEOUT_MS = 30000;

export class WhisperPipeline {
  constructor(_loaderFn) {
    this._loaderFn = _loaderFn || defaultLoadPipeline;
    this._pipeline = null;
    this._ready = false;
    this._loadingStatus = 'idle';
  }

  async load(modelId, onProgress, retryAttempt = 0) {
    this._loadingStatus = 'loading';
    onProgress?.('loading');
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)
      );
      const loadPromise = this._loaderFn(
        'automatic-speech-recognition',
        modelId,
        {
          progress_callback: (p) => {
            if (p.status === 'initiate') this._loadingStatus = 'downloading';
            if (p.status === 'progress') {
              this._loadingStatus = 'downloading';
              onProgress?.('downloading', Math.round(p.progress));
            }
          },
        }
      );
      this._pipeline = await Promise.race([loadPromise, timeoutPromise]);
      this._ready = true;
      this._loadingStatus = 'ready';
      onProgress?.('ready');
    } catch (err) {
      this._pipeline = null;
      this._ready = false;
      const reason = err?.message || 'model_load_failed';
      if (reason === 'timeout' && retryAttempt === 0) {
        return this.load(modelId, onProgress, 1);
      }
      const errKey = reason === 'timeout' ? 'timeout_after_retry' : reason;
      this._loadingStatus = 'idle';
      onProgress?.(`error:${errKey}`);
    }
  }

  teardown() {
    this._pipeline = null;
    this._ready = false;
    this._loadingStatus = 'idle';
  }

  isReady() {
    return this._ready;
  }

  status() {
    return this._loadingStatus;
  }

  pipeline() {
    return this._pipeline;
  }
}

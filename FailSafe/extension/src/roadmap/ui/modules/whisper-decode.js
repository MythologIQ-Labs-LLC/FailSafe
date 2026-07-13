// FailSafe Command Center — Whisper Decode Boundary (FX895, #238 LD5 split)
// Isolates audio decoding + pipeline transcription behind a typed failure
// boundary so diagnostic text can never leak through the transcript channel.

/** Typed transcription failure. `reason` is machine-readable:
 *  'decode_failed' | 'pipeline_failed'. Error subclass preserves stacks. */
export class TranscribeError extends Error {
  constructor(reason) {
    super(`Transcription failed: ${reason}`);
    this.name = 'TranscribeError';
    this.reason = reason;
  }
}

/**
 * Decode a recorded audio blob and transcribe it through the Whisper pipeline.
 * @param {Blob} blob recorded audio (audio/webm)
 * @param {Function} pipelineFn loaded Whisper pipeline function
 * @param {string} language BCP-47 language hint
 * @returns {Promise<string>} trimmed transcript ('' when the pipeline yields no text)
 * @throws {TranscribeError} 'decode_failed' when decoding throws; 'pipeline_failed' when the pipeline throws
 */
export async function decodeAndTranscribe(blob, pipelineFn, language) {
  const ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)({ sampleRate: 16000 });
  try {
    let decoded;
    try {
      const arrayBuf = await blob.arrayBuffer();
      decoded = await ctx.decodeAudioData(arrayBuf);
    } catch {
      throw new TranscribeError('decode_failed');
    }
    let result;
    try {
      result = await pipelineFn(decoded.getChannelData(0), { language });
    } catch {
      throw new TranscribeError('pipeline_failed');
    }
    return typeof result?.text === 'string' ? result.text.trim() : '';
  } finally {
    ctx.close().catch(() => {});
  }
}

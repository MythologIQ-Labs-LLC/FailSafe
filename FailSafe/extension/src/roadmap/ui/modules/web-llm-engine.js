// FailSafe Command Center — Web LLM Engine (Browser-Native)
// Uses Transformers.js to run small LLMs directly in the browser.
// This provides zero-latency extraction and fallback when Ollama is offline.
// DESIGN PRINCIPLE: extractGraph() MUST ALWAYS return usable nodes.
// The manual queue should NEVER trigger if this module is loaded.

import { heuristicExtract } from './heuristic-extractor.js';

const LLM_MODULE = '../vendor/whisper/transformers.min.js'; // Re-use vendored transformers

// #244 Tranche D: neither browser inference tier (native Gemini Nano prompt(),
// WASM Transformers.js pipeline()) carries any cancellation/timeout of its own.
// A stalled model call would otherwise hang extractGraph() forever, making
// Tier C (the "MUST ALWAYS return usable nodes" heuristic fallback above)
// unreachable. TIER_TIMEOUT_MS bounds each tier so a stuck model degrades to
// the next tier instead of hanging the extraction indefinitely.
const TIER_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function checkVendorAvailable() {
    try {
        await import(LLM_MODULE);
        return true;
    } catch {
        return false;
    }
}

async function loadPipeline(...args) {
    const available = await checkVendorAvailable();
    if (!available) {
        throw new Error('Transformers.js not vendored at ' + LLM_MODULE);
    }

    const mod = await import(LLM_MODULE);

    // v4.3.2: Configure environment to avoid 404/MIME errors when fetching non-vendored models
    if (mod.env) {
        mod.env.allowLocalModels = false;
        mod.env.allowRemoteModels = true;
        mod.env.useBrowserCache = true;
        mod.env.localModelPath = '';
        mod.env.remoteHost = 'https://huggingface.co';
    }
    if (mod.env?.backends?.onnx) {
        mod.env.backends.onnx.logSeverityLevel = 3; // ERROR only (suppress WARNING)
    }

    return mod.pipeline(...args);
}

// ─── WebLLM Engine ──────────────────────────────────────────────────────

export class WebLlmEngine {
    constructor(store) {
        this.store = store;
        this.modelId = 'Xenova/Qwen1.5-0.5B-Chat';
        this.pipeline = null;
        this.loadingStatus = 'idle';
        this.onProgress = null;
        this.isReady = false;
        // #244 Tranche D: per-instance override point for tests; production default is TIER_TIMEOUT_MS.
        this.tierTimeoutMs = TIER_TIMEOUT_MS;
        this._initAttempts = 0;
        this._maxInitAttempts = 3;

        // Native AI (Chromium Gemini Nano)
        this.isNativeAiAvailable = false;
        this.nativeUnavailableReason = null; // 'no-api' | 'not-supported' | 'probe-error' | null
        this.nativeModel = null;
        this.onStatusChange = null; // callback for UI updates
    }

    /** Re-probe native AI only — safe to call anytime, even if WASM is loaded. */
    async recheckNative() {
        try {
            const ai = globalThis.ai || globalThis.model;
            const lm = ai?.languageModel || ai?.assistant;
            if (!lm) {
                this.nativeUnavailableReason = 'no-api';
                return false;
            }

            const status = await lm.capabilities();
            console.info('FailSafe WebLLM: Native AI capabilities =', status.available);

            if (status.available === 'readily') {
                this.isNativeAiAvailable = true;
                this.nativeUnavailableReason = null;
                this._nativeLmFactory = lm;
                this.isReady = true;
                this.loadingStatus = 'ready';
                this.onStatusChange?.('native-found');
                return true;
            }
            if (status.available === 'after-download') {
                console.info('FailSafe WebLLM: Gemini Nano needs download — triggering...');
                this.onStatusChange?.('native-downloading');
                // Creating a session triggers the download
                const session = await lm.create({ monitor(m) {
                    m.addEventListener('downloadprogress', (e) => {
                        console.info(`FailSafe WebLLM: Nano download ${Math.round(e.loaded / e.total * 100)}%`);
                    });
                }});
                session.destroy();
                this.isNativeAiAvailable = true;
                this.nativeUnavailableReason = null;
                this._nativeLmFactory = lm;
                this.isReady = true;
                this.loadingStatus = 'ready';
                this.onStatusChange?.('native-found');
                return true;
            }
            if (status.available === 'no') {
                console.info('FailSafe WebLLM: Gemini Nano not supported on this hardware.');
                this.nativeUnavailableReason = 'not-supported';
                return false;
            }
        } catch (err) {
            console.info('FailSafe WebLLM: Native AI probe failed:', err.message);
            this.nativeUnavailableReason = 'probe-error';
        }
        return false;
    }

    async init() {
        if (this.isReady) return;
        if (this._initAttempts >= this._maxInitAttempts) return;
        this._initAttempts++;

        // 1. Try Native AI First (Gemini Nano in Chrome/Edge)
        const nativeOk = await this.recheckNative();
        if (nativeOk) {
            console.log('FailSafe WebLLM: Chromium Native AI (Gemini Nano) detected.');
            this.onProgress?.('ready');
            return;
        }

        // 2. Fallback to WASM (Transformers.js)
        this.loadingStatus = 'loading';
        this.onProgress?.('loading');

        try {
            this.pipeline = await loadPipeline('text-generation', this.modelId, {
                quantized: true,
                progress_callback: (p) => {
                    if (p.status === 'progress') {
                        this.loadingStatus = 'downloading';
                        this.onProgress?.('downloading', Math.round(p.progress));
                    }
                }
            });
            this.isReady = true;
            this.loadingStatus = 'ready';
            this.onProgress?.('ready');
            console.log(`FailSafe WebLLM: WASM Engine (${this.modelId}) active.`);
        } catch (err) {
            console.info('FailSafe WebLLM: WASM model not available —', err.message);
            this.loadingStatus = 'error';
            this.onProgress?.('error');
            // Do NOT set a permanent initFailed flag — allow retries
        }
    }

    /**
     * Extract graph from transcript. GUARANTEED to return nodes.
     * Tier order: Native AI → WASM Pipeline → Heuristic Keyword Extraction
     */
    async extractGraph(transcript) {
        // Try to init if not ready (may be a retry)
        if (!this.isReady) {
            try { await this.init(); } catch { /* continue to heuristic */ }
        }

        // ── Tier A: Native AI (Gemini Nano) ──
        if (this.isNativeAiAvailable) {
            try {
                const result = await withTimeout(this._extractWithNativeAi(transcript), this.tierTimeoutMs, 'Native AI extraction');
                if (result && !result.error && result.nodes?.length) return result;
            } catch (err) {
                console.warn('Native AI extraction failed:', err);
                this.isNativeAiAvailable = false;
                this.nativeModel = null;
                this.onStatusChange?.('native-lost');
            }
        }

        // ── Tier B: WASM Pipeline (Transformers.js) ──
        if (this.pipeline) {
            try {
                const prompt = `System: You are a MindMap Extractor. Extract nodes and edges from the transcript.
Type must be: Feature, Architecture, Risk, Question, Database, Integration.
Transcript: ${transcript}
JSON Output:`;
                const out = await withTimeout(this.pipeline(prompt, {
                    max_new_tokens: 512,
                    temperature: 0.2,
                    do_sample: false,
                    return_full_text: false,
                }), this.tierTimeoutMs, 'WASM pipeline extraction');
                const parsed = this._parseJson(out[0].generated_text);
                if (parsed && !parsed.error && parsed.nodes?.length) return parsed;
            } catch (err) {
                console.warn('WASM extraction failed:', err);
            }
        }

        // ── Tier C: Heuristic Keyword Extraction (ALWAYS succeeds) ──
        console.info('FailSafe WebLLM: Using heuristic keyword extraction as last resort.');
        return heuristicExtract(transcript);
    }

    async _extractWithNativeAi(transcript) {
        if (this.nativeModel) {
            await this.nativeModel.destroy?.();
            this.nativeModel = null;
        }
        const factory = this._nativeLmFactory || globalThis.ai?.languageModel;
        if (!factory) throw new Error('No native AI factory available');
        this.nativeModel = await factory.create({
            systemPrompt: "You are a MindMap Extractor. Return ONLY valid JSON with 'nodes' and 'edges'. Types: Feature, Architecture, Risk, Question, Database, Integration."
        });

        const prompt = `Extract nodes and edges from this architectural brainstorm transcript: "${transcript}"`;
        const response = await this.nativeModel.prompt(prompt);
        
        const result = this._parseJson(response);
        if (result && !result.error) {
            result.status = 'native-ai-extracted';
            result.verbalResponse = result.verbalResponse || "Extracted via Chromium Gemini Nano.";
        }
        return result;
    }

    destroy() {
        if (this.nativeModel) {
            this.nativeModel.destroy?.();
            this.nativeModel = null;
        }
    }

    _parseJson(text) {
        if (!text || text.trim().startsWith('<!DOCTYPE')) {
            return { error: 'Received HTML instead of JSON.' };
        }
        try {
            const cleanup = text.replace(/```json/g, '').replace(/```/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();
            const data = JSON.parse(cleanup);
            return {
                status: 'browser-extracted',
                nodes: data.nodes || [],
                edges: data.edges || [],
                verbalResponse: data.verbalResponse || 'Extracted via local browser brain.'
            };
        } catch {
            return { error: 'Failed to parse LLM JSON output.' };
        }
    }
}

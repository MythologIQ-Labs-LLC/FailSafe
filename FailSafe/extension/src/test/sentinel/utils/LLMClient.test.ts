import { describe, it } from 'mocha';
import * as assert from 'assert';
import { LLMClient } from '../../../sentinel/utils/LLMClient';
import type { IConfigProvider } from '../../../core/interfaces/IConfigProvider';
import type { HeuristicResult } from '../../../shared/types';

describe('LLMClient', () => {
    const mockConfigProvider: IConfigProvider = {
        getConfig: () => ({
            sentinel: {
                ollamaEndpoint: 'http://localhost:11434',
                localModel: 'phi3:mini'
            }
        })
    } as never;

    const client = new LLMClient(mockConfigProvider);

    // #538: endpoint validation moved to the destination policy
    // (llmDestinationPolicy.test.ts); the old "public URLs are allowed" case encoded B273.

    describe('buildPrompt', () => {
        it('should include file path in output', () => {
            const prompt = client.buildPrompt('/src/index.ts', 'code content', []);
            assert.strictEqual(prompt.includes('File: /src/index.ts'), true);
        });

        it('should include matched heuristic pattern IDs', () => {
            const heuristics: HeuristicResult[] = [
                { patternId: 'EVAL_USAGE', matched: true, severity: 'high' },
                { patternId: 'DANGEROUS_FORK', matched: true, severity: 'critical' },
                { patternId: 'SQL_INJECTION', matched: false, severity: 'high' }
            ];
            const prompt = client.buildPrompt('/src/app.js', 'code', heuristics);
            assert.strictEqual(prompt.includes('EVAL_USAGE'), true);
            assert.strictEqual(prompt.includes('DANGEROUS_FORK'), true);
            assert.strictEqual(prompt.includes('SQL_INJECTION'), false);
        });

        it('should handle undefined content gracefully', () => {
            const prompt = client.buildPrompt('/src/missing.ts', undefined, []);
            assert.strictEqual(prompt.includes('File not readable'), true);
        });

        it('should truncate content to 2000 characters', () => {
            const longContent = 'x'.repeat(3000);
            const prompt = client.buildPrompt('/src/large.ts', longContent, []);
            const codeSection = prompt.split('```')[1];
            assert.strictEqual(codeSection.length <= 2010, true);
        });

        it('should handle empty heuristic results', () => {
            const prompt = client.buildPrompt('/src/clean.ts', 'code', []);
            assert.strictEqual(prompt.includes('Heuristic Flags:'), true);
        });

        it('should only include matched heuristics', () => {
            const heuristics: HeuristicResult[] = [
                { patternId: 'FLAG_A', matched: false, severity: 'low' },
                { patternId: 'FLAG_B', matched: false, severity: 'low' }
            ];
            const prompt = client.buildPrompt('/src/test.ts', 'code', heuristics);
            assert.strictEqual(prompt.includes('FLAG_A'), false);
            assert.strictEqual(prompt.includes('FLAG_B'), false);
        });

        it('should format prompt with expected structure', () => {
            const prompt = client.buildPrompt('/src/test.ts', 'code', []);
            assert.strictEqual(prompt.includes('Analyze this code'), true);
            assert.strictEqual(prompt.includes('Risk assessment'), true);
            assert.strictEqual(prompt.includes('Issues found'), true);
            assert.strictEqual(prompt.includes('Confidence'), true);
        });
    });
});

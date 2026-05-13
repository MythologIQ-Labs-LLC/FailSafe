/**
 * economics-dashboard.test.ts — Phase 60 §4 Track 3
 *
 * Asserts that the Token Economics dashboard template renders cost rows
 * and aggregate (daily) rows from a TokenAggregatorService-shaped
 * EconomicsSnapshot fixture.
 *
 * The dashboard renderer is the pure-HTML function
 *   renderEconomicsTemplate(model) in
 *   src/genesis/panels/templates/EconomicsTemplate.ts
 * which EconomicsPanel feeds with the snapshot returned by
 *   TokenAggregatorService.getSnapshot().
 *
 * Test contract (INVOKE + ASSERT):
 *   - construct a fake snapshot with deterministic cost + aggregate values
 *   - invoke the renderer
 *   - assert specific values appear in the rendered HTML
 *
 * Closes FEATURE_INDEX row FX419 (Token Economics Dashboard).
 */

import { describe, it } from 'mocha';
import * as assert from 'assert';
import {
    renderEconomicsTemplate,
    EconomicsViewModel,
} from '../../genesis/panels/templates/EconomicsTemplate';
import { EconomicsSnapshot, DailyAggregate } from '../../economics/types';

// ---------------------------------------------------------------------------
// Fake service output — shaped exactly like TokenAggregatorService.getSnapshot()
// ---------------------------------------------------------------------------

function makeAggregate(overrides: Partial<DailyAggregate> = {}): DailyAggregate {
    return {
        date: '2026-05-01',
        totalDispatched: 4000,
        totalReceived: 2000,
        tokensSaved: 6000,
        ragPrompts: 3,
        fullPrompts: 1,
        costSaved: 0.018,
        ...overrides,
    };
}

function makeSnapshot(overrides: Partial<EconomicsSnapshot> = {}): EconomicsSnapshot {
    return {
        weeklyTokensSaved: 12500,
        weeklyCostSaved: 4.27,
        contextSyncRatio: 0.75,
        dailyAggregates: [
            makeAggregate({ date: '2026-05-01', tokensSaved: 6000, costSaved: 0.018 }),
            makeAggregate({ date: '2026-05-02', tokensSaved: 9000, costSaved: 0.027 }),
        ],
        lastUpdated: '2026-05-02T12:00:00.000Z',
        ...overrides,
    };
}

function makeModel(snapshot: EconomicsSnapshot): EconomicsViewModel {
    return {
        nonce: 'test-nonce-abc',
        cspSource: 'vscode-webview://test',
        snapshot,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Economics Dashboard rendering', () => {
    describe('renders cost rows from service output', () => {
        it('emits the hero cost value from snapshot.weeklyCostSaved', () => {
            // Distinctive value chosen so it cannot collide with chrome.
            const snapshot = makeSnapshot({ weeklyCostSaved: 4.27 });
            const html = renderEconomicsTemplate(makeModel(snapshot));

            // Cost row: hero "$4.27" with the data-field marker.
            assert.ok(
                html.includes('data-field="weeklyCostSaved">$4.27<'),
                'expected hero cost row to render snapshot.weeklyCostSaved as "$4.27"',
            );
            assert.ok(
                html.includes('Estimated Savings'),
                'expected cost-row label "Estimated Savings" to be present',
            );
        });

        it('emits the hero tokens-saved value from snapshot.weeklyTokensSaved', () => {
            // 12,500 -> formatNumber -> "12.5K"
            const snapshot = makeSnapshot({ weeklyTokensSaved: 12500 });
            const html = renderEconomicsTemplate(makeModel(snapshot));

            assert.ok(
                html.includes('data-field="weeklyTokensSaved">12.5K<'),
                'expected hero tokens row to render weeklyTokensSaved formatted as "12.5K"',
            );
            assert.ok(
                html.includes('Tokens Saved This Week'),
                'expected hero label "Tokens Saved This Week" to be present',
            );
        });

        it('formats weeklyCostSaved to two decimals (cost-row contract)', () => {
            const snapshot = makeSnapshot({ weeklyCostSaved: 0 });
            const html = renderEconomicsTemplate(makeModel(snapshot));
            assert.ok(
                html.includes('data-field="weeklyCostSaved">$0.00<'),
                'zero cost must render as "$0.00", not "$0"',
            );
        });
    });

    describe('renders aggregate rows from service output', () => {
        it('emits one bar-chart entry per dailyAggregate row', () => {
            const snapshot = makeSnapshot({
                dailyAggregates: [
                    makeAggregate({ date: '2026-05-01', tokensSaved: 1000 }),
                    makeAggregate({ date: '2026-05-02', tokensSaved: 2000 }),
                    makeAggregate({ date: '2026-05-03', tokensSaved: 3000 }),
                ],
            });
            const html = renderEconomicsTemplate(makeModel(snapshot));

            // bar-label slices date to MM-DD; each aggregate row must appear.
            const barLabels = html.match(/class="bar-label">[^<]+</g) || [];
            assert.strictEqual(
                barLabels.length,
                3,
                `expected 3 aggregate bar rows, got ${barLabels.length}`,
            );
            assert.ok(html.includes('>05-01<'), 'aggregate row 2026-05-01 missing');
            assert.ok(html.includes('>05-02<'), 'aggregate row 2026-05-02 missing');
            assert.ok(html.includes('>05-03<'), 'aggregate row 2026-05-03 missing');
        });

        it('emits aggregate-row tokensSaved values into bar tooltips', () => {
            const snapshot = makeSnapshot({
                dailyAggregates: [
                    makeAggregate({ date: '2026-05-01', tokensSaved: 1500 }),
                    makeAggregate({ date: '2026-05-02', tokensSaved: 8500 }),
                ],
            });
            const html = renderEconomicsTemplate(makeModel(snapshot));

            // formatNumber: 1500 -> "1.5K", 8500 -> "8.5K"
            assert.ok(
                html.includes('05-01: 1.5K saved'),
                'aggregate tooltip "05-01: 1.5K saved" missing',
            );
            assert.ok(
                html.includes('05-02: 8.5K saved'),
                'aggregate tooltip "05-02: 8.5K saved" missing',
            );
        });

        it('renders contextSyncRatio (aggregate-derived) into the donut row', () => {
            const snapshot = makeSnapshot({ contextSyncRatio: 0.75 });
            const html = renderEconomicsTemplate(makeModel(snapshot));

            // Donut pct = round(0.75 * 100) = 75%
            assert.ok(
                html.includes('data-field="ragPct">75%<'),
                'donut pct row must render contextSyncRatio as "75%"',
            );
            assert.ok(
                html.includes('RAG (75%)'),
                'rag-legend aggregate-derived row must include "(75%)"',
            );
            assert.ok(
                html.includes('Full (25%)'),
                'full-legend aggregate-derived row must include "(25%)" (100% - rag%)',
            );
        });

        it('handles empty aggregate-row list without producing bar entries', () => {
            const snapshot = makeSnapshot({ dailyAggregates: [] });
            const html = renderEconomicsTemplate(makeModel(snapshot));

            const barLabels = html.match(/class="bar-label">[^<]+</g) || [];
            assert.strictEqual(
                barLabels.length,
                0,
                'empty dailyAggregates must produce zero aggregate bar rows',
            );
            // Frame still present.
            assert.ok(html.includes('30-Day Token Savings Trend'));
        });

        it('caps aggregate-row rendering to the last 30 entries', () => {
            // Construct 35 deterministic aggregate rows; only the last 30 should render.
            const many: DailyAggregate[] = [];
            for (let i = 1; i <= 35; i++) {
                const dd = String(i).padStart(2, '0');
                many.push(makeAggregate({ date: `2026-04-${dd}`, tokensSaved: i * 100 }));
            }
            const html = renderEconomicsTemplate(makeModel(makeSnapshot({ dailyAggregates: many })));
            const barLabels = html.match(/class="bar-label">[^<]+</g) || [];
            assert.strictEqual(barLabels.length, 30, 'renderer must cap aggregates at 30 rows');
            // First 5 rows (dates 04-01..04-05) should be dropped.
            assert.ok(!html.includes('>04-01<'), 'oldest dropped row 04-01 must NOT render');
            // Last row (04-35 padded -> "04-35") should render.
            assert.ok(html.includes('>04-35<'), 'newest row 04-35 must render');
        });
    });
});

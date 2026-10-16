// #477 O15: imported entries merge into AgentTimelineService.getEntries under
// the existing filters, newest first across live and imported entries;
// getEntriesSince stays live-only.

import { strict as assert } from 'assert';
import { EventBus } from '../../shared/EventBus';
import { AgentTimelineService, type TimelineEntry } from '../../sentinel/AgentTimelineService';

const imported = (id: string, ts: string, severity: TimelineEntry['severity'] = 'info'): TimelineEntry =>
  ({ id, timestamp: ts, category: 'imported', title: id, detail: '', icon: 'archive', severity });

suite('AgentTimelineService imported entries (#477 O15)', () => {
  test('live and imported entries come back newest first and honour category, severity and since', () => {
    const bus = new EventBus();
    const service = new AgentTimelineService(bus);
    bus.emit('sentinel.verdict' as never, { decision: 'PASS', artifactPath: 'a.ts', summary: 's' } as never);
    const live = service.getEntries();
    assert.equal(live.length, 1);
    const liveTs = live[0].timestamp;
    const before = new Date(Date.parse(liveTs) - 60_000).toISOString();
    const after = new Date(Date.parse(liveTs) + 60_000).toISOString();
    service.setImportedEntriesProvider(() => [imported('old', before), imported('new', after, 'warning')]);
    assert.deepEqual(service.getEntries().map((e) => e.id === live[0].id ? 'live' : e.id), ['new', 'live', 'old']);
    assert.deepEqual(service.getEntries({ categories: ['imported'] }).map((e) => e.id), ['new', 'old']);
    assert.deepEqual(service.getEntries({ severity: ['warning'] }).map((e) => e.id), ['new']);
    assert.deepEqual(service.getEntries({ since: liveTs }).map((e) => e.id === live[0].id ? 'live' : e.id), ['new', 'live']);
    assert.deepEqual(service.getEntriesSince(0).map((e) => e.id), [live[0].id], 'getEntriesSince is live-only');
    service.dispose();
  });

  test('a provider that throws leaves the live timeline intact', () => {
    const service = new AgentTimelineService(new EventBus());
    service.setImportedEntriesProvider(() => { throw new Error('disk'); });
    assert.deepEqual(service.getEntries(), []);
    service.dispose();
  });
});

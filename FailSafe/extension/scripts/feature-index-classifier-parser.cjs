#!/usr/bin/env node
// FEATURE_INDEX baseline audit — markdown row parser.
//
// Phase 62 of plan-qor-phase62-item-b-sweep-followups.md.
// Sibling of feature-index-classifier.cjs; carries parseFeatureIndexRows
// extracted from the classifier per Section 4 file-size cap.

'use strict';

// Parses FEATURE_INDEX.md rows into structured objects.
// Skips header rows, separator rows, and any row whose first cell is not FX###.
function parseFeatureIndexRows(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const m = line.match(/^\|(.+)\|\s*$/);
  if (!m) continue;
  const cells = m[1].split('|').map(c => c.trim());
  if (cells.length < 7) continue;
  if (cells.every(c => /^[-:\s]+$/.test(c))) continue;
  if (!/^FX\d+$/.test(cells[0])) continue;

  const testCell = cells[4];
  const testPaths = testCell === '—' || testCell === '' || testCell === '-'
  ? []
  : testCell.split('+').map(p => p.trim()).filter(Boolean);

  rows.push({
  entryId: cells[0],
  feature: cells[1],
  docRef: cells[2],
  codeRef: cells[3],
  testPaths,
  status: cells[5],
  notes: cells[6] || '',
  line: i + 1,
  });
  }
  return rows;
}

module.exports = { parseFeatureIndexRows };

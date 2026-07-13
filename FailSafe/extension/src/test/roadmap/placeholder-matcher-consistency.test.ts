// FX895 — client/server placeholder-matcher cross-consistency (#238 LD6).
// isPlaceholderTranscript is defined twice (browser ESM mirror in prep-bay.js;
// exported server matcher in BrainstormService.ts) because no shared-module
// bundling path exists across the browser/extension boundary (same rationale
// as the FX894 edge-identity twin). This suite pins both to identical
// verdicts over a shared matrix.

import { strict as assert } from "assert";
// @ts-expect-error JS module import in TS test context
import { isPlaceholderTranscript as clientMatcher } from "../../../src/roadmap/ui/modules/prep-bay.js";
import { isPlaceholderTranscript as serverMatcher } from "../../roadmap/services/BrainstormService";

const MATRIX: Array<[string, boolean]> = [
  ["[transcription failed]", true],
  ["[decode error]", true],
  ["[BLANK_AUDIO]", false],
  ["real idea [not failure]", false],
  ["  ", true],
  ["We should cache the auth token", false],
];

suite("FX895 placeholder matcher cross-consistency", () => {
  test("server matcher verdicts over the matrix", () => {
    for (const [input, expected] of MATRIX) {
      assert.equal(serverMatcher(input), expected, `server verdict for ${JSON.stringify(input)}`);
    }
  });

  test("client mirror and server matcher agree over the full matrix", () => {
    for (const [input, expected] of MATRIX) {
      assert.equal(clientMatcher(input), serverMatcher(input), `divergence for ${JSON.stringify(input)}`);
      assert.equal(clientMatcher(input), expected, `client verdict for ${JSON.stringify(input)}`);
    }
  });
});

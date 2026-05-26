// FailSafe Educational Component — Glossary registry composition (Section 4
// razor split). Aggregates every glossary-kind Lesson literal from the
// sibling content files into a single `GLOSSARY_LESSONS` array consumed by
// `lessons.ts` (which would breach 250L if it carried the imports inline
// alongside the SWE-domain Phase 2A additions).
//
// Each content file is a leaf data module — no DOM, no runtime imports
// beyond the `Lesson` type. Two domains co-exist:
//   FailSafe domain (`domain: 'failsafe'` — applied at registry-join in
//     lessons.ts for the legacy 12 entries that pre-date the field):
//     glossary-content.ts (6), glossary-content-2.ts (7 — incl. Phase 2A
//     bicameral-integration entry).
//   SWE domain (`domain: 'swe'`, Phase 2A): glossary-content-swe.ts (15) +
//     -swe-2.ts (15) + -swe-3.ts (18) = 48 entries.
//
// Anchor namespaces are disjoint by construction:
//   FailSafe entries: `glossary.<term>`
//   SWE entries:      `glossary.swe.<term>`

import type { Lesson } from "./lesson-types";
import { GLOSSARY_LESSONS_A } from "./glossary-content";
import { GLOSSARY_LESSONS_B } from "./glossary-content-2";
import { SWE_GLOSSARY_LESSONS_A } from "./glossary-content-swe";
import { SWE_GLOSSARY_LESSONS_B } from "./glossary-content-swe-2";
import { SWE_GLOSSARY_LESSONS_C } from "./glossary-content-swe-3";

/** All glossary-kind Lesson literals, both domains, joined in deterministic order. */
export const GLOSSARY_LESSONS: Lesson[] = [
  ...GLOSSARY_LESSONS_A,
  ...GLOSSARY_LESSONS_B,
  ...SWE_GLOSSARY_LESSONS_A,
  ...SWE_GLOSSARY_LESSONS_B,
  ...SWE_GLOSSARY_LESSONS_C,
];

/** Runs only the hand-written scenarios (a few seconds). The full lab, with the sweep and oracle, is run.ts. */
import { SCENARIOS } from "./scenarios";

const failed = SCENARIOS.map((s) => ({ s, failures: s.check() })).filter((o) => o.failures.length);
failed.forEach((o) => console.log(`✗ [${o.s.id}] ${o.s.title}\n    - ${o.failures.join("\n    - ")}`));
console.log(`${SCENARIOS.length - failed.length}/${SCENARIOS.length} scenarios pass`);

/**
 * Runs the whole lab: hand-written scenarios, the exhaustive sweep and the brute-force oracle.
 * Usage: pnpm exec tsx lab/rules-v3/run.ts [--verbose]
 */
import { SCENARIOS } from "./scenarios";
import { runOracle, runSweep } from "./properties";

const verbose = process.argv.includes("--verbose");
const started = Date.now();

// 1. scenarios, grouped
const outcomes = SCENARIOS.map((s) => {
  try {
    return { scenario: s, failures: s.check() };
  } catch (error) {
    return { scenario: s, failures: [`crashed: ${(error as Error).stack}`] };
  }
});
const groups = [...new Set(SCENARIOS.map((s) => s.group))];
console.log("SCENARIOS");
groups.forEach((group) => {
  const inGroup = outcomes.filter((o) => o.scenario.group === group);
  const passed = inGroup.filter((o) => !o.failures.length).length;
  console.log(`  ${passed === inGroup.length ? "✓" : "✗"} ${group}: ${passed}/${inGroup.length}`);
});
const failed = outcomes.filter((o) => o.failures.length);
failed.forEach((o) =>
  console.log(`\n  ✗ [${o.scenario.id}] ${o.scenario.title}\n    - ${o.failures.join("\n    - ")}`),
);

// 2. exhaustive sweep
const { results, stats } = runSweep();
console.log(`\nSWEEP (${stats.configs.toLocaleString()} configurations)`);
results.forEach((r) => {
  console.log(
    `  ${r.failures.length ? "✗" : "✓"} ${r.name}${r.failures.length ? `: ${r.failures.length} failures` : ""}`,
  );
  r.failures.slice(0, verbose ? 20 : 3).forEach((f) => console.log(`      ${f}`));
});
console.log(`  grades: ${JSON.stringify(stats.grades)}, red: ${stats.red}`);
console.log(`  cliffs (one setting moves the grade 3+ steps): ${stats.cliffs.length}`);
stats.cliffs.slice(0, verbose ? 20 : 5).forEach((c) => console.log(`      ${c}`));

// 3. oracle
const oracle = runOracle();
console.log(`\nORACLE (${oracle.checked.toLocaleString()} random control trees)`);
console.log(
  `  ${oracle.failures.length ? "✗" : "✓"} ${oracle.name}${oracle.failures.length ? `: ${oracle.failures.length} failures` : ""}`,
);
oracle.failures.slice(0, verbose ? 20 : 5).forEach((f) => console.log(`      ${f}`));

const sweepFailures = results.reduce((n, r) => n + r.failures.length, 0);
const total = failed.length + sweepFailures + oracle.failures.length;
console.log(`\n${total ? "FAILED" : "ALL PASSED"} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
process.exitCode = total ? 1 : 0;

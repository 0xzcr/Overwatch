/**
 * The headline alert: a protocol's grade changed. Raised by the pipeline when a new score's grade differs from the
 * last one under the same ruleset.
 *
 *   becomes red (a drain path grades F)          → CRITICAL
 *   drops two or more grades at once             → HIGH
 *   two or more grades below its best in 90 days → HIGH (slow erosion: each step looked small)
 *   any other drop                               → MEDIUM
 *   a rise                                       → INFO (good news, still worth a line)
 */
import type { OverwatchEvent, Severity } from "./types";

type Grade = "A" | "B" | "C" | "D" | "F";
const ORDER: Grade[] = ["A", "B", "C", "D", "F"];
const rank = (grade: Grade) => ORDER.indexOf(grade);

export interface GradeChange {
  name: string;
  protocol: string;
  from: Grade;
  to: Grade;
  red: boolean;
  /** best grade in the last 90 days under this ruleset, or null when there is no history */
  best90d: Grade | null;
  /** the line that now sets the grade */
  reason: string;
  slot: number;
  now: string;
  txSignature: string | null;
}

export function gradeChangeSeverity(c: Pick<GradeChange, "from" | "to" | "red" | "best90d">): Severity {
  const drop = rank(c.to) - rank(c.from);
  if (drop <= 0) return "INFO";
  if (c.red) return "CRITICAL";
  if (drop >= 2) return "HIGH";
  if (c.best90d && rank(c.to) - rank(c.best90d) >= 2) return "HIGH";
  return "MEDIUM";
}

export function gradeChangeEvent(c: GradeChange): OverwatchEvent {
  const lowered = rank(c.to) > rank(c.from);
  const severity = gradeChangeSeverity(c);
  const erosion = lowered && severity === "HIGH" && rank(c.to) - rank(c.from) < 2;
  const title = lowered
    ? `${c.name} dropped from ${c.from} to ${c.to}${c.red ? ": funds can now be drained with no warning" : ""}`
    : `${c.name} improved from ${c.from} to ${c.to}`;
  const explanation = [
    c.reason,
    erosion ? `Two or more grades below its best (${c.best90d}) in the last 90 days: small steps that add up.` : "",
    lowered && c.red ? "Consider withdrawing until the change is explained." : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    protocol: c.protocol,
    type: lowered ? "GRADE_LOWERED" : "GRADE_RAISED",
    severity,
    weakening: lowered,
    title,
    explanation,
    before: { grade: c.from },
    after: { grade: c.to, red: c.red },
    slot: c.slot,
    blockTime: c.now,
    txSignature: c.txSignature,
    detectedAt: c.now,
    labels: erosion ? ["slow erosion"] : [],
  };
}

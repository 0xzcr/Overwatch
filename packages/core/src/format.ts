export function fmtDuration(sec: number): string {
  if (sec <= 0) return "no delay";
  if (sec % 86400 === 0) return `${sec / 86400} day${sec === 86400 ? "" : "s"}`;
  if (sec % 3600 === 0) return `${sec / 3600} hour${sec === 3600 ? "" : "s"}`;
  if (sec >= 3600) return `${(sec / 3600).toFixed(1)} hours`;
  return `${Math.round(sec / 60)} min`;
}
export const short = (a: string | null | undefined) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "none");
export const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

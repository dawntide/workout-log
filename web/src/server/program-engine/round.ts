// Used for prescribed working weights so any TM increment is reflected on the
// next plate boundary. With round-to-nearest, a 2.5 kg TM bump can round to
// the same plate at low percentages (e.g. Operator W1 70% × 95 → 95 × 0.7 =
// 66.5 and 97.5 × 0.7 = 68.25 both land on 67.5), which makes a successful
// block end look like nothing changed. Ceiling guarantees +2.5 kg TM produces
// ≥ +2.5 kg at the bar at every scheme.
export function roundUpToNearest2p5(v: number) {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  return Math.ceil(v / 2.5) * 2.5;
}

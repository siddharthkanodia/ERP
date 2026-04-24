/**
 * Canonical piece-to-kg conversion helper.
 *
 * `weightPerPiece` must be provided in **kg**.
 * Unit matching is case-insensitive and trims whitespace.
 * Recognised units: "kg", "piece", "pcs".
 * Returns 0 for any unrecognised unit.
 */
export function calculateKgWeight(
  qty: number | { valueOf(): number },
  unit: string,
  weightPerPiece?: number | { valueOf(): number } | null
): number {
  const q = Number(qty ?? 0);
  const normalizedUnit = unit?.trim().toLowerCase();

  if (normalizedUnit === "kg") return q;
  if (normalizedUnit === "piece" || normalizedUnit === "pcs") {
    return q * Number(weightPerPiece ?? 0);
  }

  return 0;
}

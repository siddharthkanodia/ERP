export function roundKg(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function addKg(total: number, value: number): number {
  return roundKg(total + value);
}

export function netWasteKg(inputKg: number, outputKg: number): number {
  return roundKg(inputKg - outputKg);
}

export function yieldPercent(inputKg: number, outputKg: number): number {
  if (!Number.isFinite(inputKg) || inputKg <= 0) return 0;
  return Math.round((outputKg / inputKg) * 100 * 100) / 100;
}

/**
 * Display a kg/quantity value with 2–3 decimals: 3 when the third decimal is
 * significant (0.275), otherwise 2 (292.50). No thousands separators.
 */
export function formatQty(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(3).replace(/0$/, "");
}

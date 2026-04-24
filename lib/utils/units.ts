export function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addKg(total: number, value: number): number {
  return roundKg(total + value);
}

export function netWasteKg(inputKg: number, outputKg: number): number {
  return roundKg(inputKg - outputKg);
}

export function yieldPercent(inputKg: number, outputKg: number): number {
  if (!Number.isFinite(inputKg) || inputKg <= 0) return 0;
  return roundKg((outputKg / inputKg) * 100);
}

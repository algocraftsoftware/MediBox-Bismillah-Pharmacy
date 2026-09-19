// blockNegativeKeys / blockNonIntegerKeys moved to ../../../lib/numericInput
// so other views (e.g. Invoice Item Cancel's return-quantity field) can
// share them too.
export { blockNegativeKeys, blockNonIntegerKeys } from "../../../lib/numericInput";

export function calcAge(birthDate: string | null): string {
  if (!birthDate) return "";
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return "";
  const years = Math.floor((Date.now() - b.getTime()) / (365.25 * 24 * 3600 * 1000));
  return String(years);
}

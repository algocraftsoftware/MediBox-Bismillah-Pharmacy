export const PAGE_SIZE = 10;

export function toDateInput(d: Date): string {
  return d.toISOString().split("T")[0];
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigitsToWords(n: number): string {
  let s = "";
  if (n >= 100) {
    s += `${ONES[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    s += `${TENS[Math.floor(n / 10)]} `;
    n %= 10;
  }
  if (n > 0) s += `${ONES[n]} `;
  return s.trim();
}

function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const scales = ["", "Thousand", "Million", "Billion"];
  let scaleIdx = 0;
  const parts: string[] = [];
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) parts.unshift(`${threeDigitsToWords(chunk)} ${scales[scaleIdx]}`.trim());
    n = Math.floor(n / 1000);
    scaleIdx += 1;
  }
  return parts.join(" ");
}

// e.g. amountInWords(64) => "Sixty Four point Zero Zero Taka Only"
export function amountInWords(amount: number): string {
  const whole = Math.floor(amount);
  const frac = Math.round((amount - whole) * 100);
  const d1 = Math.floor(frac / 10);
  const d2 = frac % 10;
  const digitWord = (d: number) => (d === 0 ? "Zero" : ONES[d]);
  return `${integerToWords(whole)} point ${digitWord(d1)} ${digitWord(d2)} Taka Only`;
}

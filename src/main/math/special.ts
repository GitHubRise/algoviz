/** 特殊函数：阶乘与伽马（Lanczos 近似）。 */

const G = 7;

// Lanczos g=7, n=9 的系数
const C = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** Γ(z)，支持负半整数（反射公式），在非正整数处返回 NaN。 */
export function gamma(z: number): number {
  if (!Number.isFinite(z)) return Number.NaN;
  if (z < 0.5) {
    // 反射：Γ(z)Γ(1-z) = π / sin(πz)
    const s = Math.sin(Math.PI * z);
    if (Math.abs(s) < 1e-15) return Number.NaN; // 非正整数是极点
    return Math.PI / (s * gamma(1 - z));
  }

  let x = z - 1;
  let a = C[0]!;
  for (let i = 1; i < G + 2; i++) a += C[i]! / (x + i);
  const t = x + G + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

/** n! = Γ(n+1)；整数结果精确，非整数走伽马。 */
export function factorial(n: number): number {
  if (Number.isInteger(n) && n >= 0) {
    if (n > 170) return Number.POSITIVE_INFINITY;
    let acc = 1;
    for (let i = 2; i <= n; i++) acc *= i;
    return acc;
  }
  return gamma(n + 1);
}

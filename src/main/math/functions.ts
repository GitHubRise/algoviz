/** 内置函数与常量表。 */

export interface BuiltinFunction {
  fn: (...args: number[]) => number;
  minArgs: number;
  maxArgs: number;
  summary: string;
}

const unary = (fn: (x: number) => number, summary: string): BuiltinFunction => ({
  fn,
  minArgs: 1,
  maxArgs: 1,
  summary,
});

const binary = (fn: (a: number, b: number) => number, summary: string): BuiltinFunction => ({
  fn,
  minArgs: 2,
  maxArgs: 2,
  summary,
});

export const FUNCTIONS: Record<string, BuiltinFunction> = {
  sin: unary(Math.sin, '正弦'),
  cos: unary(Math.cos, '余弦'),
  tan: unary(Math.tan, '正切'),
  asin: unary(Math.asin, '反正弦'),
  acos: unary(Math.acos, '反余弦'),
  atan: unary(Math.atan, '反正切'),
  atan2: binary(Math.atan2, '两参数反正切'),
  sinh: unary(Math.sinh, '双曲正弦'),
  cosh: unary(Math.cosh, '双曲余弦'),
  tanh: unary(Math.tanh, '双曲正切'),
  sqrt: unary(Math.sqrt, '平方根'),
  cbrt: unary(Math.cbrt, '立方根'),
  abs: unary(Math.abs, '绝对值'),
  exp: unary(Math.exp, 'e 的幂'),
  ln: unary(Math.log, '自然对数'),
  log: unary(Math.log10, '常用对数'),
  log2: unary(Math.log2, '以 2 为底'),
  log10: unary(Math.log10, '常用对数'),
  floor: unary(Math.floor, '向下取整'),
  ceil: unary(Math.ceil, '向上取整'),
  round: unary(Math.round, '四舍五入'),
  trunc: unary(Math.trunc, '截断取整'),
  sign: unary(Math.sign, '符号函数'),
  min: { fn: (...a: number[]) => Math.min(...a), minArgs: 1, maxArgs: 8, summary: '最小值' },
  max: { fn: (...a: number[]) => Math.max(...a), minArgs: 1, maxArgs: 8, summary: '最大值' },
  pow: binary(Math.pow, '幂'),
  mod: binary((a, b) => a % b, '取余'),
  clamp: { fn: (v, lo, hi) => Math.min(hi, Math.max(lo, v)), minArgs: 3, maxArgs: 3, summary: '截断到区间' },
  step: binary((edge, x) => (x >= edge ? 1 : 0), '阶跃'),
  smoothstep: {
    fn: (edge0, edge1, x) => {
      const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    },
    minArgs: 3,
    maxArgs: 3,
    summary: '平滑阶跃',
  },
  gauss: unary((x) => Math.exp(-x * x), '高斯 e^(-x²)'),
  logistic: unary((x) => 1 / (1 + Math.exp(-x)), '逻辑斯蒂'),
};

export const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
};

export function isFunction(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FUNCTIONS, name);
}

/** 供界面展示的教程文本。 */
export const FUNCTION_HINT =
  'sin(x) · cos(x) · tan(x) · sqrt(x) · abs(x) · exp(x) · ln(x) · log(x) · ' +
  'floor(x) · sign(x) · min(x,1) · max(x,0) · gauss(x) · logistic(x) · pi · e · t';

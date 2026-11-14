/**
 * 复数求值：把同一份 AST 编译成 (re, im) → { re, im } 的闭包。
 *
 * 与 evaluate.ts 平行：那边处理实数、这边处理复数，语法完全一致。
 * 变量只有 `z`（与可选的 `t`），其余标识符按 0 处理。
 */

import { ParseError } from './lexer';
import { parse, type BinOp, type Node } from './parser';

export interface Cx {
  re: number;
  im: number;
}

export interface ComplexCompiled {
  fn: (re: number, im: number) => Cx;
  variables: string[];
  source: string;
}

const c = (re: number, im = 0): Cx => ({ re, im });

const add = (a: Cx, b: Cx): Cx => c(a.re + b.re, a.im + b.im);
const sub = (a: Cx, b: Cx): Cx => c(a.re - b.re, a.im - b.im);
const mul = (a: Cx, b: Cx): Cx => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);

function div(a: Cx, b: Cx): Cx {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return c(Number.NaN, Number.NaN);
  return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}

const magnitude = (a: Cx): number => Math.hypot(a.re, a.im);
const argument = (a: Cx): number => Math.atan2(a.im, a.re);

function cexp(a: Cx): Cx {
  const m = Math.exp(a.re);
  return c(m * Math.cos(a.im), m * Math.sin(a.im));
}

function clog(a: Cx): Cx {
  const m = magnitude(a);
  return m === 0 ? c(Number.NEGATIVE_INFINITY, 0) : c(Math.log(m), argument(a));
}

function csqrt(a: Cx): Cx {
  const m = magnitude(a);
  if (m === 0) return c(0, 0);
  const re = Math.sqrt((m + a.re) / 2);
  const im = Math.sign(a.im || 1) * Math.sqrt(Math.max(0, (m - a.re) / 2));
  return c(re, im);
}

function cpow(a: Cx, b: Cx): Cx {
  // 整数指数走连乘：更快，且 z^2 这类结果精确
  if (Math.abs(b.im) < 1e-12 && Number.isInteger(b.re) && Math.abs(b.re) <= 64) {
    let exp = Math.abs(b.re);
    let base = a;
    let acc = c(1, 0);
    while (exp > 0) {
      if (exp & 1) acc = mul(acc, base);
      base = mul(base, base);
      exp >>= 1;
    }
    return b.re >= 0 ? acc : div(c(1, 0), acc);
  }
  return cexp(mul(b, clog(a)));
}

const csin = (a: Cx): Cx => c(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im));
const ccos = (a: Cx): Cx => c(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im));
const ctan = (a: Cx): Cx => div(csin(a), ccos(a));
const csinh = (a: Cx): Cx => c(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im));
const ccosh = (a: Cx): Cx => c(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im));
const ctanh = (a: Cx): Cx => div(csinh(a), ccosh(a));

type UnaryFn = (a: Cx) => Cx;

const UNARY: Record<string, UnaryFn> = {
  abs: (a) => c(magnitude(a)),
  arg: (a) => c(argument(a)),
  conj: (a) => c(a.re, -a.im),
  real: (a) => c(a.re),
  imag: (a) => c(a.im),
  exp: cexp,
  ln: clog,
  log: clog,
  sqrt: csqrt,
  sin: csin,
  cos: ccos,
  tan: ctan,
  sinh: csinh,
  cosh: ccosh,
  tanh: ctanh,
};

export function compileComplex(source: string): ComplexCompiled {
  const ast = parse(source);
  const variables: string[] = [];
  const fn = compileNode(ast, variables);
  return { fn, variables, source };
}

function compileNode(node: Node, vars: string[]): (re: number, im: number) => Cx {
  switch (node.kind) {
    case 'num': {
      const v = node.value;
      return () => c(v, 0);
    }
    case 'var': {
      const name = node.name;
      if (name === 'z') return (re, im) => c(re, im);
      if (name === 'i') return () => c(0, 1);
      if (name === 't') {
        if (!vars.includes(name)) vars.push(name);
        return () => c(0, 0);
      }
      throw new ParseError(`未知函数或变量 "${name}"`, 0);
    }
    case 'unary': {
      const inner = compileNode(node.arg, vars);
      if (node.op === '-') return (re, im) => {
        const v = inner(re, im);
        return c(-v.re, -v.im);
      };
      if (node.op === '!') return (re, im) => c(inner(re, im).re ? 0 : 1, 0);
      return inner;
    }
    case 'binary': {
      const l = compileNode(node.left, vars);
      const r = compileNode(node.right, vars);
      const op: BinOp = node.op;
      switch (op) {
        case '+': return (re, im) => add(l(re, im), r(re, im));
        case '-': return (re, im) => sub(l(re, im), r(re, im));
        case '*': return (re, im) => mul(l(re, im), r(re, im));
        case '/': return (re, im) => div(l(re, im), r(re, im));
        case '^': return (re, im) => cpow(l(re, im), r(re, im));
        case '%': return (re, im) => c(l(re, im).re % r(re, im).re);
        case '<': return (re, im) => c(l(re, im).re < r(re, im).re ? 1 : 0);
        case '>': return (re, im) => c(l(re, im).re > r(re, im).re ? 1 : 0);
        case '<=': return (re, im) => c(l(re, im).re <= r(re, im).re ? 1 : 0);
        case '>=': return (re, im) => c(l(re, im).re >= r(re, im).re ? 1 : 0);
        case '==': return (re, im) => c(l(re, im).re === r(re, im).re ? 1 : 0);
        case '!=': return (re, im) => c(l(re, im).re !== r(re, im).re ? 1 : 0);
        case '&&': return (re, im) => c(l(re, im).re && r(re, im).re ? 1 : 0);
        case '||': return (re, im) => c(l(re, im).re || r(re, im).re ? 1 : 0);
      }
      throw new Error('未知运算符');
    }
    case 'call': {
      const name = node.name;
      if (name === 'pow' && node.args.length === 2) {
        const a = compileNode(node.args[0]!, vars);
        const b = compileNode(node.args[1]!, vars);
        return (re, im) => cpow(a(re, im), b(re, im));
      }
      const unary = UNARY[name];
      if (!unary) throw new ParseError(`未知函数 "${name}"`, 0);
      if (node.args.length !== 1) {
        throw new ParseError(`复数模式下的函数 "${name}" 只支持 1 个参数`, 0);
      }
      const arg = compileNode(node.args[0]!, vars);
      return (re, im) => unary(arg(re, im));
    }
  }
}

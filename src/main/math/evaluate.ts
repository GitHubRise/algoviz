import { ParseError, type Node } from './parser';
import { parse } from './parser';
import { CONSTANTS, FUNCTIONS } from './functions';

export type Scope = Record<string, number>;

export interface Compiled {
  /** 对外的求值函数；未定义的变量会得到 NaN。 */
  fn: (scope: Scope) => number;
  /** 表达式中出现的、非内置的变量名（按出现顺序去重）。 */
  variables: string[];
  source: string;
}

/**
 * 把 AST 编译成一棵闭包树。
 * 刻意不使用 eval / new Function：既能通过 CSP 严格的部署，也便于做变量检查。
 */
export function compileSource(source: string): Compiled {
  const ast = parse(source);
  const variables: string[] = [];
  const fn = compileNode(ast, variables);
  return { fn, variables, source };
}

function compileNode(node: Node, vars: string[]): (scope: Scope) => number {
  switch (node.kind) {
    case 'num': {
      const v = node.value;
      return () => v;
    }
    case 'var': {
      const name = node.name;
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
        const v = CONSTANTS[name]!;
        return () => v;
      }
      if (!vars.includes(name)) vars.push(name);
      return (scope) => {
        const v = scope[name];
        return v === undefined ? Number.NaN : v;
      };
    }
    case 'unary': {
      const inner = compileNode(node.arg, vars);
      return node.op === '-' ? (scope) => -inner(scope) : (scope) => +inner(scope);
    }
    case 'binary': {
      const l = compileNode(node.left, vars);
      const r = compileNode(node.right, vars);
      switch (node.op) {
        case '+': return (s) => l(s) + r(s);
        case '-': return (s) => l(s) - r(s);
        case '*': return (s) => l(s) * r(s);
        case '/': return (s) => l(s) / r(s);
        case '%': return (s) => l(s) % r(s);
        case '^': return (s) => Math.pow(l(s), r(s));
      }
      throw new Error('未知运算符');
    }
    case 'call': {
      const spec = FUNCTIONS[node.name];
      if (!spec) throw new ParseError(`未知函数 "${node.name}"`, 0);
      if (node.args.length < spec.minArgs || node.args.length > spec.maxArgs) {
        const range = spec.minArgs === spec.maxArgs
          ? `${spec.minArgs}`
          : `${spec.minArgs}~${spec.maxArgs}`;
        throw new ParseError(
          `函数 "${node.name}" 需要 ${range} 个参数，实际给了 ${node.args.length} 个`,
          0,
        );
      }
      const args = node.args.map((a) => compileNode(a, vars));
      const core = spec.fn;
      if (args.length === 1) {
        const a0 = args[0]!;
        return (s) => core(a0(s));
      }
      if (args.length === 2) {
        const [a0, a1] = args as [(s: Scope) => number, (s: Scope) => number];
        return (s) => core(a0(s), a1(s));
      }
      return (s) => core(...args.map((a) => a(s)));
    }
  }
}

/** 语法 / 词法检查，不抛异常，供输入框实时校验。 */
export function validate(source: string): { ok: true; variables: string[] } | { ok: false; message: string } {
  try {
    const compiled = compileSource(source);
    return { ok: true, variables: compiled.variables };
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, message: err.message };
    return { ok: false, message: (err as Error).message };
  }
}

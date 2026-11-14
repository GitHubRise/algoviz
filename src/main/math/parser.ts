import { ParseError, tokenize, type Token } from './lexer';
import { isFunction } from './functions';

export { ParseError } from './lexer';

export type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: '-' | '+' | '!'; arg: Node }
  | { kind: 'binary'; op: BinOp; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

export type BinOp =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '^'
  | '<'
  | '>'
  | '<='
  | '>='
  | '=='
  | '!='
  | '&&'
  | '||';

/** 结合力：数字越大结合越紧。比较低于加减，逻辑低于比较。 */
const BINDING: Record<BinOp, number> = {
  '||': 2,
  '&&': 3,
  '<': 5,
  '>': 5,
  '<=': 5,
  '>=': 5,
  '==': 5,
  '!=': 5,
  '+': 10,
  '-': 10,
  '*': 20,
  '/': 20,
  '%': 20,
  '^': 40,
};

const BP_MUL = BINDING['*'];
const BP_UNARY = 25;

function isBinOp(value: string): value is BinOp {
  return Object.prototype.hasOwnProperty.call(BINDING, value);
}

/**
 * Pratt 解析器。
 * 支持隐式乘法（2x、2sin(x)）、^ 右结合、比较（< > <= >= == !=）、逻辑（&& || !）。
 */
export class Parser {
  private tokens: Token[];
  private index = 0;

  constructor(src: string) {
    this.tokens = tokenize(src);
  }

  parse(): Node {
    const node = this.parseExpr(0);
    const tok = this.peek();
    if (tok.type !== 'eof') throw new ParseError(`多余的符号 "${tok.value}"`, tok.pos);
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private next(): Token {
    return this.tokens[this.index++]!;
  }

  private parseExpr(minBp: number): Node {
    let left = this.parseUnary();

    for (;;) {
      const tok = this.peek();

      // 隐式乘法：左侧已是一个完整的项，右侧紧跟数字、标识符或左括号
      if (tok.type === 'number' || tok.type === 'ident' || tok.type === 'lparen') {
        if (BP_MUL < minBp) break;
        const right = this.parseExpr(BP_MUL + 1);
        left = { kind: 'binary', op: '*', left, right };
        continue;
      }

      if (tok.type !== 'op') break;

      const op = tok.value;
      if (!isBinOp(op)) break;
      const bp = BINDING[op];
      if (bp < minBp) break;

      this.next();
      // ^ 右结合：右侧的最小结合力取 bp，其余取 bp + 1
      const right = this.parseExpr(op === '^' ? bp : bp + 1);
      left = { kind: 'binary', op, left, right };
    }

    return left;
  }

  private parseUnary(): Node {
    const tok = this.peek();
    if (tok.type === 'op' && (tok.value === '-' || tok.value === '+' || tok.value === '!')) {
      this.next();
      const arg = this.parseExpr(BP_UNARY);
      if (tok.value === '+') return arg;
      return { kind: 'unary', op: tok.value, arg };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const tok = this.next();

    if (tok.type === 'number') return { kind: 'num', value: tok.num! };

    if (tok.type === 'lparen') {
      const inner = this.parseExpr(0);
      const close = this.next();
      if (close.type !== 'rparen') throw new ParseError('缺少右括号 ")"', close.pos);
      return inner;
    }

    if (tok.type === 'ident') {
      // 只有已知函数名才当调用处理，否则视为变量
      if (isFunction(tok.value)) {
        const open = this.peek();
        if (open.type !== 'lparen') {
          throw new ParseError(`函数 "${tok.value}" 需要参数，例如 ${tok.value}(x)`, open.pos);
        }
        this.next();
        const args: Node[] = [];
        if (this.peek().type !== 'rparen') {
          for (;;) {
            args.push(this.parseExpr(0));
            if (this.peek().type === 'comma') {
              this.next();
              continue;
            }
            break;
          }
        }
        const close = this.next();
        if (close.type !== 'rparen') throw new ParseError('函数调用缺少右括号 ")"', close.pos);
        return { kind: 'call', name: tok.value, args };
      }
      return { kind: 'var', name: tok.value };
    }

    if (tok.type === 'eof') throw new ParseError('表达式不完整', tok.pos);
    throw new ParseError(`意外的符号 "${tok.value}"`, tok.pos);
  }
}

export function parse(src: string): Node {
  const trimmed = src.trim();
  if (!trimmed) throw new ParseError('表达式为空', 0);
  return new Parser(trimmed).parse();
}

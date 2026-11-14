export class ParseError extends Error {
  readonly pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.name = 'ParseError';
    this.pos = pos;
  }
}

export type TokenType = 'number' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
  num?: number;
}

const OPS = new Set(['+', '-', '*', '/', '^', '%', ',', '<', '>', '!', '=', '&', '|']);

/** 双字符运算符优先匹配 */
const TWO_CHAR_OPS = new Set(['**', '<=', '>=', '==', '!=', '&&', '||']);

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch, pos: i++ });
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch, pos: i++ });
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ch, pos: i++ });
      continue;
    }
    if (OPS.has(ch)) {
      const pair = src.slice(i, i + 2);
      if (TWO_CHAR_OPS.has(pair)) {
        // ** 等价于 ^，其余原样保留
        tokens.push({ type: 'op', value: pair === '**' ? '^' : pair, pos: i });
        i += 2;
        continue;
      }
      tokens.push({ type: 'op', value: ch, pos: i++ });
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(src[i + 1] ?? ''))) {
      const start = i;
      while (i < src.length && isDigit(src[i]!)) i++;
      if (src[i] === '.') {
        i++;
        while (i < src.length && isDigit(src[i]!)) i++;
      }
      if (src[i] === 'e' || src[i] === 'E') {
        const save = i;
        i++;
        if (src[i] === '+' || src[i] === '-') i++;
        if (isDigit(src[i] ?? '')) {
          while (i < src.length && isDigit(src[i]!)) i++;
        } else {
          i = save; // 不是指数，回退
        }
      }
      const raw = src.slice(start, i);
      const num = Number(raw);
      if (!Number.isFinite(num)) throw new ParseError(`无法识别的数字 "${raw}"`, start);
      tokens.push({ type: 'number', value: raw, pos: start, num });
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      while (i < src.length && isIdentPart(src[i]!)) i++;
      tokens.push({ type: 'ident', value: src.slice(start, i), pos: start });
      continue;
    }

    throw new ParseError(`无法识别的字符 "${ch}"`, i);
  }

  tokens.push({ type: 'eof', value: '', pos: src.length });
  return tokens;
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}
function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/**
 * 把粘贴进来的公式规范化成解析器能吃的形式。
 *
 * 覆盖三类来源：纯文本（从网页/聊天里复制的 `y = sin x`）、LaTeX（`\frac{1}{2}`）、
 * 以及带 Unicode 数学符号的排版文本（`x²`、`√x`、`×`、全角括号）。
 * 同时根据前缀推断曲线类型：`y=` → 显式，`r=` → 极坐标，`F(x,y)=` 或含 x、y 的等式 → 隐函数，
 * `x=…, y=…` → 参数方程。
 */

export type CurveMode = 'explicit' | 'implicit' | 'polar' | 'parametric';

export interface NormalizedFormula {
  source: string;
  mode: CurveMode;
  /** 参数方程的第二条表达式（y 分量） */
  sourceY?: string;
  /** 是否发生过改写（供界面提示「已规范化」） */
  changed: boolean;
}

const SUPERSCRIPT: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁻': '-', '⁺': '+',
};

const LATEX_NAMES =
  /\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|max|min|abs|sqrt)/g;

export function normalizeFormula(raw: string): NormalizedFormula {
  const original = raw;
  let text = raw.trim();

  // 行内数学：$...$ / $$...$$
  text = text.replace(/^\$+/, '').replace(/\$+$/, '').trim();

  // LaTeX：分式（允许一层嵌套外层）、上标花括号、下标、间距与 \left \right
  text = expandFractions(text);
  text = text.replace(/\^\{([^{}]*)\}/g, '^($1)');
  text = text.replace(/_\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\[,;:!]/g, '');
  text = text.replace(/\\(left|right|bigl|bigr|Bigl|Bigr)\s*/g, '');
  text = text.replace(LATEX_NAMES, '$1');
  text = text
    .replace(/\\pi\b/g, 'pi')
    .replace(/\\theta\b/g, 'th')
    .replace(/\\cdot\b/g, '*')
    .replace(/\\times\b/g, '*')
    .replace(/\\div\b/g, '/');
  text = text.replace(/\\[a-zA-Z]+/g, '');

  // 上标必须先于 NFKC：NFKC 会把 ² 直接折成数字 2，之后就分不出「上标」了
  text = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/g, (run) => {
    const digits = Array.from(run).map((ch) => SUPERSCRIPT[ch] ?? '').join('');
    return digits.length === 1 && digits !== '-' ? `^${digits}` : `^(${digits})`;
  });

  // 全角 → 半角（括号、逗号、等号、数字、字母）
  text = text.normalize('NFKC');

  // 排版用的 Unicode 符号
  text = text
    .replace(/[−–—]/g, '-')
    .replace(/[×·∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([A-Za-z0-9.]+)/g, 'sqrt($1)')
    .replace(/π/g, 'pi')
    .replace(/[θϑ]/g, 'th')
    .replace(/∞/g, '1e308');

  // 前缀推断曲线类型
  let mode: CurveMode = 'explicit';

  // 参数方程：x=…, y=…（两项都要有，缺一不成式）
  const parametric = /^\s*x\s*=\s*([^,;]+?)\s*[,;]\s*y\s*=\s*(.+)$/i.exec(text);
  if (parametric) {
    return {
      source: parametric[1]!.trim(),
      sourceY: parametric[2]!.trim(),
      mode: 'parametric',
      changed: true,
    };
  }

  const explicit = text.replace(/^\s*(?:y|f\s*\(\s*x\s*\)|g\s*\(\s*x\s*\)|h\s*\(\s*x\s*\))\s*=\s*/i, '');
  const polar = text.replace(/^\s*(?:r|ρ)\s*=\s*/i, '');
  const implicit = text.replace(/^\s*[Ff]\s*\(\s*x\s*,\s*y\s*\)\s*=\s*/, '');

  if (explicit !== text) {
    text = explicit;
  } else if (polar !== text) {
    text = polar;
    mode = 'polar';
  } else if (implicit !== text) {
    text = implicit;
    mode = 'implicit';
  } else if (text.includes('=') && /(^|[^A-Za-z_])x([^A-Za-z_]|$)/.test(text) && /(^|[^A-Za-z_])y([^A-Za-z_]|$)/.test(text)) {
    const eq = text.indexOf('=');
    const left = text.slice(0, eq).trim();
    const right = text.slice(eq + 1).trim();
    if (left && right) {
      text = `${left}-(${right})`;
      mode = 'implicit';
    }
  } else if (/^\s*x\s*=/.test(text)) {
    // 只有 x=…：不成参数方程，按普通表达式取右值
    text = text.replace(/^\s*x\s*=\s*/, '');
  }

  text = text.replace(/[;；]\s*$/, '').replace(/\s+/g, ' ').trim();

  return { source: text, mode, changed: text !== original.trim() };
}

/** 按行拆成多条；空行忽略。 */
export function normalizeFormulaBlock(text: string): { entries: NormalizedFormula[]; notes: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const entries = lines.map((line) => normalizeFormula(line));
  const notes: string[] = [];
  if (entries.some((e) => e.changed)) notes.push('已把粘贴内容规范化');
  if (entries.length > 1) notes.push(`识别到 ${entries.length} 条公式`);
  return { entries, notes };
}

/** 反复套用分式替换，处理 \frac 里再嵌一层的情况。 */
function expandFractions(input: string): string {
  let text = input;
  const pattern = /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
  for (let i = 0; i < 8; i++) {
    const next = text.replace(pattern, '(( $1 )/( $2 ))').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    if (next === text) break;
    text = next;
  }
  return text;
}

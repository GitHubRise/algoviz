import { describe, expect, it } from 'vitest';
import { compileSource } from '../main/math/evaluate';
import { normalizeFormula, normalizeFormulaBlock } from '../main/math/normalize';

function value(src: string, scope: Record<string, number> = {}): number {
  return compileSource(src).fn(scope);
}

describe('比较、逻辑与分段', () => {
  it('T-E17 if 取真分支', () => {
    expect(value('if(2 > 1, 10, 20)')).toBe(10);
  });

  it('T-E18 if 取假分支', () => {
    expect(value('if(x >= 2, x, -x)', { x: -3 })).toBe(3);
  });

  it('T-E19 逻辑与成立', () => {
    expect(value('if(x > 0 && x < 2, 1, 0)', { x: 1 })).toBe(1);
  });

  it('T-E20 逻辑与不成立', () => {
    expect(value('if(x > 0 && x < 2, 1, 0)', { x: 3 })).toBe(0);
  });

  it('T-E21 逻辑非', () => {
    expect(value('if(!(x > 1), 5, 6)', { x: 0 })).toBe(5);
  });

  it('T-E22 比较结果按 0/1 参与运算', () => {
    expect(value('2 < 3')).toBe(1);
  });

  it('T-E23 if 参数个数不对必须报错', () => {
    expect(() => value('if(1, 2)')).toThrow(/需要 3 个参数/);
  });
});

describe('公式粘贴规范化', () => {
  it('T-N01 根号', () => {
    expect(normalizeFormula('√x').source).toBe('sqrt(x)');
  });

  it('T-N02 去掉 y= 前缀', () => {
    const r = normalizeFormula('y = 2x + 1');
    expect(r.source).toBe('2x + 1');
    expect(r.mode).toBe('explicit');
  });

  it('T-N03 上标数字', () => {
    expect(normalizeFormula('x²').source).toBe('x^2');
  });

  it('T-N04 希腊字母', () => {
    expect(normalizeFormula('π').source).toBe('pi');
  });

  it('T-N05 r= 前缀识别为极坐标', () => {
    const r = normalizeFormula('r=2cos(3θ)');
    expect(r.source).toBe('2cos(3th)');
    expect(r.mode).toBe('polar');
  });

  it('T-N06 F(x,y)= 前缀识别为隐函数', () => {
    const r = normalizeFormula('F(x,y)=x^2+y^2-4');
    expect(r.source).toBe('x^2+y^2-4');
    expect(r.mode).toBe('implicit');
  });

  it('T-N07 全角括号', () => {
    expect(normalizeFormula('sin（x）').source).toBe('sin(x)');
  });

  it('T-N08 LaTeX 的 sin 与 left/right', () => {
    expect(normalizeFormula('\\sin\\left(x\\right)').source).toBe('sin(x)');
  });

  it('T-N09 LaTeX 分式', () => {
    expect(normalizeFormula('\\frac{1}{2}x').source).toBe('((1)/(2))x');
  });

  it('T-N10 LaTeX 上标花括号', () => {
    expect(normalizeFormula('e^{-x}').source).toBe('e^(-x)');
  });

  it('T-N11 全角与统一乘除号', () => {
    expect(normalizeFormula('2×3÷4−1').source).toBe('2*3/4-1');
  });

  it('T-N12 无前缀但含 x、y 的等式推断为隐函数', () => {
    const r = normalizeFormula('x²+y²=4');
    expect(r.source).toBe('x^2+y^2-(4)');
    expect(r.mode).toBe('implicit');
  });

  it('T-N13 多行粘贴得到多条', () => {
    const r = normalizeFormulaBlock('sin(x)\ncos(x)');
    expect(r.entries).toHaveLength(2);
    expect(r.entries.every((e) => e.mode === 'explicit')).toBe(true);
  });

  it('T-N14 空输入不抛异常且没有条目', () => {
    expect(normalizeFormulaBlock('   ').entries).toHaveLength(0);
  });

  it('T-N15 只有前缀时 source 为空串', () => {
    const r = normalizeFormula('y=');
    expect(r.source).toBe('');
  });

  it('T-N16 参数方程识别出两条表达式', () => {
    const r = normalizeFormula('x=cos(u), y=sin(u)');
    expect(r.mode).toBe('parametric');
    expect(r.source).toBe('cos(u)');
    expect(r.sourceY).toBe('sin(u)');
  });

  it('T-N17 只有 x= 时按普通表达式处理', () => {
    const r = normalizeFormula('x=cos(u)');
    expect(r.mode).toBe('explicit');
    expect(r.source).toBe('cos(u)');
  });
});

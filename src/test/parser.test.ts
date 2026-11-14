import { describe, expect, it } from 'vitest';
import { compileSource } from '../main/math/evaluate';

function value(src: string, scope: Record<string, number> = {}): number {
  return compileSource(src).fn(scope);
}

describe('表达式解析与求值', () => {
  it('T-E01 乘法优先级', () => {
    expect(value('1 + 2 * 3')).toBe(7);
  });

  it('T-E02 幂右结合', () => {
    expect(value('2 ^ 3 ^ 2')).toBe(512);
  });

  it('T-E03 一元负号低于幂', () => {
    expect(value('-2 ^ 2')).toBe(-4);
  });

  it('T-E04 减法左结合', () => {
    expect(value('4 - 2 - 1')).toBe(1);
  });

  it('T-E05 隐式乘法', () => {
    expect(value('2x', { x: 3 })).toBe(6);
  });

  it('T-E06 函数后接隐式乘法', () => {
    expect(value('sin(x)cos(x)', { x: 0 })).toBe(0);
  });

  it('T-E07 常量参与隐式乘法', () => {
    expect(value('2pi')).toBeCloseTo(6.2831853, 6);
  });

  it('T-E08 log 是常用对数', () => {
    expect(value('log(1000)')).toBeCloseTo(3, 10);
  });

  it('T-E09 多参数函数', () => {
    expect(value('min(3, 1, 2)')).toBe(1);
  });

  it('T-E10 clamp 截断', () => {
    expect(value('clamp(5, 0, 3)')).toBe(3);
  });

  it('T-E11 不完整表达式报错', () => {
    expect(() => value('1 +')).toThrow(/表达式不完整/);
  });

  it('T-E12 缺右括号报错', () => {
    expect(() => value('(1 + 2')).toThrow(/缺少右括号/);
  });

  it('T-E13 参数个数不对报错', () => {
    expect(() => value('sin(1, 2)')).toThrow(/需要 1 个参数/);
  });

  it('T-E14 非法字符报错', () => {
    expect(() => value('2 @ 3')).toThrow(/无法识别的字符/);
  });

  it('T-E15 空表达式报错', () => {
    expect(() => value('   ')).toThrow(/表达式为空/);
  });

  it('T-E16 未知变量求值为 NaN', () => {
    expect(Number.isNaN(value('x'))).toBe(true);
  });
});

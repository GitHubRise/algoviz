import { describe, expect, it } from 'vitest';
import { compileComplex } from '../main/math/complex';

function evalAt(src: string, re: number, im: number): { re: number; im: number } {
  return compileComplex(src).fn(re, im);
}

describe('复数求值', () => {
  it('T-C01 z^2 在 1+i 得 2i', () => {
    const v = evalAt('z^2', 1, 1);
    expect(v.re).toBeCloseTo(0, 9);
    expect(v.im).toBeCloseTo(2, 9);
  });

  it('T-C02 1/z 在 i 得 -i', () => {
    const v = evalAt('1/z', 0, 1);
    expect(v.re).toBeCloseTo(0, 9);
    expect(v.im).toBeCloseTo(-1, 9);
  });

  it('T-C03 exp(iπ/2) 得 i', () => {
    const v = evalAt('exp(z)', 0, Math.PI / 2);
    expect(v.re).toBeCloseTo(0, 9);
    expect(v.im).toBeCloseTo(1, 9);
  });

  it('T-C04 abs(3+4i) = 5', () => {
    const v = evalAt('abs(z)', 3, 4);
    expect(v.re).toBeCloseTo(5, 9);
    expect(v.im).toBeCloseTo(0, 9);
  });

  it('T-C05 arg(i) = π/2', () => {
    const v = evalAt('arg(z)', 0, 1);
    expect(v.re).toBeCloseTo(Math.PI / 2, 9);
    expect(v.im).toBeCloseTo(0, 9);
  });

  it('T-C06 sin(iπ/2) = i·sinh(π/2)', () => {
    const v = evalAt('sin(z)', 0, Math.PI / 2);
    expect(v.re).toBeCloseTo(0, 9);
    expect(v.im).toBeCloseTo(Math.sinh(Math.PI / 2), 6);
  });

  it('T-C07 未知函数必须报错', () => {
    expect(() => compileComplex('foo(z)')).toThrow(/未知函数/);
  });
});

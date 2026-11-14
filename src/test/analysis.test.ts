import { describe, expect, it } from 'vitest';
import { findExtrema, findIntersections, findRoots } from '../main/math/analysis';
import { decodeShare, encodeShare } from '../main/core/share';

const sin = (x: number): number => Math.sin(x);
const near = (value: number, target: number, tol = 1e-3): boolean => Math.abs(value - target) < tol;

describe('零点与极值', () => {
  it('T-A01 sin 在 (-4,4) 有 3 个零点', () => {
    const roots = findRoots(sin, -4, 4);
    expect(roots).toHaveLength(3);
    const xs = roots.map((r) => r.x).sort((a, b) => a - b);
    expect(near(xs[0]!, -Math.PI)).toBe(true);
    expect(near(xs[1]!, 0)).toBe(true);
    expect(near(xs[2]!, Math.PI)).toBe(true);
    expect(roots.every((r) => r.kind === 'root')).toBe(true);
  });

  it('T-A02 抛物线有两个零点', () => {
    const roots = findRoots((x) => x * x - 4, -5, 5);
    expect(roots).toHaveLength(2);
    const xs = roots.map((r) => r.x).sort((a, b) => a - b);
    expect(near(xs[0]!, -2)).toBe(true);
    expect(near(xs[1]!, 2)).toBe(true);
  });

  it('T-A03 无零点', () => {
    expect(findRoots((x) => x * x + 1, -5, 5)).toHaveLength(0);
  });

  it('T-A04 sin 在 (-4,4) 有一个极大一个极小', () => {
    const marks = findExtrema(sin, -4, 4);
    expect(marks).toHaveLength(2);
    const max = marks.find((m) => m.kind === 'max');
    const min = marks.find((m) => m.kind === 'min');
    expect(max).toBeDefined();
    expect(min).toBeDefined();
    expect(Math.abs(max!.x - Math.PI / 2)).toBeLessThan(1e-2);
    expect(Math.abs(min!.x + Math.PI / 2)).toBeLessThan(1e-2);
  });

  it('T-A05 抛物线只有一个极小且落在 0', () => {
    const marks = findExtrema((x) => x * x, -1, 1);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.kind).toBe('min');
    expect(Math.abs(marks[0]!.x)).toBeLessThan(1e-3);
  });

  it('T-A06 鞍点不算极值', () => {
    expect(findExtrema((x) => x * x * x, -1, 1)).toHaveLength(0);
  });

  it('T-A07 退化区间返回空且不抛异常', () => {
    expect(findRoots(sin, 0, 0)).toHaveLength(0);
  });

  it('T-A08 反向区间也能工作', () => {
    const marks = findExtrema((x) => x * x, 10, -10);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.kind).toBe('min');
    expect(Math.abs(marks[0]!.x)).toBeLessThan(1e-2);
  });

  it('T-A09 两条曲线交于三点', () => {
    const hits = findIntersections(sin, () => 0.5, -4, 4);
    expect(hits).toHaveLength(3);
    const xs = hits.map((h) => h.x).sort((a, b) => a - b);
    expect(Math.abs(xs[0]! - (-7 * Math.PI / 6))).toBeLessThan(1e-3);
    expect(Math.abs(xs[1]! - Math.asin(0.5))).toBeLessThan(1e-3);
    expect(Math.abs(xs[2]! - (Math.PI - Math.asin(0.5)))).toBeLessThan(1e-3);
  });

  it('T-A10 抛物线与直线交于 -1 和 3', () => {
    const hits = findIntersections((x) => x * x, (x) => 2 * x + 3, -5, 5);
    expect(hits).toHaveLength(2);
    const xs = hits.map((h) => h.x).sort((a, b) => a - b);
    expect(Math.abs(xs[0]! + 1)).toBeLessThan(1e-3);
    expect(Math.abs(xs[1]! - 3)).toBeLessThan(1e-3);
  });

  it('T-A11 不相交时为空', () => {
    expect(findIntersections((x) => x * x + 1, () => 0, -5, 5)).toHaveLength(0);
  });

  it('T-A12 相切且不在采样格上时检不出来', () => {
    expect(findIntersections((x) => (x - 1.2345) ** 2, () => 0, -5, 5)).toHaveLength(0);
  });
});

describe('链接分享编码', () => {
  it('T-H01 编码后可还原', () => {
    const state = { a: 1, b: '中文', list: [1, 2] };
    expect(decodeShare(encodeShare(state))).toEqual(state);
  });

  it('T-H02 非法内容返回 null 而不是抛错', () => {
    expect(decodeShare('这不是编码')).toBeNull();
  });

  it('T-H03 空串返回 null', () => {
    expect(decodeShare('')).toBeNull();
  });
});

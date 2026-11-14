import { describe, expect, it } from 'vitest';
import { runSort, type SortKind } from '../main/modules/sorting/algorithms';

const KINDS: SortKind[] = ['bubble', 'insertion', 'selection', 'shell', 'merge', 'quick', 'heap', 'counting'];

function sortedCopy(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

describe('排序算法', () => {
  it('T-S01 bubble 能把 [5,1,4,2,8] 排成升序', () => {
    expect(runSort('bubble', [5, 1, 4, 2, 8]).sorted).toEqual([1, 2, 4, 5, 8]);
  });

  it('T-S02 首帧必须是原始输入', () => {
    const input = [5, 1, 4, 2, 8];
    const trace = runSort('bubble', input);
    expect(trace.frames[0]!.values).toEqual(input);
  });

  it('T-S03 末帧必须等于终态', () => {
    const trace = runSort('quick', [5, 1, 4, 2, 8]);
    expect(trace.frames.at(-1)!.values).toEqual(trace.sorted);
  });

  it('T-S04 五种算法对含重复值的输入结果一致', () => {
    const input = [9, 3, 7, 1, 5, 3, 8];
    const expected = sortedCopy(input);
    for (const kind of KINDS) {
      expect(runSort(kind, input).sorted, kind).toEqual(expected);
    }
  });

  it('T-S05 两元素输入至少比较一次且至少两帧', () => {
    const trace = runSort('insertion', [4, 2]);
    expect(trace.comparisons).toBeGreaterThanOrEqual(1);
    expect(trace.frames.length).toBeGreaterThanOrEqual(2);
  });

  it('T-S06 空输入不抛异常且至少一帧', () => {
    const trace = runSort('bubble', []);
    expect(trace.sorted).toEqual([]);
    expect(trace.frames.length).toBeGreaterThanOrEqual(1);
  });

  it('T-S07 单元素输入比较次数为 0', () => {
    const trace = runSort('merge', [7]);
    expect(trace.sorted).toEqual([7]);
    expect(trace.comparisons).toBe(0);
  });

  it('T-S08 已升序输入保持原样', () => {
    const trace = runSort('selection', [1, 2, 3, 4, 5]);
    expect(trace.sorted).toEqual([1, 2, 3, 4, 5]);
    expect(trace.frames.length).toBeGreaterThanOrEqual(1);
  });

  it('T-S09 全等输入不抛异常', () => {
    expect(runSort('insertion', [3, 3, 3, 3]).sorted).toEqual([3, 3, 3, 3]);
  });

  it('T-S10 逆序输入能排正', () => {
    expect(runSort('bubble', [5, 4, 3, 2, 1]).sorted).toEqual([1, 2, 3, 4, 5]);
  });

  it('T-S11 每帧长度与输入一致', () => {
    const input = [4, 1, 3];
    for (const kind of KINDS) {
      const trace = runSort(kind, input);
      for (const frame of trace.frames) {
        expect(frame.values.length, kind).toBe(input.length);
        expect(frame.roles.length, kind).toBe(input.length);
      }
    }
  });

  it('T-S12 角色码必须落在 0..5', () => {
    for (const kind of KINDS) {
      const trace = runSort(kind, [4, 1, 3, 2]);
      for (const frame of trace.frames) {
        for (const role of frame.roles) {
          expect(role, kind).toBeGreaterThanOrEqual(0);
          expect(role, kind).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('T-S13 未知算法必须报错', () => {
    expect(() => runSort('__nope__' as SortKind, [1])).toThrow(/未知排序算法/);
  });

  it('T-S14 排序过程真的发生了比较（计数排序除外）', () => {
    for (const kind of KINDS.filter((k) => k !== 'counting')) {
      expect(runSort(kind, [3, 1, 2]).comparisons, kind).toBeGreaterThan(0);
    }
  });

  it('T-S15 希尔排序能处理逆序', () => {
    expect(runSort('shell', [9, 7, 5, 3, 1]).sorted).toEqual([1, 3, 5, 7, 9]);
  });

  it('T-S16 堆排序能处理随机序列', () => {
    expect(runSort('heap', [5, 9, 1, 7, 3]).sorted).toEqual([1, 3, 5, 7, 9]);
  });

  it('T-S17 计数排序能处理重复值', () => {
    expect(runSort('counting', [4, 2, 4, 1, 2, 4]).sorted).toEqual([1, 2, 2, 4, 4, 4]);
  });

  it('T-S18 计数排序不是比较排序', () => {
    const trace = runSort('counting', [4, 2, 4, 1]);
    expect(trace.comparisons).toBe(0);
    expect(trace.writes).toBe(4);
  });
});

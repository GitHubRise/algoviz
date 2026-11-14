import { describe, expect, it } from 'vitest';
import { benchmarkSorts } from '../main/modules/sorting/algorithms';
import { benchmarkPathfinding } from '../main/modules/pathfinding/algorithms';

describe('算法对比', () => {
  it('T-CMP01 八种排序在同一输入上都算对', () => {
    const rows = benchmarkSorts([3, 1, 2]);
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.ok, row.kind).toBe(true);
      expect(row.frames, row.kind).toBeGreaterThan(0);
      expect(row.comparisons, row.kind).toBeGreaterThanOrEqual(0);
      expect(row.writes, row.kind).toBeGreaterThanOrEqual(0);
    }
  });

  it('T-CMP02 计数排序不产生比较', () => {
    const rows = benchmarkSorts([4, 2, 4, 1]);
    const counting = rows.find((r) => r.kind === 'counting');
    expect(counting?.comparisons).toBe(0);
  });

  it('T-CMP03 五种寻路在空网格上的代价', () => {
    const spec = { cols: 5, rows: 5, walls: new Set<number>(), start: 0, goal: 24 };
    const rows = benchmarkPathfinding(spec);
    expect(rows).toHaveLength(5);

    for (const kind of ['bfs', 'dijkstra', 'astar']) {
      const row = rows.find((r) => r.kind === kind);
      expect(row?.found, kind).toBe(true);
      expect(row?.cost, kind).toBe(8);
      expect(row?.visited ?? 0, kind).toBeGreaterThan(0);
    }
    expect(rows.find((r) => r.kind === 'greedy')?.found).toBe(true);
  });

  it('T-CMP04 不可达时全部为假且代价为 0', () => {
    const spec = { cols: 5, rows: 5, walls: new Set([18, 19, 23]), start: 0, goal: 24 };
    const rows = benchmarkPathfinding(spec);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.found, row.kind).toBe(false);
      expect(row.cost, row.kind).toBe(0);
    }
  });
});

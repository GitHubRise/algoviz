import { describe, expect, it } from 'vitest';
import {
  solve,
  type AlgoKind,
  type GridSpec,
} from '../main/modules/pathfinding/algorithms';

const KINDS: AlgoKind[] = ['bfs', 'dfs', 'dijkstra', 'astar', 'greedy'];

function grid(
  cols: number,
  rows: number,
  walls: number[] = [],
  start = 0,
  goal = cols * rows - 1,
): GridSpec {
  return { cols, rows, walls: new Set(walls), start, goal };
}

function manhattan(a: number, b: number, cols: number): number {
  const ax = a % cols;
  const ay = Math.floor(a / cols);
  const bx = b % cols;
  const by = Math.floor(b / cols);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

describe('寻路算法', () => {
  it('T-P01 BFS 在 5×5 空网格上给出最短路径', () => {
    const r = solve('bfs', grid(5, 5));
    expect(r.found).toBe(true);
    expect(r.path.length).toBe(9);
  });

  it('T-P02 A* 在 5×5 空网格上给出最短路径', () => {
    const r = solve('astar', grid(5, 5));
    expect(r.found).toBe(true);
    expect(r.path.length).toBe(9);
  });

  it('T-P03 Dijkstra 在 5×5 空网格上给出最短路径', () => {
    const r = solve('dijkstra', grid(5, 5));
    expect(r.found).toBe(true);
    expect(r.path.length).toBe(9);
  });

  it('T-P04 DFS 能找到终点', () => {
    expect(solve('dfs', grid(5, 5)).found).toBe(true);
  });

  it('T-P05 路径相邻、首尾正确', () => {
    const spec = grid(5, 5, [7, 8, 12], 0, 24);
    for (const kind of KINDS) {
      const r = solve(kind, spec);
      expect(r.found, kind).toBe(true);
      expect(r.path[0], kind).toBe(spec.start);
      expect(r.path.at(-1), kind).toBe(spec.goal);
      for (let i = 1; i < r.path.length; i++) {
        expect(manhattan(r.path[i - 1]!, r.path[i]!, spec.cols), `${kind}@${i}`).toBe(1);
      }
    }
  });

  it('T-P06 路径不穿墙', () => {
    const walls = [7, 8, 12];
    const spec = grid(5, 5, walls, 0, 24);
    for (const kind of KINDS) {
      const r = solve(kind, spec);
      for (const cell of r.path) {
        expect(walls.includes(cell), `${kind}:${cell}`).toBe(false);
      }
    }
  });

  it('T-P07 起点等于终点', () => {
    const r = solve('bfs', grid(5, 5, [], 12, 12));
    expect(r.found).toBe(true);
    expect(r.path).toEqual([12]);
    expect(r.cost).toBe(0);
  });

  it('T-P08 目标被墙围死时不可达', () => {
    // 24 号的四邻 18、23 全封，且 19 也封
    const r = solve('bfs', grid(5, 5, [18, 19, 23], 0, 24));
    expect(r.found).toBe(false);
    expect(r.path).toEqual([]);
  });

  it('T-P09 起点被墙围死时不可达', () => {
    const r = solve('dijkstra', grid(5, 5, [1, 5], 0, 24));
    expect(r.found).toBe(false);
  });

  it('T-P10 单行网格可以走通', () => {
    const r = solve('bfs', grid(7, 1));
    expect(r.found).toBe(true);
    expect(r.path.length).toBe(7);
  });

  it('T-P11 只留一个缺口的墙必须穿过缺口', () => {
    // 5×5，第二行（索引 5..9）封住 5,6,8,9，留 7 为缺口
    const spec = grid(5, 5, [5, 6, 8, 9], 0, 24);
    for (const kind of KINDS) {
      const r = solve(kind, spec);
      expect(r.found, kind).toBe(true);
      expect(r.path.includes(7), kind).toBe(true);
    }
  });

  it('T-P12 visitedCount 在合法区间内', () => {
    const spec = grid(6, 4, [9, 10, 11]);
    for (const kind of KINDS) {
      const r = solve(kind, spec);
      expect(r.visitedCount, kind).toBeGreaterThan(0);
      expect(r.visitedCount, kind).toBeLessThanOrEqual(spec.cols * spec.rows);
    }
  });

  it('T-P13 越界索引必须报错', () => {
    expect(() => solve('bfs', grid(5, 5, [], 99, 24))).toThrow(/索引越界/);
  });

  it('T-P14 起点或终点在墙内必须报错', () => {
    expect(() => solve('bfs', grid(5, 5, [0], 0, 24))).toThrow(/起点或终点在墙内/);
  });

  it('T-P15 网格尺寸非法必须报错', () => {
    expect(() => solve('bfs', grid(0, 5))).toThrow(/网格尺寸非法/);
  });

  it('T-P16 所有算法在带墙网格上都能终止', () => {
    const spec = grid(8, 8, [9, 10, 17, 18, 27, 36, 45]);
    for (const kind of KINDS) {
      const r = solve(kind, spec);
      expect(typeof r.found, kind).toBe('boolean');
    }
  });

  it('T-P17 开对角线后 4 步到终点', () => {
    const r = solve('bfs', grid(5, 5), { diagonal: true });
    expect(r.found).toBe(true);
    expect(r.path.length).toBe(5);
  });

  it('T-P18 地形权重计入代价', () => {
    const spec = {
      cols: 5,
      rows: 1,
      walls: new Set<number>(),
      start: 0,
      goal: 4,
      weights: new Map([[1, 10], [2, 10], [3, 10]]),
    };
    const r = solve('dijkstra', spec);
    expect(r.found).toBe(true);
    expect(r.cost).toBeCloseTo(31, 6);
  });

  it('T-P19 贪心最佳优先能找到路', () => {
    const r = solve('greedy', grid(5, 5));
    expect(r.found).toBe(true);
  });

  it('T-P20 对角 + 权重不抛异常', () => {
    const spec = {
      cols: 6,
      rows: 6,
      walls: new Set<number>([8, 15, 22]),
      start: 0,
      goal: 35,
      weights: new Map([[7, 5], [14, 5]]),
    };
    const r = solve('astar', spec, { diagonal: true });
    expect(r.found).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(Number.isFinite(r.cost)).toBe(true);
  });
});

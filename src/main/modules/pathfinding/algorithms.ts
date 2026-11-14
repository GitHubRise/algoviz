/**
 * 网格寻路：BFS / DFS / Dijkstra / A* / 贪心最佳优先。
 *
 * 与排序模块同一套思路：solve() 只负责算出结果与访问顺序，
 * 不碰画布；渲染层拿到 visitedOrder 自己决定怎么画。
 */

export type AlgoKind = 'bfs' | 'dfs' | 'dijkstra' | 'astar' | 'greedy';

export const ALGO_KINDS: readonly AlgoKind[] = ['bfs', 'dfs', 'dijkstra', 'astar', 'greedy'];

export const ALGO_LABELS: Record<AlgoKind, string> = {
  bfs: '广度优先 BFS',
  dfs: '深度优先 DFS',
  dijkstra: 'Dijkstra',
  astar: 'A*',
  greedy: '贪心最佳优先',
};

export const ALGO_NOTES: Record<AlgoKind, string> = {
  bfs: '无权图上的最短路，队列逐层扩展',
  dfs: '一条路走到黑，不保证最短',
  dijkstra: '按累计代价从小到大出队，支持地形权重',
  astar: 'Dijkstra + 距离启发，方向感更强',
  greedy: '只看「离终点还有多远」，快但常绕进死路',
};

export interface GridSpec {
  cols: number;
  rows: number;
  walls: ReadonlySet<number>;
  start: number;
  goal: number;
  /** 进入该格子的额外代价（默认 1） */
  weights?: ReadonlyMap<number, number>;
}

export interface SolveOptions {
  /** 允许走 8 邻域（对角线） */
  diagonal?: boolean;
}

export interface PathSolution {
  found: boolean;
  /** 含起点与终点；不可达时为空数组 */
  path: number[];
  /** 被确定的节点数（含起点终点） */
  visitedCount: number;
  /** 路径代价：4 邻域下等于步数；有权重/对角线时是累计代价 */
  cost: number;
  /** 节点被确定的先后顺序，供渲染层逐帧播放 */
  visitedOrder: number[];
  /** 父节点数组，-1 表示无父 */
  parent: Int32Array;
}

const WALL = 0;

function validate(spec: GridSpec): void {
  const { cols, rows, start, goal } = spec;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
    throw new Error(`网格尺寸非法: ${cols}×${rows}`);
  }
  const total = cols * rows;
  if (!Number.isInteger(start) || !Number.isInteger(goal) || start < 0 || goal < 0 || start >= total || goal >= total) {
    throw new Error(`索引越界: start=${start} goal=${goal} 超出 0..${total - 1}`);
  }
  if (spec.walls.has(start) || spec.walls.has(goal)) {
    throw new Error('起点或终点在墙内');
  }
}

function neighbors(index: number, cols: number, rows: number, diagonal = false): number[] {
  const x = index % cols;
  const y = Math.floor(index / cols);
  const out: number[] = [];
  if (y > 0) out.push(index - cols);
  if (diagonal && y > 0 && x < cols - 1) out.push(index - cols + 1);
  if (x < cols - 1) out.push(index + 1);
  if (diagonal && y < rows - 1 && x < cols - 1) out.push(index + cols + 1);
  if (y < rows - 1) out.push(index + cols);
  if (diagonal && y < rows - 1 && x > 0) out.push(index + cols - 1);
  if (x > 0) out.push(index - 1);
  if (diagonal && y > 0 && x > 0) out.push(index - cols - 1);
  return out;
}

function manhattan(a: number, b: number, cols: number): number {
  return Math.abs((a % cols) - (b % cols)) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
}

/** 八邻域下的 octile 距离：对角线走 √2，直线走 1。 */
function octile(a: number, b: number, cols: number): number {
  const dx = Math.abs((a % cols) - (b % cols));
  const dy = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  const min = Math.min(dx, dy);
  const max = Math.max(dx, dy);
  return (max - min) + min * Math.SQRT2;
}

/** 进入某格的代价：地形权重 × 步长（对角为 √2）。 */
function moveCost(spec: GridSpec, from: number, to: number, diagonal: boolean): number {
  const weight = spec.weights?.get(to) ?? 1;
  const step = diagonal && from % spec.cols !== to % spec.cols && Math.floor(from / spec.cols) !== Math.floor(to / spec.cols)
    ? Math.SQRT2
    : 1;
  return weight * step;
}

/** 沿路径累加代价（起点不计）。 */
function pathCost(spec: GridSpec, path: number[], diagonal: boolean): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += moveCost(spec, path[i - 1]!, path[i]!, diagonal);
  return total;
}

class MinHeap {
  private items: { node: number; priority: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: number, priority: number): void {
    const items = this.items;
    items.push({ node, priority });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]!.priority <= items[i]!.priority) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): { node: number; priority: number } | undefined {
    const items = this.items;
    if (items.length === 0) return undefined;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l]!.priority < items[smallest]!.priority) smallest = l;
        if (r < items.length && items[r]!.priority < items[smallest]!.priority) smallest = r;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i]!, items[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}

function reconstruct(parent: Int32Array, start: number, goal: number): number[] {
  const path: number[] = [];
  let cur = goal;
  let guard = 0;
  while (cur !== -1 && guard++ < parent.length + 1) {
    path.push(cur);
    if (cur === start) break;
    cur = parent[cur]!;
  }
  if (path[path.length - 1] !== start) return [];
  path.reverse();
  return path;
}

function build(
  spec: GridSpec,
  parent: Int32Array,
  visitedOrder: number[],
  goalReached: boolean,
  diagonal: boolean,
): PathSolution {
  const path = goalReached ? reconstruct(parent, spec.start, spec.goal) : [];
  const found = goalReached && path.length > 0;
  return {
    found,
    path,
    visitedCount: visitedOrder.length,
    cost: found ? pathCost(spec, path, diagonal) : 0,
    visitedOrder,
    parent,
  };
}

function bfs(spec: GridSpec, diagonal: boolean): PathSolution {
  const total = spec.cols * spec.rows;
  const parent = new Int32Array(total).fill(-1);
  const seen = new Uint8Array(total);
  const queue = [spec.start];
  seen[spec.start] = 1;
  const order: number[] = [];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    order.push(cur);
    if (cur === spec.goal) return build(spec, parent, order, true, diagonal);
    for (const nb of neighbors(cur, spec.cols, spec.rows, diagonal)) {
      if (seen[nb] || spec.walls.has(nb)) continue;
      seen[nb] = 1;
      parent[nb] = cur;
      queue.push(nb);
    }
  }
  return build(spec, parent, order, false, diagonal);
}

function dfs(spec: GridSpec, diagonal: boolean): PathSolution {
  const total = spec.cols * spec.rows;
  const parent = new Int32Array(total).fill(-1);
  const seen = new Uint8Array(total);
  const stack: number[] = [spec.start];
  const order: number[] = [];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen[cur]) continue;
    seen[cur] = 1;
    order.push(cur);
    if (cur === spec.goal) return build(spec, parent, order, true, diagonal);
    const nbs = neighbors(cur, spec.cols, spec.rows, diagonal);
    // 逆序入栈，使其按 上右下左 的视觉顺序扩展
    for (let i = nbs.length - 1; i >= 0; i--) {
      const nb = nbs[i]!;
      if (seen[nb] || spec.walls.has(nb)) continue;
      if (parent[nb] === -1) parent[nb] = cur;
      stack.push(nb);
    }
  }
  return build(spec, parent, order, false, diagonal);
}

/**
 * Dijkstra / A* / 贪心共用的一套最佳优先搜索。
 * `greedy` 为真时只看启发值（不再松弛 dist），代价在最后按路径累加。
 */
function bestFirst(
  spec: GridSpec,
  heuristic: (a: number) => number,
  diagonal: boolean,
  greedy = false,
): PathSolution {
  const total = spec.cols * spec.rows;
  const parent = new Int32Array(total).fill(-1);
  const dist = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  const settled = new Uint8Array(total);
  const order: number[] = [];
  const heap = new MinHeap();

  dist[spec.start] = 0;
  heap.push(spec.start, 0);

  while (heap.size > 0) {
    const top = heap.pop()!;
    const cur = top.node;
    if (settled[cur]) continue;
    settled[cur] = 1;
    order.push(cur);

    if (cur === spec.goal) return build(spec, parent, order, true, diagonal);

    for (const nb of neighbors(cur, spec.cols, spec.rows, diagonal)) {
      if (settled[nb] || spec.walls.has(nb)) continue;

      if (greedy) {
        if (parent[nb] === -1) {
          parent[nb] = cur;
          heap.push(nb, heuristic(nb));
        }
        continue;
      }

      const next = dist[cur]! + moveCost(spec, cur, nb, diagonal);
      if (next < dist[nb]!) {
        dist[nb] = next;
        parent[nb] = cur;
        heap.push(nb, next + heuristic(nb));
      }
    }
  }
  return build(spec, parent, order, false, diagonal);
}

/**
 * 求一条从 start 到 goal 的路径。
 * @throws 网格尺寸非法 / 索引越界 / 起点或终点在墙内
 */
export function solve(kind: AlgoKind, spec: GridSpec, opts: SolveOptions = {}): PathSolution {
  validate(spec);
  const diagonal = opts.diagonal ?? false;
  const h = (n: number): number => (diagonal
    ? octile(n, spec.goal, spec.cols)
    : manhattan(n, spec.goal, spec.cols));

  switch (kind) {
    case 'bfs':
      return bfs(spec, diagonal);
    case 'dfs':
      return dfs(spec, diagonal);
    case 'dijkstra':
      return bestFirst(spec, () => 0, diagonal);
    case 'astar':
      return bestFirst(spec, h, diagonal);
    case 'greedy':
      return bestFirst(spec, h, diagonal, true);
    default:
      throw new Error(`未知寻路算法: ${String(kind)}`);
  }
}

export { manhattan, neighbors };
export const WALL_CODE = WALL;

export interface PathBenchRow {
  kind: AlgoKind;
  label: string;
  found: boolean;
  cost: number;
  visited: number;
}

/** 同一张图把所有寻路算法跑一遍，返回可直接排成表格的指标。 */
export function benchmarkPathfinding(spec: GridSpec, opts: SolveOptions = {}): PathBenchRow[] {
  return ALGO_KINDS.map((kind) => {
    const solution = solve(kind, spec, opts);
    return {
      kind,
      label: ALGO_LABELS[kind],
      found: solution.found,
      cost: solution.cost,
      visited: solution.visitedCount,
    };
  });
}

/**
 * 网格寻路：BFS / DFS / Dijkstra / A*。
 *
 * 与排序模块同一套思路：solve() 只负责算出结果与访问顺序，
 * 不碰画布；渲染层拿到 visitedOrder 自己决定怎么画。
 */

export type AlgoKind = 'bfs' | 'dfs' | 'dijkstra' | 'astar';

export const ALGO_KINDS: readonly AlgoKind[] = ['bfs', 'dfs', 'dijkstra', 'astar'];

export const ALGO_LABELS: Record<AlgoKind, string> = {
  bfs: '广度优先 BFS',
  dfs: '深度优先 DFS',
  dijkstra: 'Dijkstra',
  astar: 'A*',
};

export const ALGO_NOTES: Record<AlgoKind, string> = {
  bfs: '无权图上的最短路，队列逐层扩展',
  dfs: '一条路走到黑，不保证最短',
  dijkstra: '按累计代价从小到大出队',
  astar: 'Dijkstra + 曼哈顿启发，方向感更强',
};

export interface GridSpec {
  cols: number;
  rows: number;
  walls: ReadonlySet<number>;
  start: number;
  goal: number;
}

export interface PathSolution {
  found: boolean;
  /** 含起点与终点；不可达时为空数组 */
  path: number[];
  /** 被确定的节点数（含起点终点） */
  visitedCount: number;
  /** 路径步数，即 path.length - 1 */
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

function neighbors(index: number, cols: number, rows: number): number[] {
  const x = index % cols;
  const y = Math.floor(index / cols);
  const out: number[] = [];
  if (y > 0) out.push(index - cols);
  if (x < cols - 1) out.push(index + 1);
  if (y < rows - 1) out.push(index + cols);
  if (x > 0) out.push(index - 1);
  return out;
}

function manhattan(a: number, b: number, cols: number): number {
  return Math.abs((a % cols) - (b % cols)) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
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

function build(spec: GridSpec, parent: Int32Array, visitedOrder: number[], goalReached: boolean): PathSolution {
  const path = goalReached ? reconstruct(parent, spec.start, spec.goal) : [];
  const found = goalReached && path.length > 0;
  return {
    found,
    path,
    visitedCount: visitedOrder.length,
    cost: Math.max(0, path.length - 1),
    visitedOrder,
    parent,
  };
}

function bfs(spec: GridSpec): PathSolution {
  const total = spec.cols * spec.rows;
  const parent = new Int32Array(total).fill(-1);
  const seen = new Uint8Array(total);
  const queue = [spec.start];
  seen[spec.start] = 1;
  const order: number[] = [];

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]!;
    order.push(cur);
    if (cur === spec.goal) return build(spec, parent, order, true);
    for (const nb of neighbors(cur, spec.cols, spec.rows)) {
      if (seen[nb] || spec.walls.has(nb)) continue;
      seen[nb] = 1;
      parent[nb] = cur;
      queue.push(nb);
    }
  }
  return build(spec, parent, order, false);
}

function dfs(spec: GridSpec): PathSolution {
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
    if (cur === spec.goal) return build(spec, parent, order, true);
    const nbs = neighbors(cur, spec.cols, spec.rows);
    // 逆序入栈，使其按 上右下左 的视觉顺序扩展
    for (let i = nbs.length - 1; i >= 0; i--) {
      const nb = nbs[i]!;
      if (seen[nb] || spec.walls.has(nb)) continue;
      if (parent[nb] === -1) parent[nb] = cur;
      stack.push(nb);
    }
  }
  return build(spec, parent, order, false);
}

function bestFirst(spec: GridSpec, heuristic: (a: number) => number): PathSolution {
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

    if (cur === spec.goal) return build(spec, parent, order, true);

    for (const nb of neighbors(cur, spec.cols, spec.rows)) {
      if (settled[nb] || spec.walls.has(nb)) continue;
      const next = dist[cur]! + 1;
      if (next < dist[nb]!) {
        dist[nb] = next;
        parent[nb] = cur;
        heap.push(nb, next + heuristic(nb));
      }
    }
  }
  return build(spec, parent, order, false);
}

/**
 * 求一条从 start 到 goal 的路径。
 * @throws 网格尺寸非法 / 索引越界 / 起点或终点在墙内
 */
export function solve(kind: AlgoKind, spec: GridSpec): PathSolution {
  validate(spec);
  switch (kind) {
    case 'bfs':
      return bfs(spec);
    case 'dfs':
      return dfs(spec);
    case 'dijkstra':
      return bestFirst(spec, () => 0);
    case 'astar':
      return bestFirst(spec, (n) => manhattan(n, spec.goal, spec.cols));
    default:
      throw new Error(`未知寻路算法: ${String(kind)}`);
  }
}

export { manhattan, neighbors };
export const WALL_CODE = WALL;

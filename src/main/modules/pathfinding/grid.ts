/** 网格的纯数据操作：建空网格、生成迷宫。不涉及渲染。 */

export interface GridState {
  cols: number;
  rows: number;
  walls: Set<number>;
  start: number;
  goal: number;
}

export function createGrid(cols: number, rows: number): GridState {
  return {
    cols,
    rows,
    walls: new Set<number>(),
    start: index(1, 1, cols),
    goal: index(cols - 2, rows - 2, cols),
  };
}

export function index(x: number, y: number, cols: number): number {
  return y * cols + x;
}

export function cellOf(i: number, cols: number): { x: number; y: number } {
  return { x: i % cols, y: Math.floor(i / cols) };
}

/**
 * 递归回溯法生成迷宫：所有格子先当墙，再从 (1,1) 开始按 2 格步长打通。
 * 要求 cols / rows 为奇数。
 */
export function generateMaze(cols: number, rows: number): GridState {
  const walls = new Set<number>();
  for (let i = 0; i < cols * rows; i++) walls.add(i);

  const startX = 1;
  const startY = 1;
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  walls.delete(index(startX, startY, cols));

  const visited = new Set<number>([index(startX, startY, cols)]);
  const dirs: Array<[number, number]> = [
    [0, -2],
    [2, 0],
    [0, 2],
    [-2, 0],
  ];

  while (stack.length > 0) {
    const cur = stack[stack.length - 1]!;
    const options: Array<{ x: number; y: number; wx: number; wy: number }> = [];

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx <= 0 || ny <= 0 || nx >= cols - 1 || ny >= rows - 1) continue;
      if (visited.has(index(nx, ny, cols))) continue;
      options.push({ x: nx, y: ny, wx: cur.x + dx / 2, wy: cur.y + dy / 2 });
    }

    if (options.length === 0) {
      stack.pop();
      continue;
    }

    const pick = options[Math.floor(Math.random() * options.length)]!;
    const wallIdx = index(pick.wx, pick.wy, cols);
    walls.delete(wallIdx);
    walls.delete(index(pick.x, pick.y, cols));
    visited.add(index(pick.x, pick.y, cols));
    stack.push({ x: pick.x, y: pick.y });
  }

  return {
    cols,
    rows,
    walls,
    start: index(1, 1, cols),
    goal: index(cols - 2, rows - 2, cols),
  };
}

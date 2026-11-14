import { el } from '../../core/dom';
import { Surface } from '../../core/surface';
import { theme, font } from '../../core/theme';
import type { ModuleContext, VizModule } from '../../ui/module';
import { button, createStats, createTable, field, section, toggle, type TableHandle } from '../../ui/controls';
import {
  ALGO_KINDS,
  ALGO_LABELS,
  ALGO_NOTES,
  benchmarkPathfinding,
  solve,
  type AlgoKind,
  type PathSolution,
} from './algorithms';
import { cellOf, createGrid, generateMaze, type GridState } from './grid';

const COLS = 39;
const ROWS = 23;

type Brush = 'wall' | 'erase' | 'weight';

export class PathfindingModule implements VizModule {
  readonly id = 'pathfinding';
  readonly label = '寻路';

  readonly panel: HTMLElement;
  readonly stage: HTMLElement;

  private readonly ctx: ModuleContext;
  private readonly surface: Surface;

  private grid: GridState = createGrid(COLS, ROWS);
  private algo: AlgoKind = 'astar';
  private brush: Brush = 'wall';
  /** 高代价地形：格子索引 → 进入该格的代价（默认 1） */
  private weights = new Map<number, number>();
  private diagonal = false;
  private solution!: PathSolution;
  private stats!: ReturnType<typeof createStats>;
  private cmpTable!: TableHandle;
  private statusEl!: HTMLElement;
  private algoNote!: HTMLElement;

  private dragging: 'start' | 'goal' | 'paint' | 'erase' | 'weight' | null = null;
  private cellSize = 20;
  private offsetX = 0;
  private offsetY = 0;

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    const canvas = el('canvas');
    this.stage = el('div', {}, canvas);
    this.surface = new Surface(canvas);

    this.panel = this.buildPanel();
    this.bindCanvas(canvas);
  }

  activate(): void {
    this.surface.resize();
    this.rebuild();
  }

  deactivate(): void {
    this.dragging = null;
  }

  resize(): void {
    this.surface.resize();
    this.render(this.ctx.transport.progress);
  }

  render(progress: number): void {
    const { surface } = this;
    const { width: W, height: H } = surface;
    surface.clear(theme.bg);

    const pad = 18;
    this.cellSize = Math.max(6, Math.floor(Math.min((W - pad * 2) / COLS, (H - pad * 2) / ROWS)));
    const gridW = this.cellSize * COLS;
    const gridH = this.cellSize * ROWS;
    this.offsetX = Math.round((W - gridW) / 2);
    this.offsetY = Math.round((H - gridH) / 2);

    this.drawCells();
    this.drawSearch(progress);
    this.drawMarkers();
    this.drawLegend();

    const total = this.stepsTotal();
    const cursor = Math.round(progress * total);
    const visited = Math.min(this.solution.visitedOrder.length, cursor);
    this.stats.set([
      String(visited),
      this.solution.found ? formatCost(this.solution.cost) : '—',
      this.solution.found ? (cursor >= total ? '已到达' : '搜索中') : '不可达',
      ALGO_LABELS[this.algo],
    ]);
    this.statusEl.textContent = this.solution.found
      ? `路径代价 ${formatCost(this.solution.cost)} · 访问 ${this.solution.visitedOrder.length} 个节点`
      : '终点不可达：先清掉一部分墙再试';
  }

  private stepsTotal(): number {
    return this.solution.visitedOrder.length + (this.solution.found ? this.solution.path.length : 0);
  }

  private drawCells(): void {
    const { ctx } = this.surface;
    const cs = this.cellSize;

    for (let i = 0; i < COLS * ROWS; i++) {
      const { x, y } = cellOf(i, COLS);
      const px = this.offsetX + x * cs;
      const py = this.offsetY + y * cs;
      if (this.grid.walls.has(i)) {
        ctx.fillStyle = theme.wall;
        ctx.fillRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
      } else {
        const weight = this.weights.get(i);
        ctx.fillStyle = weight ? 'rgba(255, 209, 102, 0.22)' : theme.panelAlt;
        ctx.fillRect(px, py, cs, cs);
        if (weight && cs >= 10) {
          // 高代价地形：画一道斜纹提示
          ctx.strokeStyle = 'rgba(255, 209, 102, 0.45)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 2, py + cs - 2);
          ctx.lineTo(px + cs - 2, py + 2);
          ctx.stroke();
        }
      }
    }

    // 网格线只画一次，淡到可忽略
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= COLS; x++) {
      const px = this.offsetX + x * cs + 0.5;
      ctx.moveTo(px, this.offsetY);
      ctx.lineTo(px, this.offsetY + ROWS * cs);
    }
    for (let y = 0; y <= ROWS; y++) {
      const py = this.offsetY + y * cs + 0.5;
      ctx.moveTo(this.offsetX, py);
      ctx.lineTo(this.offsetX + COLS * cs, py);
    }
    ctx.stroke();
  }

  private drawSearch(progress: number): void {
    const { ctx } = this.surface;
    const cs = this.cellSize;
    const order = this.solution.visitedOrder;
    const total = this.stepsTotal();
    const cursor = Math.round(progress * total);
    const visitedCount = Math.min(order.length, cursor);
    const pathCount = Math.max(0, cursor - order.length);

    // 已访问
    ctx.fillStyle = theme.visited;
    for (let k = 0; k < visitedCount; k++) {
      const i = order[k]!;
      const { x, y } = cellOf(i, COLS);
      ctx.fillRect(this.offsetX + x * cs + 1, this.offsetY + y * cs + 1, cs - 2, cs - 2);
    }

    // 前沿（最近一批）与当前节点
    const frontierFrom = Math.max(0, visitedCount - 6);
    ctx.fillStyle = theme.frontier;
    for (let k = frontierFrom; k < visitedCount; k++) {
      const i = order[k]!;
      const { x, y } = cellOf(i, COLS);
      ctx.fillRect(this.offsetX + x * cs + 1, this.offsetY + y * cs + 1, cs - 2, cs - 2);
    }
    if (visitedCount > 0) {
      const cur = order[visitedCount - 1]!;
      const { x, y } = cellOf(cur, COLS);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        this.offsetX + x * cs + 1.5,
        this.offsetY + y * cs + 1.5,
        cs - 3,
        cs - 3,
      );
    }

    // 路径
    if (this.solution.found && pathCount > 0) {
      ctx.save();
      ctx.fillStyle = theme.path;
      ctx.shadowColor = 'rgba(255, 209, 102, 0.55)';
      ctx.shadowBlur = 12;
      for (let k = 0; k < pathCount; k++) {
        const i = this.solution.path[k]!;
        const { x, y } = cellOf(i, COLS);
        const inset = cs > 14 ? 3 : 2;
        ctx.fillRect(
          this.offsetX + x * cs + inset,
          this.offsetY + y * cs + inset,
          cs - inset * 2,
          cs - inset * 2,
        );
      }
      ctx.restore();
    }
  }

  private drawMarkers(): void {
    const { ctx } = this.surface;
    const cs = this.cellSize;
    const markers: Array<{ i: number; color: string; label: string }> = [
      { i: this.grid.start, color: theme.start, label: 'S' },
      { i: this.grid.goal, color: theme.goal, label: 'G' },
    ];

    for (const marker of markers) {
      const { x, y } = cellOf(marker.i, COLS);
      const px = this.offsetX + x * cs + cs / 2;
      const py = this.offsetY + y * cs + cs / 2;
      ctx.fillStyle = marker.color;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(4, cs * 0.34), 0, Math.PI * 2);
      ctx.fill();
      if (cs >= 14) {
        ctx.fillStyle = '#0b0e14';
        ctx.font = `600 ${Math.max(9, cs * 0.5)}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(marker.label, px, py + 0.5);
      }
    }
  }

  private drawLegend(): void {
    const { ctx } = this.surface;
    ctx.font = font.monoSmall;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const items: Array<[string, string]> = [
      [theme.wall, '墙'],
      ['rgba(255, 209, 102, 0.45)', '高代价'],
      [theme.frontier, '正在搜索'],
      [theme.path, '路径'],
    ];
    let x = 14;
    const y = 18;
    for (const [color, label] of items) {
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 8, 9, 9);
      ctx.fillStyle = theme.textFaint;
      ctx.fillText(label, x + 13, y);
      x += 13 + ctx.measureText(label).width + 16;
    }
  }

  private buildPanel(): HTMLElement {
    const panel = el('div', {});
    panel.append(
      el('h2', { class: 'panel-title', text: '网格寻路' }),
      el('p', {
        class: 'panel-sub',
        text: '画墙、涂高代价地形、开关对角线，比较五种搜索策略的扩展方式与最终路径。',
      }),
    );

    const algoSelect = el('select');
    for (const kind of ALGO_KINDS) {
      algoSelect.append(el('option', { value: kind, text: ALGO_LABELS[kind] }));
    }
    algoSelect.value = this.algo;
    algoSelect.addEventListener('change', () => {
      this.algo = algoSelect.value as AlgoKind;
      this.algoNote.textContent = ALGO_NOTES[this.algo];
      this.rebuild();
    });

    const algoNote = el('p', { class: 'note-text', text: ALGO_NOTES[this.algo] });
    this.algoNote = algoNote;

    const brushSelect = el('select');
    brushSelect.append(
      el('option', { value: 'wall', text: '画墙' }),
      el('option', { value: 'weight', text: '高代价（5）' }),
      el('option', { value: 'erase', text: '擦除' }),
    );
    brushSelect.value = this.brush;
    brushSelect.addEventListener('change', () => {
      this.brush = brushSelect.value as Brush;
    });

    const diagonalToggle = toggle('允许对角线（8 邻域）', this.diagonal, (v) => {
      this.diagonal = v;
      this.rebuild();
    });

    panel.append(
      section(
        '搜索',
        field('算法', algoSelect, ALGO_NOTES[this.algo]),
        field('画笔', brushSelect, '拖动 S / G 可以移动起终点；擦除同时清掉地形'),
        diagonalToggle,
      ),
      section(
        '地图',
        el(
          'div',
          { class: 'btn-row' },
          button('随机迷宫', () => {
            this.grid = generateMaze(COLS, ROWS);
            this.weights.clear();
            this.rebuild();
          }, { primary: true }),
          button('清空墙', () => {
            this.grid.walls.clear();
            this.weights.clear();
            this.rebuild();
          }),
          button('重置', () => {
            this.grid = createGrid(COLS, ROWS);
            this.weights.clear();
            this.rebuild();
          }),
        ),
      ),
    );

    const stats = createStats(['已访问', '路径代价', '状态', '算法']);
    this.stats = stats;
    const status = el('p', { class: 'note-text', text: '—' });
    this.statusEl = status;

    const cmp = createTable(['算法', '状态', '代价', '访问']);
    this.cmpTable = cmp;

    panel.append(
      section('结果', stats.el, el('div', { class: 'field' }, el('label', { text: '说明' }), status)),
      section(
        '算法对比',
        cmp.el,
        el('p', { class: 'note-text', text: '同一张图上 5 种算法的实测结果，当前算法高亮。' }),
      ),
      section(
        '快捷键',
        el('p', { class: 'note-text', text: '空格 播放/暂停 · ← → 单步 · 进度条可拖拽' }),
      ),
    );

    return panel;
  }

  private rebuild(): void {
    try {
      this.solution = solve(
        this.algo,
        {
          cols: this.grid.cols,
          rows: this.grid.rows,
          walls: this.grid.walls,
          start: this.grid.start,
          goal: this.grid.goal,
          weights: this.weights,
        },
        { diagonal: this.diagonal },
      );
    } catch {
      this.solution = {
        found: false,
        path: [],
        visitedCount: 0,
        cost: 0,
        visitedOrder: [],
        parent: new Int32Array(this.grid.cols * this.grid.rows).fill(-1),
      };
    }

    const total = Math.max(1, this.stepsTotal());
    this.ctx.transport.configure({
      durationMs: clamp(total * 26, 900, 14000),
      loop: false,
      stepSize: 1 / total,
    });
    this.ctx.transport.pause();
    this.ctx.transport.seek(0);
    this.refreshComparison();
    this.render(0);
    this.ctx.invalidate();
  }

  /** 同一张图跑一遍五种算法，刷新对比表（当前算法高亮） */
  private refreshComparison(): void {
    const spec = {
      cols: this.grid.cols,
      rows: this.grid.rows,
      walls: this.grid.walls,
      start: this.grid.start,
      goal: this.grid.goal,
      weights: this.weights,
    };
    const rows = benchmarkPathfinding(spec, { diagonal: this.diagonal }).map((row) => [
      row.label,
      row.found ? '可达' : '不可达',
      row.found ? formatCost(row.cost) : '—',
      String(row.visited),
    ]);
    this.cmpTable.setRows(rows, ALGO_KINDS.indexOf(this.algo));
  }

  private pickCell(ev: PointerEvent, canvas: HTMLCanvasElement): number | null {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left - this.offsetX) / this.cellSize);
    const y = Math.floor((ev.clientY - rect.top - this.offsetY) / this.cellSize);
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return null;
    return y * COLS + x;
  }

  private applyBrush(cell: number): boolean {
    if (cell === this.grid.start || cell === this.grid.goal) return false;

    if (this.dragging === 'paint') {
      if (this.grid.walls.has(cell)) return false;
      this.grid.walls.add(cell);
      this.weights.delete(cell);
      return true;
    }
    if (this.dragging === 'erase') {
      const removedWall = this.grid.walls.delete(cell);
      const removedWeight = this.weights.delete(cell);
      return removedWall || removedWeight;
    }
    if (this.dragging === 'weight') {
      if (this.grid.walls.has(cell)) return false;
      if (this.weights.get(cell) === 5) return false;
      this.weights.set(cell, 5);
      return true;
    }
    return false;
  }

  private bindCanvas(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (ev) => {
      const cell = this.pickCell(ev, canvas);
      if (cell === null) return;
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        // 合成事件没有真实 pointerId，捕获失败不影响后续逻辑
      }

      if (cell === this.grid.start) {
        this.dragging = 'start';
      } else if (cell === this.grid.goal) {
        this.dragging = 'goal';
      } else if (this.brush === 'weight') {
        this.dragging = 'weight';
      } else if (this.brush === 'erase' ? this.grid.walls.has(cell) : !this.grid.walls.has(cell)) {
        this.dragging = this.brush === 'erase' ? 'erase' : 'paint';
      } else {
        this.dragging = this.brush === 'erase' ? 'paint' : 'erase';
      }
      this.applyBrush(cell);
      this.rebuild();
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (!this.dragging) return;
      const cell = this.pickCell(ev, canvas);
      if (cell === null) return;

      if (this.dragging === 'start' || this.dragging === 'goal') {
        if (this.grid.walls.has(cell)) return;
        if (cell === this.grid.start || cell === this.grid.goal) return;
        if (this.dragging === 'start') this.grid.start = cell;
        else this.grid.goal = cell;
        this.rebuild();
        return;
      }
      if (this.applyBrush(cell)) this.rebuild();
    });

    const end = (): void => {
      this.dragging = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => {
      this.dragging = null;
    });

    canvas.style.cursor = 'crosshair';
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 代价保留一位小数：整数步数不显示小数点，有 √2/权重时才显示 */
function formatCost(cost: number): string {
  return Number.isInteger(cost) ? String(cost) : cost.toFixed(1);
}

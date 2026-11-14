import { el } from '../../core/dom';
import { Surface } from '../../core/surface';
import { theme, font } from '../../core/theme';
import type { ModuleContext, VizModule } from '../../ui/module';
import { button, createStats, createTable, field, section, slider, type TableHandle } from '../../ui/controls';
import {
  benchmarkSorts,
  ROLE,
  runSort,
  SORT_KINDS,
  SORT_LABELS,
  type SortFrame,
  type SortKind,
  type SortTrace,
} from './algorithms';

const ROLE_COLORS: Record<number, string> = {
  [ROLE.idle]: '#2f3d55',
  [ROLE.compare]: theme.compare,
  [ROLE.swap]: theme.swap,
  [ROLE.pivot]: theme.pivot,
  [ROLE.sorted]: theme.sorted,
  [ROLE.cursor]: theme.cursor,
};

type Pattern = 'random' | 'nearly' | 'reverse' | 'fewUnique';

export class SortingModule implements VizModule {
  readonly id = 'sorting';
  readonly label = '排序';

  readonly panel: HTMLElement;
  readonly stage: HTMLElement;

  private readonly ctx: ModuleContext;
  private readonly surface: Surface;

  private kind: SortKind = 'quick';
  private size = 34;
  private pattern: Pattern = 'random';
  private values: number[] = [];
  private trace!: SortTrace;
  private stats!: ReturnType<typeof createStats>;
  private cmpTable!: TableHandle;
  private noteEl!: HTMLElement;
  private sizeSlider!: ReturnType<typeof slider>;

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    const canvas = el('canvas');
    this.stage = el('div', {}, canvas);
    this.surface = new Surface(canvas);

    this.values = generate(this.size, this.pattern);
    this.trace = runSort(this.kind, this.values);

    this.panel = this.buildPanel();

    canvas.addEventListener('pointerdown', () => {
      if (!this.ctx.transport.playing) this.ctx.transport.play();
      else this.ctx.transport.pause();
    });
    canvas.style.cursor = 'pointer';
  }

  activate(): void {
    this.surface.resize();
    this.rebuild();
  }

  deactivate(): void {
    /* 无外部状态 */
  }

  resize(): void {
    this.surface.resize();
    this.render(this.ctx.transport.progress);
  }

  render(progress: number): void {
    const frames = this.trace.frames;
    const index = Math.min(frames.length - 1, Math.max(0, Math.round(progress * (frames.length - 1))));
    const frame = frames[index]!;
    this.drawFrame(frame, index, frames.length);
    this.stats.set([
      String(frame.comparisons),
      String(frame.writes),
      `${index + 1}/${frames.length}`,
      this.trace.label,
    ]);
    this.noteEl.textContent = frame.note;
  }

  private drawFrame(frame: SortFrame, index: number, total: number): void {
    const { surface } = this;
    const { ctx, width: W, height: H } = surface;
    surface.clear(theme.bg);

    const top = 56;
    const bottom = 36;
    const left = 24;
    const right = 24;
    const usableW = W - left - right;
    const usableH = H - top - bottom;
    const n = frame.values.length;

    if (n === 0) {
      surface.hint('没有数据');
      return;
    }

    const maxValue = Math.max(...this.values, 1);
    const slot = usableW / n;
    const gap = slot > 10 ? 3 : slot > 5 ? 1.5 : 0.6;
    const barW = Math.max(1, slot - gap);

    for (let i = 0; i < n; i++) {
      const value = frame.values[i]!;
      const role = frame.roles[i] ?? ROLE.idle;
      const h = Math.max(2, (value / maxValue) * usableH);
      const x = left + i * slot + gap / 2;
      const y = top + usableH - h;
      ctx.fillStyle = ROLE_COLORS[role] ?? ROLE_COLORS[ROLE.idle]!;
      ctx.fillRect(x, y, barW, h);

      if (role === ROLE.compare || role === ROLE.swap || role === ROLE.pivot) {
        ctx.save();
        ctx.shadowColor = ctx.fillStyle as string;
        ctx.shadowBlur = 10;
        ctx.fillRect(x, y, barW, h);
        ctx.restore();
      }
    }

    // 基线
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, top + usableH + 0.5);
    ctx.lineTo(W - right, top + usableH + 0.5);
    ctx.stroke();

    // 索引
    if (n <= 34) {
      ctx.font = '9px "Cascadia Code", Consolas, monospace';
      ctx.fillStyle = theme.textFaint;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i < n; i++) {
        ctx.fillText(String(i), left + i * slot + slot / 2, top + usableH + 6);
      }
    }

    // 标题与进度
    ctx.font = font.sans;
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(this.trace.label, left, 16);

    ctx.font = font.monoSmall;
    ctx.fillStyle = theme.textFaint;
    ctx.fillText(`n=${n} · ${this.trace.input.length} 个元素`, left, 36);

    ctx.textAlign = 'right';
    ctx.fillStyle = theme.textDim;
    const done = index === total - 1;
    const badge = done ? '已完成' : '进行中';
    ctx.fillText(`${badge}  ${index + 1}/${total}`, W - right, 16);
    ctx.fillStyle = theme.textFaint;
    ctx.fillText('比较 / 交换（写入）见左侧面板', W - right, 36);

    if (done) {
      ctx.fillStyle = theme.sorted;
      ctx.fillRect(left, H - 6, W - left - right, 3);
    }
  }

  private buildPanel(): HTMLElement {
    const panel = el('div', {});
    panel.append(
      el('h2', { class: 'panel-title', text: '排序可视化' }),
      el('p', {
        class: 'panel-sub',
        text: '每一步比较与交换都被录成一帧，可单步回退。点击画布也能播放/暂停。',
      }),
    );

    const kindSelect = el('select');
    for (const kind of SORT_KINDS) {
      kindSelect.append(el('option', { value: kind, text: SORT_LABELS[kind] }));
    }
    kindSelect.value = this.kind;
    kindSelect.addEventListener('change', () => {
      this.kind = kindSelect.value as SortKind;
      this.rebuild();
    });

    const sizeSlider = slider('数据规模 n', {
      min: 8,
      max: 72,
      step: 1,
      value: this.size,
      onInput: (v) => {
        this.size = Math.round(v);
        this.values = generate(this.size, this.pattern);
        this.rebuild();
      },
    });
    this.sizeSlider = sizeSlider;

    panel.append(
      section(
        '参数',
        field('算法', kindSelect),
        sizeSlider.el,
        el(
          'div',
          { class: 'btn-row' },
          button('随机', () => this.setPattern('random'), { primary: true }),
          button('近有序', () => this.setPattern('nearly')),
          button('逆序', () => this.setPattern('reverse')),
          button('少量重复', () => this.setPattern('fewUnique')),
        ),
      ),
    );

    const stats = createStats(['比较次数', '写入次数', '当前帧', '算法']);
    this.stats = stats;
    const note = el('p', { class: 'note-text', text: '—' });
    this.noteEl = note;

    panel.append(
      section('统计', stats.el, el('div', { class: 'field' }, el('label', { text: '当前步骤' }), note)),
    );

    const cmp = createTable(['算法', '比较', '写入', '帧数']);
    this.cmpTable = cmp;
    panel.append(
      section(
        '算法对比',
        cmp.el,
        el('p', { class: 'note-text', text: '同一组数据下 8 种算法的实测指标，当前算法高亮。' }),
      ),
    );

    panel.append(
      section(
        '快捷键',
        el('p', { class: 'note-text', text: '空格 播放/暂停 · ← → 单步 · 进度条可拖拽任意位置' }),
      ),
    );

    return panel;
  }

  private setPattern(pattern: Pattern): void {
    this.pattern = pattern;
    this.values = generate(this.size, pattern);
    this.sizeSlider.set(this.size);
    this.rebuild();
  }

  private rebuild(): void {
    this.trace = runSort(this.kind, this.values);
    const frames = this.trace.frames.length;
    this.ctx.transport.configure({
      durationMs: clamp(frames * 42, 900, 14000),
      loop: false,
      stepSize: 1 / Math.max(1, frames - 1),
    });
    this.ctx.transport.pause();
    this.ctx.transport.seek(0);
    this.refreshComparison();
    this.render(0);
    this.ctx.invalidate();
  }

  /** 跑一遍全部算法，刷新对比表（当前算法高亮） */
  private refreshComparison(): void {
    const rows = benchmarkSorts(this.values).map((row) => [
      row.ok ? row.label : `${row.label} ⚠`,
      String(row.comparisons),
      String(row.writes),
      String(row.frames),
    ]);
    this.cmpTable.setRows(rows, SORT_KINDS.indexOf(this.kind));
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function generate(size: number, pattern: Pattern): number[] {
  const base = Array.from({ length: size }, (_, i) => i + 1);

  switch (pattern) {
    case 'random': {
      for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [base[i], base[j]] = [base[j]!, base[i]!];
      }
      return base;
    }
    case 'nearly': {
      for (let i = 0; i < Math.max(1, Math.round(size * 0.08)); i++) {
        const a = Math.floor(Math.random() * size);
        const b = Math.floor(Math.random() * size);
        [base[a], base[b]] = [base[b]!, base[a]!];
      }
      return base;
    }
    case 'reverse':
      return base.reverse();
    case 'fewUnique': {
      const buckets = Math.max(2, Math.round(size / 8));
      return base.map(() => 1 + Math.floor(Math.random() * buckets) * 3);
    }
  }
}

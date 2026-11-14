import { el } from '../../core/dom';
import { Surface } from '../../core/surface';
import { theme } from '../../core/theme';
import { decodeShare, encodeShare } from '../../core/share';
import { compileSource, validate } from '../../math/evaluate';
import { FUNCTION_HINT } from '../../math/functions';
import { normalizeFormulaBlock, type CurveMode } from '../../math/normalize';
import type { Compiled } from '../../math/evaluate';
import type { ModuleContext, VizModule } from '../../ui/module';
import { button, createStats, field, section, slider, toggle } from '../../ui/controls';
import { PlotView, type CurveSpec, type PlotOptions } from './plot';

interface CurveEntry {
  source: string;
  /** 参数方程的 y 分量 */
  sourceY: string;
  mode: CurveMode;
  color: string;
  visible: boolean;
  compiled: Compiled | null;
  compiledY: Compiled | null;
  /** 拖动产生的水平/垂直偏移；表达式里没用到时由渲染层施加 */
  a: number;
  b: number;
  usesA: boolean;
  usesB: boolean;
}

interface Preset {
  label: string;
  source: string;
  sourceY?: string;
  mode: CurveMode;
}

const PRESETS: Preset[] = [
  { label: '正弦', source: 'sin(x)', mode: 'explicit' },
  { label: '高斯', source: 'gauss(x)', mode: 'explicit' },
  { label: '双曲', source: '1/x', mode: 'explicit' },
  { label: '衰减波', source: 'exp(-0.15x)sin(3x)', mode: 'explicit' },
  { label: '分段', source: 'if(x < 0, x^2, sqrt(x))', mode: 'explicit' },
  { label: '圆（隐）', source: 'x^2 + y^2 - 9', mode: 'implicit' },
  { label: '玫瑰线（极）', source: '3cos(5th)', mode: 'polar' },
  { label: '李萨如（参）', source: '3cos(2u)', sourceY: '3sin(3u)', mode: 'parametric' },
];

const MODE_LABELS: Record<CurveMode, string> = {
  explicit: 'y = f(x)',
  implicit: 'F(x,y) = 0',
  polar: 'r(θ)',
  parametric: 'x(u), y(u)',
};

/** 各模式下允许出现的变量（其余标黄提示「按变量处理」） */
const MODE_VARS: Record<CurveMode, string[]> = {
  explicit: ['x', 't', 'a', 'b'],
  implicit: ['x', 'y', 't', 'a', 'b'],
  polar: ['th', 't', 'a', 'b'],
  parametric: ['u', 't', 'a', 'b'],
};

const MAX_CURVES = 5;

export class FunctionsModule implements VizModule {
  readonly id = 'functions';
  readonly label = '函数';

  readonly panel: HTMLElement;
  readonly stage: HTMLElement;

  private readonly ctx: ModuleContext;
  private readonly surface: Surface;
  private readonly plot: PlotView;

  private curves: CurveEntry[] = [];
  private inputs: HTMLInputElement[] = [];
  private yInputs: HTMLInputElement[] = [];
  private selects: HTMLSelectElement[] = [];
  private curveList!: HTMLElement;
  private errorEl: HTMLElement;

  private showGrid = true;
  private showTangent = false;
  private showIntegral = true;
  private showDerivative = false;
  private showAnalysis = false;
  private tangentX = 1;
  private integralA = -1;
  private integralB = 1;
  private hover: { x: number; y: number } | null = null;
  private active: { index: number; a: number; b: number } | null = null;

  private drag: { index: number; a0: number; b0: number; sx: number; sy: number } | null = null;
  private panning: { sx: number; sy: number } | null = null;
  private isActive = false;
  private stats!: ReturnType<typeof createStats>;
  private tangentSlider!: ReturnType<typeof slider>;
  private fittedScale = false;
  private restoredFromHash = false;

  constructor(ctx: ModuleContext, initial: Array<{
    source: string;
    sourceY?: string;
    mode?: CurveMode;
    a?: number;
    b?: number;
  }> = [
    { source: 'sin(x)' },
    { source: '0.15x^2 - 2' },
  ]) {
    this.ctx = ctx;
    const canvas = el('canvas');
    this.stage = el('div', {}, canvas);
    this.surface = new Surface(canvas);
    this.plot = new PlotView(this.surface);
    this.errorEl = el('p', { class: 'error-text' });

    const seed = this.readHash() ?? initial;
    this.curves = seed.map((entry, i) => this.makeEntry(
      entry.source,
      entry.mode ?? 'explicit',
      i,
      entry.sourceY ?? '',
      entry.a ?? 0,
      entry.b ?? 0,
    ));

    this.panel = this.buildPanel();
    this.bindCanvas(canvas);
    this.bindPaste();
  }

  activate(): void {
    this.isActive = true;
    this.ctx.transport.configure({ durationMs: 10000, loop: true, stepSize: 0.01 });
    this.surface.resize();
    if (!this.fittedScale) {
      this.plot.reset();
      this.fittedScale = true;
      if (this.restoredFromHash) this.fitY();
    }
    this.render(this.ctx.transport.progress);
  }

  deactivate(): void {
    this.isActive = false;
    this.hover = null;
    this.drag = null;
    this.panning = null;
  }

  resize(): void {
    this.plot.resize();
  }

  render(progress: number): void {
    const opts: PlotOptions = {
      showGrid: this.showGrid,
      showTangent: this.showTangent,
      tangentX: this.tangentX,
      showIntegral: this.showIntegral,
      integralA: this.integralA,
      integralB: this.integralB,
      hover: this.hover,
      t: progress,
      active: this.active,
      showDerivative: this.showDerivative,
      showAnalysis: this.showAnalysis,
    };
    this.plot.draw(this.specs(), opts);
    const visible = this.curves.filter((c) => c.visible && c.compiled).length;
    this.stats.set([String(visible), `${Math.round(this.plot.scale)} px/单位`]);
  }

  // ---------- 数据 ----------

  private makeEntry(source: string, mode: CurveMode, index: number, sourceY = '', a = 0, b = 0): CurveEntry {
    const entry: CurveEntry = {
      source,
      sourceY,
      mode,
      color: theme.curve[index % theme.curve.length]!,
      visible: true,
      compiled: null,
      compiledY: null,
      a,
      b,
      usesA: false,
      usesB: false,
    };
    this.refresh(entry);
    return entry;
  }

  /** 重新编译并把「是否用了 a/b」同步给渲染层 */
  private refresh(entry: CurveEntry): { ok: boolean; message: string } {
    const result = validate(entry.source);
    if (!result.ok || entry.source.trim() === '') {
      entry.compiled = null;
      return { ok: false, message: result.ok ? '表达式为空' : result.message };
    }
    entry.compiled = compileSource(entry.source);

    if (entry.mode === 'parametric') {
      const yResult = validate(entry.sourceY);
      if (!yResult.ok || entry.sourceY.trim() === '') {
        entry.compiledY = null;
        return { ok: false, message: yResult.ok ? 'y(u) 表达式为空' : yResult.message };
      }
      entry.compiledY = compileSource(entry.sourceY);
    } else {
      entry.compiledY = null;
    }

    const variables = [...result.variables];
    const yCompiled = entry.compiledY;
    if (yCompiled) {
      for (const name of yCompiled.variables) {
        if (!variables.includes(name)) variables.push(name);
      }
    }

    entry.usesA = variables.includes('a');
    entry.usesB = variables.includes('b');
    const allowed = MODE_VARS[entry.mode];
    const unknown = variables.filter((name) => !allowed.includes(name));
    if (unknown.length > 0) {
      return { ok: true, message: `按变量处理：${unknown.join(', ')}（当前取值为 0）` };
    }
    return { ok: true, message: '' };
  }

  private specs(): CurveSpec[] {
    return this.curves.map((c) => ({
      color: c.color,
      compiled: c.visible ? c.compiled : null,
      compiledY: c.visible ? c.compiledY : null,
      source: c.source,
      visible: c.visible,
      mode: c.mode,
      a: c.a,
      b: c.b,
      usesA: c.usesA,
      usesB: c.usesB,
    }));
  }

  // ---------- 面板 ----------

  private buildPanel(): HTMLElement {
    const panel = el('div', {});

    panel.append(
      el('h2', { class: 'panel-title', text: '函数绘图' }),
      el('p', {
        class: 'panel-sub',
        text:
          '四种曲线：y=f(x)、隐函数 F(x,y)=0、极坐标 r(θ)、参数方程 x(u),y(u)。' +
          '拖动曲线会改写 a、b；可以直接粘贴公式；也能把当前图形生成分享链接。',
      }),
    );

    const curveSection = section('曲线');
    this.curveList = el('div', {});
    curveSection.append(this.curveList, this.errorEl);
    this.curves.forEach((curve, index) => this.appendRow(curve, index));

    curveSection.append(
      el(
        'div',
        { class: 'btn-row', style: { 'margin-top': '6px' } },
        button('添加曲线', () => this.addCurve(), { title: `最多 ${MAX_CURVES} 条` }),
        button('粘贴公式', () => this.pasteFromClipboard(), { primary: true, title: '从剪贴板读取并规范化' }),
      ),
      el('p', { class: 'note-text', text: '也可以直接 Ctrl+V：支持 LaTeX、x²、√x、全角括号，多行会填充多条曲线。' }),
    );
    panel.append(curveSection);

    panel.append(
      section(
        '示例',
        el(
          'div',
          { class: 'btn-row' },
          ...PRESETS.map((preset) =>
            button(preset.label, () => {
              const target = this.curves.length > 1 ? 1 : 0;
              this.applyFormula(target, preset.source, preset.mode, preset.sourceY ?? '');
            }),
          ),
        ),
      ),
    );

    const options = section(
      '显示',
      toggle('网格与坐标轴', this.showGrid, (v) => {
        this.showGrid = v;
        this.ctx.invalidate();
      }),
      toggle('切线（在 x₀ 处）', this.showTangent, (v) => {
        this.showTangent = v;
        this.tangentSlider.input.disabled = !v;
        this.ctx.invalidate();
      }),
      toggle('定积分填充', this.showIntegral, (v) => {
        this.showIntegral = v;
        this.ctx.invalidate();
      }),
      toggle('导数曲线 f′', this.showDerivative, (v) => {
        this.showDerivative = v;
        this.ctx.invalidate();
      }),
      toggle('标注零点与极值', this.showAnalysis, (v) => {
        this.showAnalysis = v;
        this.ctx.invalidate();
      }),
    );

    const tangentSlider = slider('切线位置 x₀', {
      min: -10,
      max: 10,
      step: 0.05,
      value: this.tangentX,
      format: (v) => v.toFixed(2),
      onInput: (v) => {
        this.tangentX = v;
        this.ctx.invalidate();
      },
    });
    tangentSlider.input.disabled = true;
    options.append(tangentSlider.el);
    this.tangentSlider = tangentSlider;

    const aInput = el('input', { type: 'number', value: String(this.integralA), step: '0.5' });
    const bInput = el('input', { type: 'number', value: String(this.integralB), step: '0.5' });
    aInput.addEventListener('input', () => {
      this.integralA = Number(aInput.value || 0);
      this.ctx.invalidate();
    });
    bInput.addEventListener('input', () => {
      this.integralB = Number(bInput.value || 0);
      this.ctx.invalidate();
    });
    options.append(
      el('div', { class: 'field-row' }, field('积分下限 a', aInput), field('积分上限 b', bInput)),
    );
    panel.append(options);

    panel.append(
      section(
        '视图',
        el(
          'div',
          { class: 'btn-row' },
          button('重置视图', () => {
            this.plot.reset();
            this.ctx.invalidate();
          }),
          button('适应 y 轴', () => this.fitY(), { primary: true }),
          button('复位曲线参数', () => {
            for (const curve of this.curves) {
              curve.a = 0;
              curve.b = 0;
            }
            this.ctx.invalidate();
          }),
        ),
        el('p', { class: 'note-text', text: '滚轮缩放 · 空白处拖拽平移 · 双击复位视图 · Shift+拖动只改垂直偏移' }),
      ),
    );

    const stats = createStats(['可见曲线', '缩放']);
    this.stats = stats;

    panel.append(
      section(
        '分享',
        el(
          'div',
          { class: 'btn-row' },
          button('复制分享链接', () => this.copyShareLink(), { primary: true }),
        ),
        el('p', { class: 'note-text', text: '把当前所有曲线的表达式、类型与 a/b 编码进 URL 的 # 之后。' }),
      ),
    );

    panel.append(section('状态', stats.el, el('p', { class: 'note-text', text: FUNCTION_HINT })));

    return panel;
  }

  private appendRow(curve: CurveEntry, index: number): void {
    const swatch = el('div', { class: 'swatch on', title: '显示 / 隐藏' });
    swatch.style.background = curve.color;
    swatch.addEventListener('click', () => {
      curve.visible = !curve.visible;
      swatch.classList.toggle('on', curve.visible);
      this.ctx.invalidate();
    });

    const label = el('label', { class: 'sr-only', text: `函数表达式 ${index + 1}` });
    const input = el('input', {
      type: 'text',
      id: `curve-expr-${index}`,
      value: curve.source,
      spellcheck: 'false',
    });
    label.htmlFor = input.id;
    input.addEventListener('input', () => this.onInput(index, input));
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') input.blur();
    });
    input.addEventListener('paste', (ev) => {
      const text = ev.clipboardData?.getData('text/plain');
      if (!text) return;
      ev.preventDefault();
      this.applyPastedText(text, index);
    });

    const yLabel = el('label', { class: 'sr-only', text: `参数方程 y 分量 ${index + 1}` });
    const yInput = el('input', {
      type: 'text',
      class: 'curve-y-input',
      id: `curve-expr-y-${index}`,
      value: curve.sourceY,
      placeholder: 'y(u) = …',
      spellcheck: 'false',
    });
    yLabel.htmlFor = yInput.id;
    yInput.hidden = curve.mode !== 'parametric';
    yLabel.hidden = yInput.hidden;
    yInput.addEventListener('input', () => this.onYInput(index, yInput));

    const modeLabel = el('label', { class: 'sr-only', text: `曲线 ${index + 1} 的类型` });
    const select = el('select', {
      class: 'mode-select',
      id: `curve-mode-${index}`,
      title: '曲线类型',
      'aria-label': `曲线 ${index + 1} 的类型`,
    });
    modeLabel.htmlFor = `curve-mode-${index}`;
    for (const mode of ['explicit', 'implicit', 'polar', 'parametric'] as CurveMode[]) {
      select.append(el('option', { value: mode, text: MODE_LABELS[mode] }));
    }
    select.value = curve.mode;
    select.addEventListener('change', () => {
      curve.mode = select.value as CurveMode;
      const isParametric = curve.mode === 'parametric';
      yInput.hidden = !isParametric;
      yLabel.hidden = !isParametric;
      this.onInput(index, input);
    });

    const exprs = el('div', { class: 'curve-exprs' }, label, input, yLabel, yInput);
    const row = el('div', { class: 'curve-row' }, swatch, modeLabel, select, exprs);
    this.inputs.push(input);
    this.yInputs.push(yInput);
    this.selects.push(select);
    this.curveList.append(row);
  }

  private addCurve(): void {
    if (this.curves.length >= MAX_CURVES) {
      this.errorEl.textContent = `最多 ${MAX_CURVES} 条曲线`;
      return;
    }
    const index = this.curves.length;
    const entry = this.makeEntry('', 'explicit', index);
    entry.visible = true;
    this.curves.push(entry);
    this.appendRow(entry, index);
    this.ctx.invalidate();
  }

  private onInput(index: number, input: HTMLInputElement): void {
    const curve = this.curves[index];
    if (!curve) return;
    curve.source = input.value;
    const result = this.refresh(curve);
    input.classList.toggle('invalid', !result.ok);
    this.errorEl.textContent = result.message;
    this.errorEl.style.color = result.ok ? theme.compare : theme.danger;
    this.ctx.invalidate();
  }

  private onYInput(index: number, input: HTMLInputElement): void {
    const curve = this.curves[index];
    if (!curve) return;
    curve.sourceY = input.value;
    const result = this.refresh(curve);
    input.classList.toggle('invalid', !result.ok);
    this.errorEl.textContent = result.message;
    this.errorEl.style.color = result.ok ? theme.compare : theme.danger;
    this.ctx.invalidate();
  }

  private applyFormula(index: number, source: string, mode: CurveMode, sourceY = ''): void {
    const curve = this.curves[index];
    const input = this.inputs[index];
    const yInput = this.yInputs[index];
    if (!curve || !input) return;
    curve.mode = mode;
    curve.source = source;
    curve.sourceY = sourceY;
    curve.a = 0;
    curve.b = 0;
    input.value = source;
    if (yInput) {
      yInput.value = sourceY;
      yInput.hidden = mode !== 'parametric';
    }
    const select = this.selects[index];
    if (select) select.value = mode;
    this.onInput(index, input);
  }

  // ---------- 分享 ----------

  private copyShareLink(): void {
    const state = {
      v: 1,
      curves: this.curves.map((c) => ({
        s: c.source,
        y: c.sourceY || undefined,
        m: c.mode,
        a: round2(c.a),
        b: round2(c.b),
        on: c.visible,
      })),
    };
    const hash = `#${encodeShare(state)}`;
    history.replaceState(null, '', hash);
    const url = location.href;

    navigator.clipboard
      .writeText(url)
      .then(() => {
        this.errorEl.textContent = '分享链接已复制到剪贴板';
        this.errorEl.style.color = theme.accent;
      })
      .catch(() => {
        this.errorEl.textContent = `复制失败，手动复制地址栏：${url}`;
        this.errorEl.style.color = theme.compare;
      });
  }

  /** 从 URL hash 还原曲线；解析失败就返回 null，退回默认值。 */
  private readHash(): Array<{ source: string; sourceY?: string; mode?: CurveMode; a?: number; b?: number }> | null {
    const raw = location.hash.replace(/^#/, '');
    if (!raw) return null;
    const state = decodeShare<{
      v?: number;
      curves?: Array<{ s?: unknown; y?: unknown; m?: unknown; a?: unknown; b?: unknown; on?: unknown }>;
    }>(raw);
    if (!state || !Array.isArray(state.curves) || state.curves.length === 0) return null;

    const modes: CurveMode[] = ['explicit', 'implicit', 'polar', 'parametric'];
    const parsed = state.curves
      .filter((c) => typeof c?.s === 'string')
      .slice(0, MAX_CURVES)
      .map((c) => ({
        source: String(c.s),
        sourceY: typeof c.y === 'string' ? c.y : '',
        mode: modes.includes(c.m as CurveMode) ? (c.m as CurveMode) : 'explicit',
        a: typeof c.a === 'number' && Number.isFinite(c.a) ? c.a : 0,
        b: typeof c.b === 'number' && Number.isFinite(c.b) ? c.b : 0,
      }));

    if (parsed.length === 0) return null;
    this.restoredFromHash = true;
    return parsed;
  }

  // ---------- 粘贴 ----------

  private bindPaste(): void {
    document.addEventListener('paste', (ev) => {
      if (!this.isActive) return;
      const target = ev.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return; // 输入框自己处理
      const text = ev.clipboardData?.getData('text/plain');
      if (!text) return;
      ev.preventDefault();
      this.applyPastedText(text, 0);
    });
  }

  private applyPastedText(text: string, startIndex: number): void {
    const { entries, notes } = normalizeFormulaBlock(text);
    if (entries.length === 0) return;

    entries.forEach((entry, offset) => {
      const index = startIndex + offset;
      if (index >= this.curves.length) this.addCurve();
      if (index >= this.curves.length) return;
      this.applyFormula(index, entry.source, entry.mode, entry.sourceY ?? '');
    });

    this.errorEl.textContent = notes.join(' · ');
    this.errorEl.style.color = theme.accent;
    this.ctx.invalidate();
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        this.errorEl.textContent = '剪贴板是空的';
        this.errorEl.style.color = theme.compare;
        return;
      }
      const { entries } = normalizeFormulaBlock(text);
      if (entries.length === 0) {
        this.errorEl.textContent = '没从剪贴板里识别出公式';
        this.errorEl.style.color = theme.compare;
        return;
      }
      this.applyPastedText(text, 0);
    } catch {
      this.errorEl.textContent = '浏览器拒绝了剪贴板读取，请用 Ctrl+V 粘贴到输入框';
      this.errorEl.style.color = theme.danger;
    }
  }

  // ---------- 视图适配 ----------

  private fitY(): void {
    const { width: W, height: H } = this.surface;
    const left = this.plot.screenToWorld(0, 0).x;
    const right = this.plot.screenToWorld(W, 0).x;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const scope = { x: 0, t: this.ctx.transport.progress, a: 0, b: 0 };

    for (const curve of this.curves) {
      if (!curve.visible || !curve.compiled || curve.mode !== 'explicit') continue;
      scope.a = curve.a;
      scope.b = curve.b;
      for (let i = 0; i <= 480; i++) {
        scope.x = left + ((right - left) * i) / 480 - (curve.usesA ? 0 : curve.a);
        const y = curve.compiled.fn(scope) + (curve.usesB ? 0 : curve.b);
        if (!Number.isFinite(y)) continue;
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (max - min < 1e-6) {
      max += 1;
      min -= 1;
    }
    const pad = (max - min) * 0.12;
    this.plot.cy = (min + max) / 2;
    this.plot.scale = H / (max - min + pad * 2);
    this.ctx.invalidate();
  }

  // ---------- 画布交互 ----------

  private bindCanvas(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.plot.zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, Math.exp(-ev.deltaY * 0.0015));
      this.ctx.invalidate();
    }, { passive: false });

    canvas.addEventListener('pointerdown', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch {
        // 合成事件没有真实 pointerId，捕获失败不影响后续逻辑
      }

      const index = this.plot.pickCurve(this.specs(), sx, sy, this.ctx.transport.progress);
      if (index >= 0) {
        const curve = this.curves[index]!;
        this.drag = { index, a0: curve.a, b0: curve.b, sx, sy };
        this.active = { index, a: curve.a, b: curve.b };
        canvas.style.cursor = 'grabbing';
      } else {
        this.panning = { sx, sy };
        canvas.style.cursor = 'grabbing';
      }
      this.ctx.invalidate();
    });

    canvas.addEventListener('pointermove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;

      if (this.drag) {
        const curve = this.curves[this.drag.index];
        if (curve) {
          const dxWorld = (sx - this.drag.sx) / this.plot.scale;
          const dyWorld = -(sy - this.drag.sy) / this.plot.scale;
          curve.a = this.drag.a0 + dxWorld;
          curve.b = this.drag.b0 + dyWorld;
          if (ev.shiftKey) curve.a = this.drag.a0;
          this.active = { index: this.drag.index, a: curve.a, b: curve.b };
        }
        this.ctx.invalidate();
        return;
      }

      if (this.panning) {
        this.plot.pan(sx - this.panning.sx, sy - this.panning.sy);
        this.panning = { sx, sy };
        this.ctx.invalidate();
        return;
      }

      this.hover = { x: sx, y: sy };
      const hit = this.plot.pickCurve(this.specs(), sx, sy, this.ctx.transport.progress);
      canvas.style.cursor = hit >= 0 ? 'grab' : 'crosshair';
      this.ctx.invalidate();
    });

    const end = (): void => {
      this.drag = null;
      this.panning = null;
      this.active = null;
      canvas.style.cursor = 'crosshair';
      this.ctx.invalidate();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.ctx.invalidate();
    });

    canvas.addEventListener('dblclick', () => {
      this.plot.reset();
      this.ctx.invalidate();
    });

    canvas.style.cursor = 'crosshair';
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

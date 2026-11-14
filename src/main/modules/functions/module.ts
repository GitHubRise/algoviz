import { el } from '../../core/dom';
import { Surface } from '../../core/surface';
import { theme } from '../../core/theme';
import { compileSource, validate } from '../../math/evaluate';
import { FUNCTION_HINT } from '../../math/functions';
import type { Compiled } from '../../math/evaluate';
import type { ModuleContext, VizModule } from '../../ui/module';
import { button, createStats, field, section, slider, toggle } from '../../ui/controls';
import { PlotView, type CurveSpec, type PlotOptions } from './plot';

interface CurveEntry {
  source: string;
  color: string;
  visible: boolean;
  compiled: Compiled | null;
}

const PRESETS = [
  { label: '正弦', source: 'sin(x)' },
  { label: '高斯', source: 'gauss(x)' },
  { label: '双曲', source: '1/x' },
  { label: '衰减波', source: 'exp(-0.15x)sin(3x)' },
  { label: '心形', source: 'sqrt(1-x^2)' },
];

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
  private swatches: HTMLElement[] = [];
  private errorEl: HTMLElement;

  private showGrid = true;
  private showTangent = false;
  private showIntegral = true;
  private tangentX = 1;
  private integralA = -1;
  private integralB = 1;
  private hover: { x: number; y: number } | null = null;

  constructor(ctx: ModuleContext, initial: string[] = ['sin(x)', '0.15x^2 - 2']) {
    this.ctx = ctx;
    const canvas = el('canvas');
    this.stage = el('div', {}, canvas);
    this.surface = new Surface(canvas);
    this.plot = new PlotView(this.surface);
    this.errorEl = el('p', { class: 'error-text' });

    this.curves = initial.map((source, i) => {
      const parsed = validate(source);
      return {
        source,
        color: theme.curve[i % theme.curve.length]!,
        visible: true,
        compiled: parsed.ok ? compileSource(source) : null,
      };
    });

    this.panel = this.buildPanel();
    this.bindCanvas(canvas);
  }

  activate(): void {
    this.ctx.transport.configure({ durationMs: 10000, loop: true, stepSize: 0.01 });
    this.surface.resize();
    this.plot.reset();
    this.render(this.ctx.transport.progress);
  }

  deactivate(): void {
    this.hover = null;
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
    };
    const specs: CurveSpec[] = this.curves.map((c) => ({
      color: c.color,
      compiled: c.visible ? c.compiled : null,
      visible: c.visible,
    }));
    this.plot.draw(specs, opts);
    const visible = this.curves.filter((c) => c.visible && c.compiled).length;
    this.stats.set([String(visible), `${Math.round(this.plot.scale)} px/单位`]);
  }

  private buildPanel(): HTMLElement {
    const panel = el('div', {});

    panel.append(
      el('h2', { class: 'panel-title', text: '函数绘图' }),
      el('p', {
        class: 'panel-sub',
        text: '输入表达式即画曲线。t 是随播放器推进的动画参数，可写 sin(x + 2*pi*t) 做行波。',
      }),
    );

    const curveSection = section('曲线');
    this.curves.forEach((curve, index) => {
      const swatch = el('div', { class: 'swatch on', title: '显示 / 隐藏' });
      swatch.style.background = curve.color;
      const input = el('input', {
        type: 'text',
        value: curve.source,
        spellcheck: 'false',
        'aria-label': `函数表达式 ${index + 1}`,
      });
      input.addEventListener('input', () => this.updateCurve(index, input));
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') input.blur();
      });
      swatch.addEventListener('click', () => {
        curve.visible = !curve.visible;
        swatch.classList.toggle('on', curve.visible);
        this.ctx.invalidate();
      });
      this.inputs.push(input);
      this.swatches.push(swatch);
      curveSection.append(el('div', { class: 'curve-row' }, swatch, input));
    });
    curveSection.append(this.errorEl);
    panel.append(curveSection);

    const presets = section(
      '示例',
      el(
        'div',
        { class: 'btn-row' },
        ...PRESETS.map((p) =>
          button(p.label, () => {
            const target = this.curves.length > 1 ? 1 : 0;
            this.curves[target]!.source = p.source;
            this.inputs[target]!.value = p.source;
            this.updateCurve(target, this.inputs[target]!);
          }),
        ),
      ),
    );
    panel.append(presets);

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
        ),
        el('p', { class: 'note-text', text: '滚轮缩放、拖拽平移、双击复位。' }),
      ),
    );

    const stats = createStats(['可见曲线', '缩放']);
    this.stats = stats;
    panel.append(section('状态', stats.el, el('p', { class: 'note-text', text: FUNCTION_HINT })));

    return panel;
  }

  private stats!: ReturnType<typeof createStats>;
  private tangentSlider!: ReturnType<typeof slider>;

  private updateCurve(index: number, input: HTMLInputElement): void {
    const curve = this.curves[index]!;
    curve.source = input.value;
    const result = validate(input.value);

    if (!result.ok) {
      curve.compiled = null;
      input.classList.add('invalid');
      this.errorEl.textContent = result.message;
    } else {
      curve.compiled = compileSource(input.value);
      input.classList.remove('invalid');
      const unknown = result.variables.filter((name) => name !== 'x' && name !== 't');
      this.errorEl.textContent = unknown.length
        ? `按变量处理：${unknown.join(', ')}（当前取值为 0）`
        : '';
      if (unknown.length) this.errorEl.style.color = theme.compare;
      else this.errorEl.style.color = theme.danger;
    }
    this.ctx.invalidate();
  }

  /** 在当前 x 视窗内采样，自适应 y 轴范围。 */
  private fitY(): void {
    const { width: W, height: H } = this.surface;
    const left = this.plot.screenToWorld(0, 0).x;
    const right = this.plot.screenToWorld(W, 0).x;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    const scope = { x: 0, t: this.ctx.transport.progress };

    for (const curve of this.curves) {
      if (!curve.visible || !curve.compiled) continue;
      for (let i = 0; i <= 480; i++) {
        scope.x = left + ((right - left) * i) / 480;
        const y = curve.compiled.fn(scope);
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

  private bindCanvas(canvas: HTMLCanvasElement): void {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-ev.deltaY * 0.0015);
      this.plot.zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, factor);
      this.ctx.invalidate();
    }, { passive: false });

    canvas.addEventListener('pointerdown', (ev) => {
      dragging = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
      canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('pointermove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      this.hover = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      if (dragging) {
        this.plot.pan(ev.clientX - lastX, ev.clientY - lastY);
        lastX = ev.clientX;
        lastY = ev.clientY;
      }
      this.ctx.invalidate();
    });

    const end = (): void => {
      dragging = false;
      canvas.style.cursor = 'grab';
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

    canvas.style.cursor = 'grab';
  }
}

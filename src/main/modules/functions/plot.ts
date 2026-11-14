import { Surface } from '../../core/surface';
import { theme, font } from '../../core/theme';
import type { Compiled, Scope } from '../../math/evaluate';

export interface CurveSpec {
  color: string;
  compiled: Compiled | null;
  visible: boolean;
}

export interface PlotOptions {
  showGrid: boolean;
  showTangent: boolean;
  tangentX: number;
  showIntegral: boolean;
  integralA: number;
  integralB: number;
  /** 鼠标在画布上的位置（CSS 像素），用于十字准星 */
  hover: { x: number; y: number } | null;
  /** 动画参数 t，随播放器进度变化 */
  t: number;
}

/**
 * 函数绘图视图。
 *
 * 坐标变换用「中心点 + 每单位像素数」表达，天然保持 x/y 等比例，
 * 缩放时不会把圆压成椭圆。
 */
export class PlotView {
  readonly surface: Surface;
  cx = 0;
  cy = 0;
  scale = 60;

  private lastWidth = 0;
  private lastHeight = 0;

  constructor(surface: Surface) {
    this.surface = surface;
  }

  resize(): boolean {
    const changed = this.surface.resize();
    const { width, height } = this.surface;
    if (changed) {
      if (this.lastWidth === 0 && this.lastHeight === 0) {
        this.scale = Math.min(width, height) / 11;
      } else {
        // 保持可视范围不变，只按尺寸比例缩放
        const ratioX = width / Math.max(1, this.lastWidth);
        const ratioY = height / Math.max(1, this.lastHeight);
        this.scale *= Math.min(ratioX, ratioY);
      }
      this.lastWidth = width;
      this.lastHeight = height;
    }
    return changed;
  }

  reset(): void {
    const { width, height } = this.surface;
    this.cx = 0;
    this.cy = 0;
    this.scale = Math.min(width, height) / 11;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.scale = clamp(this.scale * factor, 6, 8000);
    const after = this.screenToWorld(sx, sy);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  pan(dx: number, dy: number): void {
    this.cx -= dx / this.scale;
    this.cy += dy / this.scale;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.cx + (sx - this.surface.width / 2) / this.scale,
      y: this.cy - (sy - this.surface.height / 2) / this.scale,
    };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return {
      x: this.surface.width / 2 + (x - this.cx) * this.scale,
      y: this.surface.height / 2 - (y - this.cy) * this.scale,
    };
  }

  draw(curves: CurveSpec[], opts: PlotOptions): void {
    const { surface } = this;
    surface.clear(theme.bg);

    const step = niceStep(78 / this.scale);
    if (opts.showGrid) this.drawGrid(step);
    this.drawAxes(step);

    for (const curve of curves) {
      if (!curve.visible || !curve.compiled) continue;
      this.drawCurve(curve, opts);
    }

    if (opts.showIntegral) this.drawIntegral(curves, opts);
    if (opts.showTangent) this.drawTangent(curves, opts);
    if (opts.hover) this.drawHover(curves, opts);
    else surface.hint('滚轮缩放 · 拖拽平移 · 双击复位');
  }

  private drawGrid(step: number): void {
    const { ctx, width: W, height: H } = this.surface;
    const left = this.screenToWorld(0, 0).x;
    const right = this.screenToWorld(W, 0).x;
    const top = this.screenToWorld(0, 0).y;
    const bottom = this.screenToWorld(0, H).y;

    ctx.lineWidth = 1;
    // 细网格（主格 1/5）
    ctx.strokeStyle = theme.grid;
    ctx.beginPath();
    for (const minor of [0.2, 0.4, 0.6, 0.8]) {
      const s = step * minor;
      for (let x = Math.ceil(left / s) * s; x <= right; x += s) {
        const sx = Math.round(this.worldToScreen(x, 0).x) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, H);
      }
      for (let y = Math.ceil(bottom / s) * s; y <= top; y += s) {
        const sy = Math.round(this.worldToScreen(0, y).y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(W, sy);
      }
    }
    ctx.stroke();

    // 主网格
    ctx.strokeStyle = theme.gridMajor;
    ctx.beginPath();
    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      const sx = Math.round(this.worldToScreen(x, 0).x) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
    }
    for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
      const sy = Math.round(this.worldToScreen(0, y).y) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
    }
    ctx.stroke();
  }

  private drawAxes(step: number): void {
    const { ctx, width: W, height: H } = this.surface;
    const origin = this.worldToScreen(0, 0);
    const axisY = clamp(origin.y, 0, H);
    const axisX = clamp(origin.x, 0, W);

    ctx.strokeStyle = theme.axis;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(axisY) + 0.5);
    ctx.lineTo(W, Math.round(axisY) + 0.5);
    ctx.moveTo(Math.round(axisX) + 0.5, 0);
    ctx.lineTo(Math.round(axisX) + 0.5, H);
    ctx.stroke();

    // 刻度数值
    ctx.font = font.monoSmall;
    ctx.fillStyle = theme.textFaint;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const left = this.screenToWorld(0, 0).x;
    const right = this.screenToWorld(W, 0).x;
    const top = this.screenToWorld(0, 0).y;
    const bottom = this.screenToWorld(0, H).y;
    const decimals = Math.max(0, Math.min(6, -Math.floor(Math.log10(step))));
    const labelY = clamp(axisY + 5, 2, H - 16);

    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      if (Math.abs(x) < step * 1e-6) continue;
      const sx = this.worldToScreen(x, 0).x;
      if (sx < 18 || sx > W - 18) continue;
      ctx.fillText(formatNumber(x, decimals), sx, labelY);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const labelX = clamp(axisX - 6, 22, W - 4);
    for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
      if (Math.abs(y) < step * 1e-6) continue;
      const sy = this.worldToScreen(0, y).y;
      if (sy < 12 || sy > H - 12) continue;
      ctx.fillText(formatNumber(y, decimals), labelX, sy);
    }

    // 原点
    if (axisX > 10 && axisX < W - 10 && axisY > 10 && axisY < H - 10) {
      ctx.fillStyle = theme.textDim;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('0', axisX - 6, axisY + 5);
    }
  }

  private drawCurve(curve: CurveSpec, opts: PlotOptions): void {
    const { ctx, width: W, height: H } = this.surface;
    const compiled = curve.compiled!;
    const scope: Scope = { x: 0, t: opts.t };
    const stepPx = 0.75;
    const jumpLimit = H * 1.6;

    ctx.save();
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    let drawing = false;
    let prevSy = Number.NaN;
    const left = this.screenToWorld(0, 0).x;
    const worldPerPx = 1 / this.scale;

    for (let px = 0; px <= W; px += stepPx) {
      const x = left + px * worldPerPx;
      scope.x = x;
      const y = compiled.fn(scope);

      if (!Number.isFinite(y)) {
        drawing = false;
        prevSy = Number.NaN;
        continue;
      }
      const sy = this.worldToScreen(0, y).y;
      // 视口外的极端值不进路径，避免画布坐标爆炸
      if (sy < -H * 4 || sy > H * 5) {
        drawing = false;
        prevSy = Number.NaN;
        continue;
      }
      if (drawing && Number.isFinite(prevSy) && Math.abs(sy - prevSy) > jumpLimit) {
        drawing = false; // 视为不连续（渐近线），断开路径
      }
      if (drawing) ctx.lineTo(px, sy);
      else {
        ctx.moveTo(px, sy);
        drawing = true;
      }
      prevSy = sy;
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawIntegral(curves: CurveSpec[], opts: PlotOptions): void {
    const a = Math.min(opts.integralA, opts.integralB);
    const b = Math.max(opts.integralA, opts.integralB);
    const curve = curves.find((c) => c.visible && c.compiled);
    if (!curve || b - a < 1e-9) return;

    const { ctx, width: W, height: H } = this.surface;
    const scope: Scope = { x: 0, t: opts.t };
    const baseline = clamp(this.worldToScreen(0, 0).y, 0, H);
    const steps = 260;

    ctx.save();
    ctx.beginPath();
    const x0 = this.worldToScreen(a, 0).x;
    let started = false;
    for (let i = 0; i <= steps; i++) {
      const x = a + ((b - a) * i) / steps;
      scope.x = x;
      const y = curve.compiled!.fn(scope);
      if (!Number.isFinite(y)) continue;
      const p = this.worldToScreen(x, y);
      if (!started) {
        ctx.moveTo(p.x, baseline);
        ctx.lineTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    if (!started) return;
    ctx.lineTo(this.worldToScreen(b, 0).x, baseline);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(curve.color, 0.14);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(curve.color, 0.55);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const edge of [a, b]) {
      scope.x = edge;
      const y = curve.compiled!.fn(scope);
      if (!Number.isFinite(y)) continue;
      const p = this.worldToScreen(edge, y);
      ctx.beginPath();
      ctx.moveTo(p.x, baseline);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 数值（辛普森法）
    const n = 400;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      scope.x = x;
      const y = curve.compiled!.fn(scope);
      if (!Number.isFinite(y)) {
        sum = Number.NaN;
        break;
      }
      const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
      sum += w * y;
    }
    const area = (sum * (b - a)) / (3 * n);
    ctx.font = font.mono;
    ctx.fillStyle = curve.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const label = `∫ ${a}→${b} ≈ ${formatSigned(area)}`;
    ctx.fillText(label, clamp(x0 + 8, 8, W - 150), clamp(this.worldToScreen(0, 0).y - 12, 22, H - 8));
    ctx.restore();
  }

  private drawTangent(curves: CurveSpec[], opts: PlotOptions): void {
    const curve = curves.find((c) => c.visible && c.compiled);
    if (!curve) return;
    const { ctx, width: W } = this.surface;
    const scope: Scope = { x: 0, t: opts.t };
    const x0 = opts.tangentX;
    scope.x = x0;
    const y0 = curve.compiled!.fn(scope);
    if (!Number.isFinite(y0)) return;

    const h = Math.max(1e-5, Math.abs(x0) * 1e-5);
    scope.x = x0 + h;
    const y1 = curve.compiled!.fn(scope);
    scope.x = x0 - h;
    const y2 = curve.compiled!.fn(scope);
    const slope = (y1 - y2) / (2 * h);
    if (!Number.isFinite(slope)) return;

    const leftX = this.screenToWorld(0, 0).x;
    const rightX = this.screenToWorld(W, 0).x;
    const pLeft = this.worldToScreen(leftX, y0 + slope * (leftX - x0));
    const pRight = this.worldToScreen(rightX, y0 + slope * (rightX - x0));

    ctx.save();
    ctx.strokeStyle = hexToRgba(curve.color, 0.75);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(pLeft.x, pLeft.y);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const p = this.worldToScreen(x0, y0);
    ctx.fillStyle = curve.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = font.monoSmall;
    ctx.fillStyle = theme.textDim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`x₀=${formatSigned(x0)}  f(x₀)=${formatSigned(y0)}  f′≈${formatSigned(slope)}`, 12, 22);
    ctx.restore();
  }

  private drawHover(curves: CurveSpec[], opts: PlotOptions): void {
    const { ctx, width: W, height: H } = this.surface;
    const hover = opts.hover!;
    const world = this.screenToWorld(hover.x, hover.y);
    const scope: Scope = { x: world.x, t: opts.t };

    ctx.save();
    ctx.strokeStyle = 'rgba(230,237,247,0.22)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.round(hover.x) + 0.5, 0);
    ctx.lineTo(Math.round(hover.x) + 0.5, H);
    ctx.moveTo(0, Math.round(hover.y) + 0.5);
    ctx.lineTo(W, Math.round(hover.y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    const lines: string[] = [`x = ${formatSigned(world.x, 4)}`];
    for (const curve of curves) {
      if (!curve.visible || !curve.compiled) continue;
      const y = curve.compiled.fn(scope);
      if (!Number.isFinite(y)) continue;
      const p = this.worldToScreen(world.x, y);
      ctx.fillStyle = curve.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      lines.push(`f(x) = ${formatSigned(y, 4)}`);
    }

    ctx.font = font.monoSmall;
    const padX = 9;
    const lineH = 16;
    const boxW = 148;
    const boxH = lines.length * lineH + 12;
    const bx = clamp(hover.x + 16, 8, W - boxW - 8);
    const by = clamp(hover.y + 16, 8, H - boxH - 8);
    ctx.fillStyle = 'rgba(11,14,20,0.92)';
    ctx.strokeStyle = theme.borderStrong;
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = theme.textDim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? theme.textDim : theme.text;
      ctx.fillText(line, bx + padX, by + 7 + i * lineH);
    });
    ctx.restore();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function niceStep(target: number): number {
  const exponent = Math.floor(Math.log10(target));
  const base = target / Math.pow(10, exponent);
  const nice = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return nice * Math.pow(10, exponent);
}

function formatNumber(v: number, decimals: number): string {
  if (Math.abs(v) < 1e-12) return '0';
  const text = v.toFixed(Math.min(6, decimals));
  return text.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatSigned(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '∅';
  const rounded = Math.abs(v) < 1e-9 ? 0 : v;
  const abs = Math.abs(rounded);
  const text = abs >= 1e5 || (abs < 1e-3 && abs > 0)
    ? rounded.toExponential(2)
    : rounded.toFixed(digits).replace(/\.?0+$/, '');
  return text === '' || text === '-' ? '0' : text;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(76,201,240,${alpha})`;
  const int = parseInt(m[1]!, 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export { clamp, formatSigned };

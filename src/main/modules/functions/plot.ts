import { Surface } from '../../core/surface';
import { theme, font } from '../../core/theme';
import { findExtrema, findRoots } from '../../math/analysis';
import type { Compiled, Scope } from '../../math/evaluate';
import type { CurveMode } from '../../math/normalize';

export interface CurveSpec {
  color: string;
  compiled: Compiled | null;
  /** 参数方程的 y 分量 */
  compiledY: Compiled | null;
  visible: boolean;
  mode: CurveMode;
  /** 水平偏移（表达式里没用到 a 时由渲染层施加） */
  a: number;
  /** 垂直偏移（表达式里没用到 b 时由渲染层施加） */
  b: number;
  usesA: boolean;
  usesB: boolean;
  /** 原始表达式，分析标注的标题用 */
  source: string;
}

export interface PlotOptions {
  showGrid: boolean;
  showTangent: boolean;
  tangentX: number;
  showIntegral: boolean;
  integralA: number;
  integralB: number;
  hover: { x: number; y: number } | null;
  /** 动画参数 t，随播放器进度变化 */
  t: number;
  /** 正在被拖动的曲线（用于显示 a/b 读数） */
  active: { index: number; a: number; b: number } | null;
  /** 叠加导数曲线 f′(x) */
  showDerivative: boolean;
  /** 标注零点与极值 */
  showAnalysis: boolean;
}

/**
 * 函数绘图视图。
 *
 * 坐标变换用「中心点 + 每单位像素数」表达，天然保持 x/y 等比例。
 * 三种曲线共用同一套视图：y=f(x) 逐列采样、r(θ) 参数采样、F(x,y)=0 用 marching squares。
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
      if (curve.mode === 'explicit') this.drawExplicit(curve, opts);
      else if (curve.mode === 'polar') this.drawPolar(curve, opts);
      else if (curve.mode === 'parametric') this.drawParametric(curve, opts);
      else this.drawImplicit(curve, opts);
    }

    if (opts.showDerivative) this.drawDerivatives(curves, opts);
    if (opts.showAnalysis) this.drawAnalysis(curves, opts);
    if (opts.showIntegral) this.drawIntegral(curves, opts);
    if (opts.showTangent) this.drawTangent(curves, opts);
    if (opts.hover) this.drawHover(curves, opts);
    if (opts.active) this.drawActive(curves, opts);
    else if (!opts.hover) surface.hint('滚轮缩放 · 拖拽曲线改 a/b · 空白处拖拽平移 · 双击复位');
  }

  // ---------- 三条曲线路径 ----------

  private xShift(curve: CurveSpec): number {
    return curve.usesA ? 0 : curve.a;
  }

  private yShift(curve: CurveSpec): number {
    return curve.usesB ? 0 : curve.b;
  }

  private drawExplicit(curve: CurveSpec, opts: PlotOptions): void {
    const { ctx, width: W, height: H } = this.surface;
    const compiled = curve.compiled!;
    const scope: Scope = { x: 0, t: opts.t, a: curve.a, b: curve.b };
    const xShift = this.xShift(curve);
    const yShift = this.yShift(curve);
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
      scope.x = x - xShift;
      const value = compiled.fn(scope);
      const y = value + yShift;

      if (!Number.isFinite(value) || !Number.isFinite(y)) {
        drawing = false;
        prevSy = Number.NaN;
        continue;
      }
      const sy = this.worldToScreen(0, y).y;
      if (sy < -H * 4 || sy > H * 5) {
        drawing = false;
        prevSy = Number.NaN;
        continue;
      }
      if (drawing && Number.isFinite(prevSy) && Math.abs(sy - prevSy) > jumpLimit) {
        drawing = false;
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

  /** 极坐标采样点（世界坐标），绘制与命中检测共用。 */
  private polarPoints(curve: CurveSpec, t: number): Array<{ x: number; y: number }> {
    const compiled = curve.compiled!;
    const scope: Scope = { th: 0, t, a: curve.a, b: curve.b };
    const xShift = this.xShift(curve);
    const yShift = this.yShift(curve);
    const steps = 1400;
    const turns = 3;
    const out: Array<{ x: number; y: number }> = [];

    for (let i = 0; i <= steps; i++) {
      const th = (i / steps) * Math.PI * 2 * turns;
      scope.th = th;
      const r = compiled.fn(scope);
      if (!Number.isFinite(r) || Math.abs(r) > 1e6) {
        out.push({ x: Number.NaN, y: Number.NaN });
        continue;
      }
      out.push({ x: r * Math.cos(th) + xShift, y: r * Math.sin(th) + yShift });
    }
    return out;
  }

  private drawPolar(curve: CurveSpec, opts: PlotOptions): void {
    const { ctx, width: W, height: H } = this.surface;
    const points = this.polarPoints(curve, opts.t);

    ctx.save();
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    let drawing = false;
    for (const p of points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        drawing = false;
        continue;
      }
      const s = this.worldToScreen(p.x, p.y);
      if (s.x < -W * 2 || s.x > W * 3 || s.y < -H * 2 || s.y > H * 3) {
        drawing = false;
        continue;
      }
      if (drawing) ctx.lineTo(s.x, s.y);
      else {
        ctx.moveTo(s.x, s.y);
        drawing = true;
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** 参数方程采样点；u ∈ [0,4π] 扫两圈，够闭合常见图形。 */
  private parametricPoints(curve: CurveSpec, t: number): Array<{ x: number; y: number }> {
    const fx = curve.compiled;
    const fy = curve.compiledY;
    if (!fx || !fy) return [];
    const scope: Scope = { u: 0, t, a: curve.a, b: curve.b };
    const xShift = this.xShift(curve);
    const yShift = this.yShift(curve);
    const steps = 1200;
    const out: Array<{ x: number; y: number }> = [];

    for (let i = 0; i <= steps; i++) {
      scope.u = (i / steps) * Math.PI * 4;
      const x = fx.fn(scope);
      const y = fy.fn(scope);
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) {
        out.push({ x: Number.NaN, y: Number.NaN });
        continue;
      }
      out.push({ x: x + xShift, y: y + yShift });
    }
    return out;
  }

  private drawParametric(curve: CurveSpec, opts: PlotOptions): void {
    const { ctx, width: W, height: H } = this.surface;
    const points = this.parametricPoints(curve, opts.t);
    if (points.length === 0) return;

    ctx.save();
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    let drawing = false;
    for (const p of points) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        drawing = false;
        continue;
      }
      const s = this.worldToScreen(p.x, p.y);
      if (s.x < -W * 2 || s.x > W * 3 || s.y < -H * 2 || s.y > H * 3) {
        drawing = false;
        continue;
      }
      if (drawing) ctx.lineTo(s.x, s.y);
      else {
        ctx.moveTo(s.x, s.y);
        drawing = true;
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** 显式曲线的导数叠加（虚线，数值中心差分）。 */
  private drawDerivatives(curves: CurveSpec[], opts: PlotOptions): void {
    const { ctx, width: W, height: H } = this.surface;
    const scope: Scope = { x: 0, t: opts.t, a: 0, b: 0 };
    const left = this.screenToWorld(0, 0).x;
    const worldPerPx = 1 / this.scale;

    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);

    for (const curve of curves) {
      if (!curve.visible || !curve.compiled || curve.mode !== 'explicit') continue;
      const compiled = curve.compiled;
      const xShift = this.xShift(curve);
      const evalAt = (x: number): number => {
        scope.a = curve.a;
        scope.b = curve.b;
        scope.x = x - xShift;
        return compiled.fn(scope);
      };

      ctx.strokeStyle = hexToRgba(curve.color, 0.5);
      ctx.beginPath();
      let drawing = false;
      let prevSy = Number.NaN;

      for (let px = 0; px <= W; px += 1.2) {
        const x = left + px * worldPerPx;
        const h = Math.max(1e-4, Math.abs(x) * 1e-4);
        const slope = (evalAt(x + h) - evalAt(x - h)) / (2 * h);
        if (!Number.isFinite(slope)) {
          drawing = false;
          prevSy = Number.NaN;
          continue;
        }
        const sy = this.worldToScreen(0, slope).y;
        if (sy < -H * 4 || sy > H * 5) {
          drawing = false;
          prevSy = Number.NaN;
          continue;
        }
        if (drawing && Number.isFinite(prevSy) && Math.abs(sy - prevSy) > H * 1.6) drawing = false;
        if (drawing) ctx.lineTo(px, sy);
        else {
          ctx.moveTo(px, sy);
          drawing = true;
        }
        prevSy = sy;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** 零点与极值标注。 */
  private drawAnalysis(curves: CurveSpec[], opts: PlotOptions): void {
    const { ctx, width: W } = this.surface;
    const scope: Scope = { x: 0, t: opts.t, a: 0, b: 0 };
    const left = this.screenToWorld(0, 0).x;
    const right = this.screenToWorld(W, 0).x;
    const samples = Math.max(240, Math.min(800, Math.floor(W / 2)));

    ctx.save();
    ctx.font = font.monoSmall;

    for (const curve of curves) {
      if (!curve.visible || !curve.compiled || curve.mode !== 'explicit') continue;
      const compiled = curve.compiled;
      const xShift = this.xShift(curve);
      const yShift = this.yShift(curve);
      const f = (x: number): number => {
        scope.a = curve.a;
        scope.b = curve.b;
        scope.x = x - xShift;
        return compiled.fn(scope) + yShift;
      };

      for (const root of findRoots(f, left, right, samples)) {
        const p = this.worldToScreen(root.x, root.y);
        ctx.strokeStyle = curve.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const mark of findExtrema(f, left, right, samples)) {
        const p = this.worldToScreen(mark.x, mark.y);
        ctx.fillStyle = curve.color;
        ctx.beginPath();
        const r = 3.4;
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x + r, p.y);
        ctx.lineTo(p.x, p.y + r);
        ctx.lineTo(p.x - r, p.y);
        ctx.closePath();
        ctx.fill();

        const label = `${mark.kind === 'max' ? 'max' : 'min'} (${formatSigned(mark.x, 2)}, ${formatSigned(mark.y, 2)})`;
        ctx.fillStyle = theme.textDim;
        ctx.textAlign = 'center';
        ctx.textBaseline = mark.kind === 'max' ? 'bottom' : 'top';
        ctx.fillText(label, p.x, p.y + (mark.kind === 'max' ? -8 : 8));
      }
    }
    ctx.restore();
  }

  /** F(x,y)=0：屏幕网格上的 marching squares，取符号变化的边交点。 */
  private drawImplicit(curve: CurveSpec, opts: PlotOptions): void {
    const { ctx, width: W, height: H } = this.surface;
    const compiled = curve.compiled!;
    const step = 8;
    const cols = Math.ceil(W / step) + 1;
    const rows = Math.ceil(H / step) + 1;
    const vals = new Float32Array(cols * rows);
    const scope: Scope = { x: 0, y: 0, t: opts.t, a: curve.a, b: curve.b };
    const left = this.screenToWorld(0, 0).x;
    const top = this.screenToWorld(0, 0).y;
    const worldPerPx = 1 / this.scale;
    const ax = this.xShift(curve);
    const by = this.yShift(curve);

    for (let j = 0; j < rows; j++) {
      const wy = top - j * step * worldPerPx;
      for (let i = 0; i < cols; i++) {
        scope.x = left + i * step * worldPerPx - ax;
        scope.y = wy - by;
        vals[j * cols + i] = compiled.fn(scope);
      }
    }

    ctx.save();
    ctx.strokeStyle = hexToRgba(curve.color, 0.92);
    ctx.lineWidth = 1.7;
    ctx.beginPath();

    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const v00 = vals[j * cols + i]!;
        const v10 = vals[j * cols + i + 1]!;
        const v11 = vals[(j + 1) * cols + i + 1]!;
        const v01 = vals[(j + 1) * cols + i]!;
        if (
          !Number.isFinite(v00) || !Number.isFinite(v10) ||
          !Number.isFinite(v11) || !Number.isFinite(v01)
        ) {
          continue;
        }

        const pts: number[] = [];
        const cross = (a: number, b: number, x1: number, y1: number, x2: number, y2: number): void => {
          if ((a >= 0) === (b >= 0)) return;
          const tt = a / (a - b);
          pts.push(x1 + (x2 - x1) * tt, y1 + (y2 - y1) * tt);
        };

        cross(v00, v10, i * step, j * step, (i + 1) * step, j * step);
        cross(v10, v11, (i + 1) * step, j * step, (i + 1) * step, (j + 1) * step);
        cross(v11, v01, (i + 1) * step, (j + 1) * step, i * step, (j + 1) * step);
        cross(v01, v00, i * step, (j + 1) * step, i * step, j * step);

        if (pts.length >= 4) {
          ctx.moveTo(pts[0]!, pts[1]!);
          ctx.lineTo(pts[2]!, pts[3]!);
        }
        if (pts.length === 8) {
          ctx.moveTo(pts[4]!, pts[5]!);
          ctx.lineTo(pts[6]!, pts[7]!);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** 命中检测：返回最近的可见曲线下标，找不到返回 -1。 */
  pickCurve(curves: CurveSpec[], sx: number, sy: number, t: number): number {
    let best = -1;
    let bestDist = 14;
    const worldX = this.screenToWorld(sx, 0).x;
    const scope: Scope = { x: 0, y: 0, th: 0, t, a: 0, b: 0 };

    curves.forEach((curve, index) => {
      if (!curve.visible || !curve.compiled || curve.mode === 'implicit') return;

      if (curve.mode === 'explicit') {
        scope.a = curve.a;
        scope.b = curve.b;
        scope.x = worldX - this.xShift(curve);
        const value = curve.compiled.fn(scope);
        if (!Number.isFinite(value)) return;
        const p = this.worldToScreen(worldX, value + this.yShift(curve));
        const dist = Math.abs(p.y - sy);
        if (dist < bestDist) {
          bestDist = dist;
          best = index;
        }
        return;
      }

      const points = curve.mode === 'parametric'
        ? this.parametricPoints(curve, t)
        : this.polarPoints(curve, t);

      for (const point of points) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
        const p = this.worldToScreen(point.x, point.y);
        const dist = Math.hypot(p.x - sx, p.y - sy);
        if (dist < bestDist) {
          bestDist = dist;
          best = index;
        }
      }
    });

    return best;
  }

  private drawActive(curves: CurveSpec[], opts: PlotOptions): void {
    const active = opts.active!;
    const curve = curves[active.index];
    if (!curve) return;
    const { ctx } = this.surface;
    ctx.save();
    ctx.font = font.monoSmall;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = curve.color;
    ctx.fillText(
      `拖动中 · a=${formatSigned(active.a, 2)}  b=${formatSigned(active.b, 2)}`,
      this.surface.width - 14,
      14,
    );
    ctx.restore();
  }

  // ---------- 网格与坐标轴 ----------

  private drawGrid(step: number): void {
    const { ctx, width: W, height: H } = this.surface;
    const left = this.screenToWorld(0, 0).x;
    const right = this.screenToWorld(W, 0).x;
    const top = this.screenToWorld(0, 0).y;
    const bottom = this.screenToWorld(0, H).y;

    ctx.lineWidth = 1;
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

    if (axisX > 10 && axisX < W - 10 && axisY > 10 && axisY < H - 10) {
      ctx.fillStyle = theme.textDim;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('0', axisX - 6, axisY + 5);
    }
  }

  // ---------- 切线 / 积分 / 悬停 ----------

  private drawIntegral(curves: CurveSpec[], opts: PlotOptions): void {
    const a = Math.min(opts.integralA, opts.integralB);
    const b = Math.max(opts.integralA, opts.integralB);
    const curve = curves.find((c) => c.visible && c.compiled && c.mode === 'explicit');
    if (!curve || b - a < 1e-9) return;

    const { ctx, height: H } = this.surface;
    const scope: Scope = { x: 0, t: opts.t, a: curve.a, b: curve.b };
    const xShift = this.xShift(curve);
    const yShift = this.yShift(curve);
    const baseline = clamp(this.worldToScreen(0, 0).y, 0, H);

    const evalAt = (x: number): number => {
      scope.x = x - xShift;
      return curve.compiled!.fn(scope) + yShift;
    };

    ctx.save();
    ctx.beginPath();
    const x0 = this.worldToScreen(a, 0).x;
    let started = false;
    for (let i = 0; i <= 260; i++) {
      const x = a + ((b - a) * i) / 260;
      const y = evalAt(x);
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
    if (!started) {
      ctx.restore();
      return;
    }
    ctx.lineTo(this.worldToScreen(b, 0).x, baseline);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(curve.color, 0.14);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(curve.color, 0.55);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const edge of [a, b]) {
      const y = evalAt(edge);
      if (!Number.isFinite(y)) continue;
      const p = this.worldToScreen(edge, y);
      ctx.beginPath();
      ctx.moveTo(p.x, baseline);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const n = 400;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const y = evalAt(x);
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
    ctx.fillText(
      `∫ ${a}→${b} ≈ ${formatSigned(area)}`,
      clamp(x0 + 8, 8, this.surface.width - 150),
      clamp(this.worldToScreen(0, 0).y - 12, 22, H - 8),
    );
    ctx.restore();
  }

  private drawTangent(curves: CurveSpec[], opts: PlotOptions): void {
    const curve = curves.find((c) => c.visible && c.compiled && c.mode === 'explicit');
    if (!curve) return;
    const { ctx, width: W } = this.surface;
    const scope: Scope = { x: 0, t: opts.t, a: curve.a, b: curve.b };
    const xShift = this.xShift(curve);
    const yShift = this.yShift(curve);
    const x0 = opts.tangentX;
    const evalAt = (x: number): number => {
      scope.x = x - xShift;
      return curve.compiled!.fn(scope) + yShift;
    };

    const y0 = evalAt(x0);
    if (!Number.isFinite(y0)) return;

    const h = Math.max(1e-5, Math.abs(x0) * 1e-5);
    const slope = (evalAt(x0 + h) - evalAt(x0 - h)) / (2 * h);
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
    const scope: Scope = { x: 0, t: opts.t, a: 0, b: 0 };

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
      if (!curve.visible || !curve.compiled || curve.mode !== 'explicit') continue;
      scope.a = curve.a;
      scope.b = curve.b;
      scope.x = world.x - this.xShift(curve);
      const value = curve.compiled.fn(scope);
      if (!Number.isFinite(value)) continue;
      const y = value + this.yShift(curve);
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
    const boxW = 152;
    const boxH = lines.length * lineH + 12;
    const bx = clamp(hover.x + 16, 8, W - boxW - 8);
    const by = clamp(hover.y + 16, 8, H - boxH - 8);
    ctx.fillStyle = 'rgba(11,14,20,0.92)';
    ctx.strokeStyle = theme.borderStrong;
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

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

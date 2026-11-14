import { theme, font } from './theme';

/**
 * 一层对 canvas 的薄封装：负责 DPR、尺寸、清屏。
 * 所有绘制都在 CSS 像素坐标系里进行。
 */
export class Surface {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法获取 2D 绘图上下文');
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /** 按容器尺寸与设备像素比重设画布，返回尺寸是否发生变化。 */
  resize(): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const changed =
      w !== this.width || h !== this.height || dpr !== this.dpr ||
      this.canvas.width !== Math.floor(w * dpr) ||
      this.canvas.height !== Math.floor(h * dpr);
    if (!changed) return false;

    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  clear(fill: string = theme.bg): void {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /** 常用的小字提示，画在画布左下角。 */
  hint(text: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.font = font.monoSmall;
    ctx.fillStyle = theme.textFaint;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, 12, this.height - 10);
    ctx.restore();
  }
}

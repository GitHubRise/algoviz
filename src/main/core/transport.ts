/**
 * 共用的"时间轴"。
 *
 * 设计要点：函数可视化与算法可视化的共性不是画布，而是**归一化进度**。
 * 两个模块都只暴露 `render(progress: number)`，由 Transport 统一驱动播放、
 * 暂停、单步、倍速与拖拽。这样新增任何可视化类型都不用碰播放器代码。
 */
export class Transport {
  private _progress = 0;
  private _playing = false;
  private _speed = 1;
  private _durationMs = 4000;
  private _loop = true;
  private _stepSize = 0.02;
  private listeners = new Set<(progress: number, playing: boolean) => void>();

  get progress(): number {
    return this._progress;
  }
  get playing(): boolean {
    return this._playing;
  }
  get speed(): number {
    return this._speed;
  }
  get durationMs(): number {
    return this._durationMs;
  }
  get loop(): boolean {
    return this._loop;
  }
  get stepSize(): number {
    return this._stepSize;
  }

  configure(opts: { durationMs?: number; loop?: boolean; stepSize?: number }): void {
    if (opts.durationMs !== undefined) this._durationMs = Math.max(120, opts.durationMs);
    if (opts.loop !== undefined) this._loop = opts.loop;
    if (opts.stepSize !== undefined) this._stepSize = opts.stepSize;
    this.emit();
  }

  setSpeed(v: number): void {
    this._speed = Math.min(8, Math.max(0.125, v));
    this.emit();
  }

  subscribe(fn: (progress: number, playing: boolean) => void): () => void {
    this.listeners.add(fn);
    fn(this._progress, this._playing);
    return () => this.listeners.delete(fn);
  }

  play(): void {
    // 播完停住的场景下再点播放，从头开始，符合直觉
    if (!this._loop && this._progress >= 0.9999) this._progress = 0;
    this._playing = true;
    this.emit();
  }

  pause(): void {
    this._playing = false;
    this.emit();
  }

  toggle(): void {
    if (this._playing) this.pause();
    else this.play();
  }

  seek(p: number): void {
    this._progress = clamp01(p);
    this.emit();
  }

  /** 以归一化进度为单位单步，会暂停播放。 */
  stepBy(delta: number): void {
    this._playing = false;
    this.seek(this._progress + delta * this._stepSize);
  }

  /** 每帧调用；dtMs 为真实经过毫秒。返回进度是否变化。 */
  update(dtMs: number): boolean {
    if (!this._playing) return false;
    const before = this._progress;
    const advance = (dtMs / this._durationMs) * this._speed;
    let next = this._progress + advance;

    if (next >= 1) {
      if (this._loop) {
        next = next % 1;
      } else {
        next = 1;
        this._playing = false;
      }
    }
    this._progress = next;
    this.emit();
    return this._progress !== before;
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this._progress, this._playing);
  }
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

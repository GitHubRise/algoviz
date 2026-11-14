import type { Transport } from '../core/transport';

export interface VizModule {
  readonly id: string;
  readonly label: string;
  /** 侧栏控件容器 */
  readonly panel: HTMLElement;
  /** 画布容器（绝对定位铺满 stage） */
  readonly stage: HTMLElement;
  /** 切入本模块：配置 transport、重置进度 */
  activate(): void;
  deactivate(): void;
  render(progress: number): void;
  resize(): void;
}

export interface ModuleContext {
  transport: Transport;
  /** 交互导致的需要重绘（transport 播放时不必手动调用） */
  invalidate(): void;
}

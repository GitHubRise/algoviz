import { el } from './core/dom';
import { Transport } from './core/transport';
import { createTransportBar } from './ui/controls';
import type { VizModule } from './ui/module';
import { FunctionsModule } from './modules/functions/module';
import { SortingModule } from './modules/sorting/module';
import { PathfindingModule } from './modules/pathfinding/module';

/**
 * 应用外壳：顶栏 + 侧栏 + 画布 + 播放器。
 *
 * 三个模块共用同一个 Transport —— 这是整个项目的核心抽象：
 * 模块只负责 (progress: number) => void 的绘制，播放/单步/拖拽逻辑只有一份。
 */
export function createApp(root: HTMLElement): void {
  const transport = new Transport();
  let dirty = true;
  const invalidate = (): void => {
    dirty = true;
  };

  const modules: VizModule[] = [
    new FunctionsModule({ transport, invalidate }),
    new SortingModule({ transport, invalidate }),
    new PathfindingModule({ transport, invalidate }),
  ];

  const tabs = el('nav', { class: 'tabs', role: 'tablist', 'aria-label': '可视化模块' });
  const sidebar = el('aside', { class: 'sidebar' });
  const stageHost = el('main', { class: 'stage' });

  const buttons = modules.map((mod, index) => {
    const btn = el('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      id: `tab-${mod.id}`,
      'aria-controls': `panel-${mod.id}`,
      text: mod.label,
      onclick: () => select(index),
    });
    tabs.append(btn);

    mod.panel.hidden = index !== 0;
    mod.stage.hidden = index !== 0;
    mod.panel.id = `panel-${mod.id}`;
    mod.panel.setAttribute('role', 'tabpanel');
    mod.panel.setAttribute('aria-labelledby', `tab-${mod.id}`);
    sidebar.append(mod.panel);
    stageHost.append(mod.stage);
    return btn;
  });

  const { el: transportBar } = createTransportBar(transport);

  root.append(
    el(
      'div',
      { class: 'shell' },
      el(
        'header',
        { class: 'topbar' },
        el(
          'div',
          { class: 'brand' },
          el('strong', { html: 'Algo<em>Viz</em>' }),
          el('span', { text: '函数与算法的可视化实验室' }),
        ),
        tabs,
        el('div', { class: 'spacer' }),
        el('div', {
          class: 'kbd-tip',
          html: '<kbd>空格</kbd> 播放 · <kbd>←</kbd><kbd>→</kbd> 单步',
        }),
      ),
      el('div', { class: 'workspace' }, sidebar, stageHost),
      transportBar,
    ),
  );

  let activeIndex = 0;

  function select(index: number): void {
    if (index === activeIndex) return;
    modules[activeIndex]!.deactivate();
    modules[activeIndex]!.panel.hidden = true;
    modules[activeIndex]!.stage.hidden = true;
    activeIndex = index;
    const mod = modules[activeIndex]!;
    mod.panel.hidden = false;
    mod.stage.hidden = false;
    mod.activate();
    dirty = true;
    buttons.forEach((btn, i) => btn.setAttribute('aria-selected', String(i === activeIndex)));
  }

  buttons.forEach((btn, i) => btn.setAttribute('aria-selected', String(i === activeIndex)));
  modules[0]!.activate();

  window.addEventListener('keydown', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      transport.toggle();
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      transport.stepBy(-1);
    } else if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      transport.stepBy(1);
    }
  });

  const observer = new ResizeObserver(() => {
    modules[activeIndex]!.resize();
    dirty = true;
  });
  observer.observe(stageHost);

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(64, now - last);
    last = now;
    const moved = transport.update(dt);
    if (!document.hidden && (moved || dirty)) {
      dirty = false;
      modules[activeIndex]!.render(transport.progress);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

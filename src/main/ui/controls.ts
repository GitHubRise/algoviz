import { el } from '../core/dom';
import type { Transport } from '../core/transport';

/** 侧栏区块 */
let autoId = 0;

function ensureId(control: HTMLElement): string {
  if (!control.id) control.id = `ctl-${++autoId}`;
  return control.id;
}

export function section(title: string, ...children: HTMLElement[]): HTMLElement {
  return el('div', { class: 'section' }, el('h3', { text: title }), ...children);
}

/** 单行控件（label + 控件 + 可选提示），label 与控件通过 for/id 关联 */
export function field(labelText: string, control: HTMLElement, hint?: string): HTMLElement {
  const label = el('label', { text: labelText });
  label.htmlFor = ensureId(control);
  return el(
    'div',
    { class: 'field' },
    label,
    control,
    hint ? el('p', { class: 'note-text', text: hint }) : null,
  );
}

export function button(
  label: string,
  onClick: () => void,
  opts: { primary?: boolean; title?: string } = {},
): HTMLButtonElement {
  const node = el('button', {
    class: opts.primary ? 'btn primary' : 'btn',
    type: 'button',
    text: label,
    title: opts.title ?? label,
    onclick: onClick,
  });
  return node;
}

export function toggle(
  labelText: string,
  checked: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  const label = el('label', { class: 'toggle' }, input, el('span', { text: labelText }));
  return label;
}

export interface SliderHandle {
  el: HTMLElement;
  input: HTMLInputElement;
  set(value: number): void;
}

export function slider(
  labelText: string,
  opts: {
    min: number;
    max: number;
    step: number;
    value: number;
    format?: (v: number) => string;
    onInput: (v: number) => void;
  },
): SliderHandle {
  const format = opts.format ?? ((v: number) => String(Math.round(v)));
  const input = el('input', {
    type: 'range',
    min: String(opts.min),
    max: String(opts.max),
    step: String(opts.step),
    value: String(opts.value),
  });
  const valueEl = el('span', { class: 'range-value', text: format(opts.value) });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    valueEl.textContent = format(v);
    opts.onInput(v);
  });
  const label = el('label', {}, el('span', { text: labelText }), valueEl);
  label.htmlFor = ensureId(input);
  const el_ = el('div', { class: 'field' }, label, input);
  return {
    el: el_,
    input,
    set(value: number) {
      input.value = String(value);
      valueEl.textContent = format(value);
    },
  };
}

export interface StatsHandle {
  el: HTMLElement;
  set(values: string[]): void;
}

export function createStats(labels: string[]): StatsHandle {
  const valueEls: HTMLElement[] = [];
  const blocks = labels.map((label) => {
    const value = el('b', { text: '—' });
    valueEls.push(value);
    return el('div', { class: 'stat' }, value, el('span', { text: label }));
  });
  return {
    el: el('div', { class: 'stats' }, ...blocks),
    set(values: string[]) {
      values.forEach((v, i) => {
        const target = valueEls[i];
        if (target) target.textContent = v;
      });
    },
  };
}

/** 播放器：进度条、播放/暂停、单步、倍速、导出 PNG */
export function createTransportBar(
  t: Transport,
  opts: { onExport?: () => void } = {},
): { el: HTMLElement; sync(): void } {
  const playBtn = el('button', { class: 'play', type: 'button', title: '播放 / 暂停（空格）', text: '▶' });
  const backBtn = el('button', { type: 'button', title: '单步后退（←）', text: '‹' });
  const fwdBtn = el('button', { type: 'button', title: '单步前进（→）', text: '›' });
  const resetBtn = el('button', { type: 'button', title: '回到起点', text: '↺' });
  const exportBtn = el('button', { type: 'button', title: '导出当前画布为 PNG', text: '⤓' });

  const range = el('input', {
    class: 'scrub',
    type: 'range',
    id: 'transport-progress',
    min: '0',
    max: '1000',
    step: '1',
    value: '0',
    'aria-label': '播放进度',
  });
  const rangeLabel = el('label', { class: 'sr-only', text: '播放进度' });
  rangeLabel.htmlFor = 'transport-progress';

  const speed = el('select', { title: '播放倍速', id: 'transport-speed', 'aria-label': '播放倍速' });
  const speedLabel = el('label', { class: 'sr-only', text: '播放倍速' });
  speedLabel.htmlFor = 'transport-speed';
  for (const v of ['0.25', '0.5', '1', '2', '4']) {
    speed.append(el('option', { value: v, text: `${v}×` }));
  }
  speed.value = '1';

  const readout = el('div', { class: 'readout', text: '0% · 1.00×' });

  playBtn.addEventListener('click', () => t.toggle());
  backBtn.addEventListener('click', () => t.stepBy(-1));
  fwdBtn.addEventListener('click', () => t.stepBy(1));
  resetBtn.addEventListener('click', () => {
    t.pause();
    t.seek(0);
  });
  exportBtn.addEventListener('click', () => opts.onExport?.());

  let dragging = false;
  range.addEventListener('pointerdown', () => {
    dragging = true;
  });
  range.addEventListener('pointerup', () => {
    dragging = false;
  });
  range.addEventListener('input', () => {
    t.seek(Number(range.value) / 1000);
  });
  speed.addEventListener('change', () => t.setSpeed(Number(speed.value)));

  const bar = el(
    'footer',
    { class: 'transport' },
    el('div', { class: 'group' }, resetBtn, backBtn, playBtn, fwdBtn),
    rangeLabel,
    range,
    speedLabel,
    speed,
    exportBtn,
    readout,
  );

  function sync(): void {
    playBtn.textContent = t.playing ? '❚❚' : '▶';
    if (!dragging) range.value = String(Math.round(t.progress * 1000));
    readout.textContent = `${Math.round(t.progress * 100)}% · ${t.speed.toFixed(2)}×`;
  }

  t.subscribe(sync);
  sync();
  return { el: bar, sync };
}

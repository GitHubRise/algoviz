/** 全局视觉与配色。集中放置，避免各模块各写一套颜色。 */
export const theme = {
  bg: '#0b0e14',
  panel: '#111621',
  panelAlt: '#0f141d',
  border: '#1e2735',
  borderStrong: '#2b3850',
  text: '#e6edf7',
  textDim: '#8b98ad',
  textFaint: '#7f8b9d',
  accent: '#4cc9f0',
  accentSoft: 'rgba(76, 201, 240, 0.14)',

  grid: 'rgba(255,255,255,0.045)',
  gridMajor: 'rgba(255,255,255,0.09)',
  axis: 'rgba(230,237,247,0.42)',

  curve: ['#4cc9f0', '#f72585', '#ffd166', '#7dff9b'],
  danger: '#ff6b6b',
  compare: '#ffd166',
  swap: '#ff6b6b',
  pivot: '#c77dff',
  sorted: '#4ade80',
  cursor: '#4cc9f0',

  wall: '#33415c',
  frontier: '#3d7ea6',
  visited: '#22374d',
  path: '#ffd166',
  start: '#4ade80',
  goal: '#ff6b6b',
} as const;

export const font = {
  mono: '13px "JetBrains Mono", "Cascadia Code", Consolas, monospace',
  monoSmall: '11px "JetBrains Mono", "Cascadia Code", Consolas, monospace',
  sans: '13px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
} as const;

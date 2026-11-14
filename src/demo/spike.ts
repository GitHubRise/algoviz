/**
 * Spike：在正式打磨之前，用最短路径确认三个高风险假设。
 *
 * 运行：pnpm spike
 * 产物：控制台结论；结论抄进 memory/ 条目，代码本身可丢弃。
 *
 * 验证项
 *  1. 手写 Pratt 解析器的优先级是否真的对（隐式乘法、幂右结合、一元负号）；
 *  2. 帧录制在最大规模下是否可承受（n=72，冒泡最坏情况）；
 *  3. 三个模块共用「归一化进度」这一抽象是否成立（此处只验数据形状）。
 */

import { compileSource } from '../main/math/evaluate';
import { ROLE, runSort } from '../main/modules/sorting/algorithms';

interface Check {
  expr: string;
  scope: Record<string, number>;
  expected: number;
  got: number;
  pass: boolean;
}

const cases: Array<[string, Record<string, number>, number]> = [
  ['1+2*3', {}, 7],
  ['2^3^2', {}, 512],
  ['-2^2', {}, -4],
  ['4-2-1', {}, 1],
  ['2x', { x: 3 }, 6],
  ['sin(x)cos(x)', { x: 0 }, 0],
  ['2pi', {}, Math.PI * 2],
  ['clamp(5, 0, 3)', {}, 3],
  ['exp(-0.15x)sin(3x)', { x: 0 }, 0],
];

const checks: Check[] = cases.map(([expr, scope, expected]) => {
  const got = compileSource(expr).fn(scope);
  return { expr, scope, expected, got, pass: Math.abs(got - expected) < 1e-9 };
});

console.log('== 1. 表达式解析 ==');
for (const c of checks) {
  console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.expr.padEnd(22)} → ${c.got}`);
}

function frameBytes(n: number, frames: number): number {
  // values: number[] (8B/个) + roles: Uint8Array (1B/个) + 其余字段按 40B 估
  return frames * (n * 8 + n + 40);
}

console.log('\n== 2. 帧录制规模（n=72 最坏情况）==');
const N = 72;
const input = Array.from({ length: N }, (_, i) => N - i);
const results = (['bubble', 'insertion', 'selection', 'merge', 'quick'] as const).map((kind) => {
  const t0 = performance.now();
  const trace = runSort(kind, input);
  const ms = performance.now() - t0;
  const bytes = frameBytes(N, trace.frames.length);
  console.log(
    `  ${kind.padEnd(10)} 帧=${String(trace.frames.length).padStart(4)}  ` +
      `比较=${String(trace.comparisons).padStart(4)}  估算=${(bytes / 1024 / 1024).toFixed(2)} MB  ` +
      `耗时=${ms.toFixed(1)} ms`,
  );
  return { kind, trace, bytes, ms };
});

const maxFrames = Math.max(...results.map((r) => r.trace.frames.length));
const maxBytes = Math.max(...results.map((r) => r.bytes));

console.log('\n== 3. 共用抽象 ==');
const roleOk = results.every((r) =>
  r.trace.frames.every((f) => Array.from(f.roles).every((v) => v >= 0 && v <= 5)),
);
console.log(`  角色码域 0..${Object.keys(ROLE).length - 1}: ${roleOk ? 'PASS' : 'FAIL'}`);
console.log(`  帧序列长度一致: ${results.every((r) => r.trace.frames.every((f) => f.values.length === N)) ? 'PASS' : 'FAIL'}`);

const allPass = checks.every((c) => c.pass) && roleOk;
console.log('\n== 结论 ==');
console.log(`  解析器：${checks.filter((c) => c.pass).length}/${checks.length} 通过`);
console.log(`  最大帧数 ${maxFrames}，估算内存 ${(maxBytes / 1024 / 1024).toFixed(2)} MB（≤ 8 MB 视为可承受）`);
const viable = allPass && maxBytes < 8 * 1024 * 1024;
console.log(`  总体：${viable ? '可行 —— 不需要换技术路线' : '需要调整（降 n 或改增量帧）'}`);

if (!viable) throw new Error('spike 未通过：见上方结论');

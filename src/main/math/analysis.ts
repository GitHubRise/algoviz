/**
 * 曲线分析：零点与极值。
 *
 * 纯函数，不依赖画布——渲染层拿结果去画标记，测试直接调这里。
 * 采样 + 二分（零点）+ 抛物插值（极值），精度足够画图，不追求符号求解。
 */

export interface PointMark {
  x: number;
  y: number;
  kind: 'root' | 'max' | 'min';
}

const DEFAULTS = { samples: 400, bisect: 60 };

/** 区间内所有零点（符号变化处二分收敛）。 */
export function findRoots(
  fn: (x: number) => number,
  xmin: number,
  xmax: number,
  samples: number = DEFAULTS.samples,
): PointMark[] {
  if (!(xmax > xmin) && !(xmax < xmin)) return [];

  const lo = Math.min(xmin, xmax);
  const hi = Math.max(xmin, xmax);
  const n = Math.max(8, Math.floor(samples));
  const h = (hi - lo) / n;

  const marks: PointMark[] = [];
  let prevX = lo;
  let prevY = fn(lo);

  const push = (x: number): void => {
    const y = fn(x);
    if (!Number.isFinite(y)) return;
    marks.push({ x, y, kind: 'root' });
  };

  for (let i = 1; i <= n; i++) {
    const x = lo + i * h;
    const y = fn(x);

    if (Number.isFinite(prevY) && Number.isFinite(y)) {
      if (prevY === 0) {
        push(prevX);
      } else if ((prevY < 0) !== (y < 0)) {
        let a = prevX;
        let b = x;
        let fa = prevY;
        for (let k = 0; k < DEFAULTS.bisect; k++) {
          const mid = (a + b) / 2;
          const fm = fn(mid);
          if (!Number.isFinite(fm)) break;
          if ((fa < 0) !== (fm < 0)) {
            b = mid;
          } else {
            a = mid;
            fa = fm;
          }
        }
        push((a + b) / 2);
      }
    }

    prevX = x;
    prevY = y;
  }

  if (prevY === 0) push(prevX);

  // 相邻两格内的重复解合并（重根或采样点恰好落在零点上会重复）
  const merged: PointMark[] = [];
  for (const mark of marks) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(mark.x - last.x) < h * 0.5) continue;
    merged.push(mark);
  }
  return merged;
}

/** 区间内的局部极值（三点比较 + 抛物插值细化）。 */
export function findExtrema(
  fn: (x: number) => number,
  xmin: number,
  xmax: number,
  samples: number = DEFAULTS.samples,
): PointMark[] {
  if (!(xmax > xmin) && !(xmax < xmin)) return [];

  const lo = Math.min(xmin, xmax);
  const hi = Math.max(xmin, xmax);
  const n = Math.max(8, Math.floor(samples));
  const h = (hi - lo) / n;

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = lo + i * h;
    xs.push(x);
    ys.push(fn(x));
  }

  const marks: PointMark[] = [];
  for (let i = 1; i < n; i++) {
    const yp = ys[i - 1]!;
    const y = ys[i]!;
    const yn = ys[i + 1]!;
    if (!Number.isFinite(yp) || !Number.isFinite(y) || !Number.isFinite(yn)) continue;

    const isMax = y > yp && y > yn;
    const isMin = y < yp && y < yn;
    if (!isMax && !isMin) continue;

    const denom = yp - 2 * y + yn;
    let x = xs[i]!;
    if (Math.abs(denom) > 1e-12) {
      const offset = (0.5 * (yp - yn)) / denom; // 以 h 为单位
      if (Math.abs(offset) <= 1) x += offset * h;
    }
    const refined = fn(x);
    marks.push({ x, y: Number.isFinite(refined) ? refined : y, kind: isMax ? 'max' : 'min' });
  }
  return marks;
}

/**
 * 三维投影的纯数学部分：相机、投影、法线、着色。
 *
 * 只有正交投影——曲面可视化不需要近大远小，正交更好量、也更稳。
 * 不引用画布，渲染层拿 projectPoint 的结果自己画。
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Camera {
  /** 绕 z 轴的方位角（弧度） */
  yaw: number;
  /** 仰角：0 = 平视，π/2 = 俯视 */
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** 归一化坐标 → 像素的基准比例 */
  scale: number;
}

export interface Projected {
  x: number;
  y: number;
  /** 越大越远，画家算法按它降序绘制 */
  depth: number;
}

/** 单位相机（yaw=0, pitch=0）；渲染层自己加默认角度。 */
export function createCamera(): Camera {
  return { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };
}

export function projectPoint(p: Vec3, cam: Camera, view: Viewport): Projected {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const X = p.x * cy - p.y * sy;
  const Y = p.x * sy + p.y * cy;

  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  // 屏幕向上分量与视线深度
  const up = Y * sp + p.z * cp;
  const depth = Y * cp - p.z * sp;

  const k = view.scale * cam.zoom;
  return {
    x: view.width / 2 + cam.panX + X * k,
    y: view.height / 2 + cam.panY - up * k,
    depth,
  };
}

/**
 * 归一化：x、y 各自缩放到 [-1,1]；z 单独缩放并压到 ±0.7。
 *
 * 三轴用同一个比例会把 `x²+y²` 这类「高度远大于水平跨度」的曲面压成一根针，
 * 所以 z 必须独立缩放——这也是绝大多数曲面图的做法。
 */
export function normalizePoints(points: Vec3[]): { points: Vec3[]; center: Vec3; span: number } {
  if (points.length === 0) return { points: [], center: { x: 0, y: 0, z: 0 }, span: 1 };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }

  if (!Number.isFinite(minX)) return { points: [], center: { x: 0, y: 0, z: 0 }, span: 1 };

  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const spanZ = maxZ - minZ;
  const flatZ = !(spanZ > 1e-9);
  const span = Math.max(spanX, spanY);

  return {
    points: points.map((p) => ({
      x: ((p.x - center.x) / spanX) * 2,
      y: ((p.y - center.y) / spanY) * 2,
      z: flatZ ? 0 : ((p.z - center.z) / (spanZ / 2)) * 0.7,
    })),
    center,
    span,
  };
}

/** 三角形法线（单位化）；退化三角形返回朝上。 */
export function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;

  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;

  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return { x: 0, y: 0, z: 1 };
  nx /= len;
  ny /= len;
  nz /= len;
  return { x: nx, y: ny, z: nz };
}

/** 兰伯特着色：0.35 环境光 + 0.65 漫反射。 */
export function shade(normal: Vec3, light: Vec3): number {
  const dot = normal.x * light.x + normal.y * light.y + normal.z * light.z;
  return 0.35 + 0.65 * Math.max(0, Math.min(1, dot));
}

/** 拖动：水平改方位角，垂直改仰角（限 5°..85°）。 */
export function orbit(cam: Camera, dxPx: number, dyPx: number): void {
  cam.yaw += dxPx * 0.01;
  cam.pitch = Math.max(0.08, Math.min(1.48, cam.pitch + dyPx * 0.01));
}

/**
 * 从顶点网格里抽出一条水平集的线段（marching squares）。
 *
 * `values` 是 (cols+1)×(rows+1) 的顶点值，行优先；返回的线段端点用**格子坐标**
 * （0..cols / 0..rows 的浮点索引），由调用方负责映射到世界坐标。
 * 四条边都穿越时（鞍点）按 0-1、2-3 配对成两段。
 */
export function contourSegments(
  values: Float32Array,
  cols: number,
  rows: number,
  level: number,
): Array<[number, number, number, number]> {
  const stride = cols + 1;
  const out: Array<[number, number, number, number]> = [];
  if (cols < 1 || rows < 1) return out;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v00 = values[j * stride + i]! - level;
      const v10 = values[j * stride + i + 1]! - level;
      const v11 = values[(j + 1) * stride + i + 1]! - level;
      const v01 = values[(j + 1) * stride + i]! - level;
      if (
        !Number.isFinite(v00) || !Number.isFinite(v10) ||
        !Number.isFinite(v11) || !Number.isFinite(v01)
      ) {
        continue;
      }

      const pts: number[] = [];
      const cross = (a: number, b: number, x1: number, y1: number, x2: number, y2: number): void => {
        if ((a >= 0) === (b >= 0)) return;
        const t = a / (a - b);
        pts.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      };

      cross(v00, v10, i, j, i + 1, j);
      cross(v10, v11, i + 1, j, i + 1, j + 1);
      cross(v11, v01, i + 1, j + 1, i, j + 1);
      cross(v01, v00, i, j + 1, i, j);

      if (pts.length >= 4) out.push([pts[0]!, pts[1]!, pts[2]!, pts[3]!]);
      if (pts.length === 8) out.push([pts[4]!, pts[5]!, pts[6]!, pts[7]!]);
    }
  }
  return out;
}

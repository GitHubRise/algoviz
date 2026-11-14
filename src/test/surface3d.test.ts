import { describe, expect, it } from 'vitest';
import {
  createCamera,
  faceNormal,
  normalizePoints,
  projectPoint,
  shade,
} from '../main/modules/functions/surface3d';

const view = { width: 800, height: 600, scale: 100 };

describe('三维投影', () => {
  it('T-3D01 x 轴单位点投到右侧', () => {
    const p = projectPoint({ x: 1, y: 0, z: 0 }, createCamera(), view);
    expect(p.x).toBeCloseTo(500, 6);
    expect(p.y).toBeCloseTo(300, 6);
    expect(p.depth).toBeCloseTo(0, 6);
  });

  it('T-3D02 y 轴单位点更远', () => {
    const p = projectPoint({ x: 0, y: 1, z: 0 }, createCamera(), view);
    expect(p.x).toBeCloseTo(400, 6);
    expect(p.depth).toBeCloseTo(1, 6);
  });

  it('T-3D03 高度映射到屏幕上方', () => {
    const p = projectPoint({ x: 0, y: 0, z: 1 }, createCamera(), view);
    expect(p.y).toBeCloseTo(200, 6);
  });

  it('T-3D04 绕竖轴转 90° 后 +x 转到 +y 方向', () => {
    const cam = { ...createCamera(), yaw: Math.PI / 2 };
    const p = projectPoint({ x: 1, y: 0, z: 0 }, cam, view);
    expect(p.x).toBeCloseTo(400, 6);
    expect(p.depth).toBeCloseTo(1, 6);
  });

  it('T-3D05 平面法线朝上', () => {
    const n = faceNormal({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(Math.abs(n.z)).toBeCloseTo(1, 6);
    expect(n.x).toBeCloseTo(0, 6);
    expect(n.y).toBeCloseTo(0, 6);
  });

  it('T-3D06 正对光源时最亮', () => {
    expect(shade({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(1, 6);
  });

  it('T-3D07 背光时保留环境光', () => {
    expect(shade({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 })).toBeCloseTo(0.35, 6);
  });

  it('T-3D08 归一化后落在 [-1,1]', () => {
    const points = Array.from({ length: 9 }, (_, i) => ({ x: i * 0.5, y: 0, z: 0 }));
    const { points: normalized } = normalizePoints(points);
    const xs = normalized.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(-1, 6);
    expect(Math.max(...xs)).toBeCloseTo(1, 6);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(mid).toBeCloseTo(0, 6);
  });

  it('T-3D09 高度独立缩放，不会把水平跨度压扁', () => {
    const points = Array.from({ length: 9 }, (_, i) => ({ x: i * 0.5, y: 0, z: i * 12.5 }));
    const { points: normalized } = normalizePoints(points);
    const xs = normalized.map((p) => p.x);
    const zs = normalized.map((p) => p.z);
    expect(Math.max(...xs)).toBeCloseTo(1, 6);
    expect(Math.max(...zs)).toBeCloseTo(0.7, 6);
    expect(Math.min(...zs)).toBeCloseTo(-0.7, 6);
  });
});

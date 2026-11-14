/** 把界面状态编码进 URL hash，便于分享同一个图形。 */

export function encodeShare(state: unknown): string {
  try {
    return encodeURIComponent(JSON.stringify(state));
  } catch {
    return '';
  }
}

/**
 * 解码 hash 里的状态。
 * 任何异常（非法百分号编码、非 JSON、不是对象）一律返回 null——分享链接坏了不能把页面搞崩。
 */
export function decodeShare<T = unknown>(encoded: string): T | null {
  if (!encoded) return null;
  try {
    const text = decodeURIComponent(encoded);
    if (!text) return null;
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as T;
  } catch {
    return null;
  }
}

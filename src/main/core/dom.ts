/** 极简 DOM 构造器，避免为这点界面引入框架。 */

type PropValue = string | number | boolean | ((ev: Event) => void) | Record<string, string> | undefined | null;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, PropValue> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key === 'style' && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) node.style.setProperty(k, String(v));
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (typeof value === 'object') {
      Object.assign(node, value);
    } else if (typeof value === 'boolean') {
      if (value) node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

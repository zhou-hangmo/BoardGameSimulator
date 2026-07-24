// ============================================================
// BoardGameSimulator — DOM 工具函数
// ============================================================

/** 创建元素并设置属性/样式/事件 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  children?: (string | Node)[],
): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'style' && typeof v === 'string') {
        (elem.style as any).cssText = v;
      } else if (k.startsWith('on') && typeof v === 'string') {
        // skip inline event strings
      } else {
        elem.setAttribute(k, v);
      }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') {
        elem.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        elem.appendChild(child);
      }
    }
  }
  return elem;
}

/** 设置 style 属性 */
export function css(el: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
  for (const [k, v] of Object.entries(styles)) {
    if (v !== undefined) {
      (el.style as any)[k] = String(v);
    }
  }
}

/** 安全的 querySelector（带类型） */
export function qs<T extends Element>(selector: string, parent: ParentNode = document): T {
  const result = parent.querySelector(selector);
  if (!result) {
    throw new Error(`Element not found: ${selector}`);
  }
  return result as T;
}

/** 可选的安全 querySelector */
export function qso<T extends Element>(selector: string, parent: ParentNode = document): T | null {
  return parent.querySelector(selector) as T | null;
}

/** 清理容器内所有子元素 */
export function clear(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

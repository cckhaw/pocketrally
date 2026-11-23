type Child = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | number | ((e: Event) => void)> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function')
      el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener)
    else if (v === true) el.setAttribute(k, '')
    else if (v !== false) el.setAttribute(k, String(v))
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    el.append(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return el
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

export function stars(n: number, total = 3): string {
  return '★'.repeat(n) + '☆'.repeat(total - n)
}

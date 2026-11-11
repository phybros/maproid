import { svgIcon } from './icons';

type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k in el && k !== 'list') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Icon button with tooltip. */
export function iconBtn(d: string, title: string, onclick: () => void, extra: Props = {}, label?: string) {
  return h('button', { class: 'btn icon' + (label ? ' with-label' : '') + (extra.class ? ' ' + extra.class : ''), title, 'aria-label': title, onclick, ...omit(extra, 'class') },
    svgIcon(d), label ? h('span', {}, label) : null);
}

function omit(o: Props, k: string) {
  const r = { ...o };
  delete r[k];
  return r;
}

let toastTimer = 0;
export function toast(msg: string, kind: 'info' | 'error' = 'info') {
  let el = document.getElementById('toast');
  if (!el) { el = h('div', { id: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = msg;
  el.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { el!.className = ''; }, 3200);
}

export function modal(title: string, body: Node, actions: Node[] = []): { close: () => void } {
  const close = () => { backdrop.remove(); window.removeEventListener('keydown', onKey, true); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const backdrop = h('div', { class: 'modal-backdrop', onmousedown: (e: MouseEvent) => { if (e.target === backdrop) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', {}, h('h2', {}, title), iconBtn('M6 6l12 12 M18 6L6 18', 'Close', close)),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('footer', {}, ...actions) : null,
    ),
  );
  document.body.append(backdrop);
  window.addEventListener('keydown', onKey, true);
  return { close };
}

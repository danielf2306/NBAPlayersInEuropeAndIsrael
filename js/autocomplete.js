// Small accessible autocomplete that works well with touch keyboards
// (a native <datalist> is unreliable on iOS).
import { esc } from './dom.js';

let counter = 0;

/**
 * @param {HTMLInputElement} input
 * @param {{source:(q:string)=>Array<{name,meta,group}>, onSelect?:(item)=>void}} opts
 */
export function attach(input, { source, onSelect }) {
  const wrap = document.createElement('div');
  wrap.className = 'ac';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const list = document.createElement('ul');
  const id = `ac-${++counter}`;
  list.id = id;
  list.className = 'ac-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.appendChild(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', id);
  input.setAttribute('aria-expanded', 'false');
  input.autocomplete = 'off';

  let items = [];
  let active = -1;

  function render() {
    items = source(input.value);
    active = -1;
    if (!items.length) return close();
    let html = '';
    let lastGroup = null;
    items.forEach((it, i) => {
      if (it.group && it.group !== lastGroup) {
        html += `<li class="ac-group" role="presentation">${esc(it.group)}</li>`;
        lastGroup = it.group;
      }
      html += `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="false"><span class="ac-name">${esc(it.name)}${it.alt ? ` <span class="muted small">${esc(it.alt)}</span>` : ''}</span><span class="ac-meta">${esc(it.meta || '')}</span></li>`;
    });
    list.innerHTML = html;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function highlight(i) {
    const opts = list.querySelectorAll('[role=option]');
    opts.forEach((el) => el.setAttribute('aria-selected', 'false'));
    active = Math.max(-1, Math.min(i, items.length - 1));
    const el = opts[active];
    if (el) {
      el.setAttribute('aria-selected', 'true');
      el.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', el.id);
    }
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    input.value = it.name;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    onSelect?.(it);
  }

  input.addEventListener('focus', render);
  input.addEventListener('input', (e) => {
    if (e.isTrusted) render();
  });
  // Close on outside taps rather than on blur, so scrolling the list on a phone works.
  const outside = (e) => {
    if (!wrap.isConnected) return document.removeEventListener('pointerdown', outside);
    if (!wrap.contains(e.target)) close();
  };
  document.addEventListener('pointerdown', outside);
  input.addEventListener('keydown', (e) => {
    if (list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return render();
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape' || e.key === 'Tab') close();
  });
  list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) choose(Number(li.dataset.i));
  });
}

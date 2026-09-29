import { isNative, shareFile } from './native.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/** Open a <dialog> built from html; resolves with the submitted FormData or null. */
export function dialog(html, { onOpen } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog">${html}</form>`;
    document.body.appendChild(d);
    const form = d.querySelector('form');
    let result = null;
    form.addEventListener('submit', (e) => {
      const btn = e.submitter;
      if (btn?.value === 'cancel') return;
      if (!form.reportValidity()) { e.preventDefault(); return; }
      result = { data: new FormData(form), action: btn?.value || 'ok' };
    });
    d.addEventListener('close', () => {
      d.remove();
      resolve(result);
    });
    d.showModal();
    onOpen?.(d);
  });
}

export async function download(filename, text, type = 'application/json') {
  if (isNative()) return shareFile(filename, text); // the Android WebView can't download blobs
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

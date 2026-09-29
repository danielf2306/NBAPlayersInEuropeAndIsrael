// Optional cloud sync between devices (phone <-> computer) through a private
// GitHub Gist. The token stays in this browser only and is never synced.
import * as store from './store.js';

const KEY = 'nbaeu:sync:v1';
const FILE = 'nba-europe-israel.json';
const API = 'https://api.github.com';

let settings = load();
let timer = null;
let busy = false;
const statusListeners = new Set();
let status = { state: settings.token ? 'idle' : 'off', message: '' };

function load() {
  try {
    return { token: '', gistId: '', lastSync: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { token: '', gistId: '', lastSync: '' };
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

function setStatus(state, message = '') {
  status = { state, message };
  for (const fn of statusListeners) fn(status);
}

export function onStatus(fn) {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

export function getSettings() {
  return { ...settings, token: settings.token ? '••••' + settings.token.slice(-4) : '' };
}

export function enabled() {
  return Boolean(settings.token && settings.gistId);
}

async function gh(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${settings.token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(res.status === 401 ? 'הטוקן לא תקין או שפג תוקפו' : `GitHub ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function connect(token, gistId = '') {
  settings = { ...settings, token: token.trim(), gistId: gistId.trim() };
  save();
  setStatus('syncing', 'מתחבר…');
  try {
    if (!settings.gistId) {
      // Reuse an existing sync gist if this account already has one.
      const gists = await gh('/gists?per_page=100');
      const found = gists.find((g) => g.files && g.files[FILE]);
      if (found) {
        settings.gistId = found.id;
      } else {
        const created = await gh('/gists', {
          method: 'POST',
          body: JSON.stringify({
            description: 'NBA Players in Europe & Israel — app data',
            public: false,
            files: { [FILE]: { content: JSON.stringify(store.snapshot()) } },
          }),
        });
        settings.gistId = created.id;
      }
      save();
    }
    await syncNow();
  } catch (e) {
    setStatus('error', e.message);
    throw e;
  }
}

export function disconnect() {
  settings = { token: '', gistId: '', lastSync: '' };
  save();
  setStatus('off');
}

async function pull() {
  const gist = await gh(`/gists/${settings.gistId}`);
  const f = gist.files?.[FILE];
  if (!f) return null;
  let content = f.content;
  if (f.truncated) content = await (await fetch(f.raw_url)).text();
  return content ? JSON.parse(content) : null;
}

async function push() {
  await gh(`/gists/${settings.gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(store.snapshot()) } } }),
  });
}

/** Pull, merge (newest record wins), then push the merged result. */
export async function syncNow() {
  if (!enabled() || busy) return;
  busy = true;
  setStatus('syncing', 'מסנכרן…');
  try {
    const remote = await pull();
    if (remote) store.mergeIn(remote, 'sync');
    await push();
    settings.lastSync = new Date().toISOString();
    save();
    setStatus('ok', 'מסונכרן');
  } catch (e) {
    setStatus('error', navigator.onLine ? e.message : 'אין חיבור לאינטרנט — יסונכרן אחר כך');
  } finally {
    busy = false;
  }
}

export function start() {
  store.onChange((origin) => {
    if (origin !== 'local' || !enabled()) return;
    clearTimeout(timer);
    setStatus('pending', 'שינויים ממתינים לסנכרון');
    timer = setTimeout(syncNow, 4000);
  });
  window.addEventListener('online', () => enabled() && syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && enabled()) syncNow();
  });
  if (enabled()) syncNow();
}

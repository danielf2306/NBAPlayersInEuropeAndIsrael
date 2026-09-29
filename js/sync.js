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

class SyncError extends Error {
  constructor(message, { retryAfter = 0, fatal = false } = {}) {
    super(message);
    this.retryAfter = retryAfter; // ms to wait before trying again
    this.fatal = fatal; // e.g. bad token: don't retry on our own
  }
}

async function gh(path, opts = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      ...opts,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${settings.token}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError(navigator.onLine ? 'אין תקשורת עם GitHub — ננסה שוב בעוד רגע' : 'אין חיבור לאינטרנט — יסונכרן כשהחיבור יחזור');
  }
  if (res.ok) return res.status === 204 ? null : res.json();
  const text = await res.text().catch(() => '');
  if (res.status === 401) throw new SyncError('הטוקן לא תקין או שפג תוקפו — צור טוקן חדש בהגדרות', { fatal: true });
  if (res.status === 404) throw new SyncError('ה-Gist לא נמצא — נתק והתחבר מחדש בהגדרות', { fatal: true });
  if (res.status === 403 || res.status === 429) {
    // Primary or secondary (too many writes) rate limit: wait as long as GitHub asks.
    const retry = Number(res.headers.get('retry-after'));
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const wait = retry ? retry * 1000 : reset ? Math.max(reset * 1000 - Date.now(), 60000) : 5 * 60000;
    if (/rate limit|abuse/i.test(text) || retry || res.headers.get('x-ratelimit-remaining') === '0') {
      throw new SyncError(`GitHub ביקש להאט — ננסה שוב בעוד ${Math.ceil(wait / 60000)} דק׳. הנתונים שמורים בטלפון.`, { retryAfter: wait });
    }
    throw new SyncError('אין הרשאה — ודא שלטוקן יש הרשאת gist', { fatal: true });
  }
  throw new SyncError(`שגיאת GitHub ${res.status} — ננסה שוב בעוד רגע`);
}

// Stable JSON (sorted keys) so "same data" compares equal regardless of key order.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

function payloadKey(snap) {
  const { exportedAt, version, ...maps } = snap || {};
  return stable(maps);
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
    await syncNow({ force: true });
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
  if (f.truncated) content = await (await fetch(f.raw_url, { cache: 'no-store' })).text();
  return content ? JSON.parse(content) : null;
}

async function push(snap) {
  await gh(`/gists/${settings.gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(snap) } } }),
  });
  lastPushAt = Date.now();
}

// Writes to a gist are limited by GitHub, so batch edits: sync after a pause in
// editing, never more than once a minute, and skip the write when nothing changed.
const PAUSE = 15000;
const MIN_GAP = 60000;
let lastPushAt = 0;
let dirty = false;
let failures = 0;

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), Math.max(ms, 1000));
}

/** Pull, merge (newest record wins), then push the merged result if the cloud copy differs. */
export async function syncNow({ force = false } = {}) {
  if (!enabled()) return;
  if (busy) { dirty = true; return; }
  busy = true;
  dirty = false;
  clearTimeout(timer);
  setStatus('syncing', 'מסנכרן…');
  try {
    const remote = await pull();
    if (remote) store.mergeIn(remote, 'sync');
    const snap = store.snapshot();
    if (!remote || payloadKey(remote) !== payloadKey(snap)) {
      const wait = lastPushAt + MIN_GAP - Date.now();
      if (wait > 0 && !force) {
        setStatus('pending', 'שינויים ממתינים לסנכרון');
        schedule(wait);
        return;
      }
      await push(snap);
    }
    failures = 0;
    settings.lastSync = new Date().toISOString();
    save();
    setStatus('ok', 'מסונכרן');
  } catch (e) {
    failures++;
    const err = e instanceof SyncError ? e : new SyncError(`שגיאה: ${e.message}`);
    setStatus('error', err.message);
    if (!err.fatal) schedule(err.retryAfter || Math.min(30000 * 2 ** (failures - 1), 10 * 60000));
  } finally {
    busy = false;
    if (dirty && status.state !== 'error') schedule(PAUSE);
  }
}

/** Push right away (app going to the background), ignoring the once-a-minute spacing. */
function flush() {
  if (enabled() && status.state === 'pending') syncNow({ force: true });
}

export function lastStatus() {
  return status;
}

export function start() {
  store.onChange((origin) => {
    if (origin !== 'local' || !enabled()) return;
    dirty = true;
    setStatus('pending', 'שינויים ממתינים לסנכרון');
    schedule(PAUSE);
  });
  window.addEventListener('online', () => enabled() && schedule(1000));
  document.addEventListener('visibilitychange', () => {
    if (!enabled()) return;
    if (document.visibilityState === 'hidden') flush();
    else if (status.state !== 'pending') schedule(1000);
  });
  if (enabled()) syncNow();
}

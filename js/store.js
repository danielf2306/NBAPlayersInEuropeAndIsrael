// App state: the bundled draft data (read-only) plus the user's own records,
// persisted in localStorage and optionally synced (see sync.js).
import { annotationKey, emptyAnnotation, mergeState, SYNCED_MAPS } from './model.js';

const KEY = 'nbaeu:data:v1';
const listeners = new Set();

let base = { drafts: {}, source: '', generated: '' };
let state = blankState();
let cache = null;

function blankState() {
  return { version: 1, annotations: {}, customDrafts: {}, customPlayers: {}, playerEdits: {} };
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blankState(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn('failed to read local data', e);
  }
  return blankState();
}

function persist(origin = 'local') {
  cache = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('failed to save', e);
    alert('שמירה נכשלה (אין מקום באחסון של הדפדפן?). מומלץ לייצא גיבוי.');
  }
  for (const fn of listeners) fn(origin);
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function init() {
  state = loadLocal();
  const res = await fetch('data/drafts.json');
  const json = await res.json();
  const fields = json.fields;
  base = { source: json.source, generated: json.generated, drafts: {} };
  for (const [year, rows] of Object.entries(json.drafts)) {
    base.drafts[year] = rows.map((row, i) => {
      const p = Object.fromEntries(fields.map((f, j) => [f, row[j]]));
      p.year = Number(year);
      p.draftId = year;
      p.id = `${year}-${p.pick ?? `x${i}`}`;
      p.custom = false;
      return p;
    });
  }
}

export function sourceInfo() {
  return { source: base.source, generated: base.generated };
}

// ---------- read ----------

function build() {
  if (cache) return cache;
  const drafts = new Map();
  const players = new Map();
  for (const year of Object.keys(base.drafts)) {
    drafts.set(year, { id: year, year: Number(year), title: '', custom: false });
  }
  for (const d of Object.values(state.customDrafts)) {
    if (!d.deleted) drafts.set(d.id, { ...d, custom: true });
  }
  for (const [year, list] of Object.entries(base.drafts)) {
    for (const p of list) {
      const edit = state.playerEdits[p.id];
      if (edit?.deleted) continue;
      players.set(p.id, edit ? { ...p, ...edit.fields, edited: true } : p);
    }
  }
  for (const p of Object.values(state.customPlayers)) {
    if (p.deleted || !drafts.has(p.draftId)) continue;
    const d = drafts.get(p.draftId);
    players.set(p.id, { ...p, year: d.year, custom: true });
  }
  const byDraft = new Map([...drafts.keys()].map((k) => [k, []]));
  for (const p of players.values()) byDraft.get(p.draftId)?.push(p);
  for (const list of byDraft.values()) {
    list.sort((a, b) => (a.pick ?? 1e6) - (b.pick ?? 1e6) || a.name.localeCompare(b.name));
  }
  cache = { drafts, players, byDraft };
  return cache;
}

export function drafts() {
  return [...build().drafts.values()].sort((a, b) => b.year - a.year || String(a.title).localeCompare(String(b.title)));
}

export function draft(id) {
  return build().drafts.get(String(id)) || null;
}

// "Hide deep picks": round 3+ picks who never played an NBA game (mostly the long
// 1980s drafts). A per-device display preference that every list and stat respects.
const HIDE_KEY = 'nbaeu:hideDeep';
let hideDeep = (() => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } })();

export function isDeepNoNba(p) {
  return (p.round ?? 0) >= 3 && !(p.nbaGames > 0);
}

const shown = (p) => !(hideDeep && isDeepNoNba(p));

export function hidingDeep() {
  return hideDeep;
}

export function setHideDeep(on) {
  hideDeep = Boolean(on);
  try { localStorage.setItem(HIDE_KEY, hideDeep ? '1' : '0'); } catch { /* ignore */ }
}

/** How many players the toggle hides (in one draft, or overall). */
export function deepCount(draftId) {
  const list = draftId == null ? [...build().players.values()] : build().byDraft.get(String(draftId)) || [];
  return list.filter(isDeepNoNba).length;
}

export function draftPlayers(id) {
  return (build().byDraft.get(String(id)) || []).filter(shown);
}

export function player(id) {
  return build().players.get(id) || null;
}

export function allPlayers() {
  return [...build().players.values()].filter(shown);
}

export function ann(p) {
  return state.annotations[annotationKey(p)] || null;
}

export function rows(players) {
  return players.map((p) => ({ player: p, ann: ann(p) }));
}

/** Every team name the user has typed, for autocomplete. */
export function usedTeams() {
  const m = new Map();
  for (const a of Object.values(state.annotations)) {
    for (const s of a.stints || []) {
      if (s.team && !m.has(s.team)) m.set(s.team, { he: s.team, country: s.country || '', league: s.league || '' });
    }
  }
  return [...m.values()];
}

// ---------- write ----------

export function saveAnn(p, next) {
  const key = annotationKey(p);
  state.annotations[key] = { ...emptyAnnotation(), ...next, name: p.name, updatedAt: Date.now() };
  persist();
}

export function addDraft({ year, title }) {
  const id = uid('c');
  state.customDrafts[id] = { id, year: Number(year), title: title || '', updatedAt: Date.now() };
  persist();
  return id;
}

export function updateDraft(id, fields) {
  const d = state.customDrafts[id];
  if (!d) return;
  state.customDrafts[id] = { ...d, ...fields, updatedAt: Date.now() };
  persist();
}

export function deleteDraft(id) {
  const d = state.customDrafts[id];
  if (!d) return;
  state.customDrafts[id] = { id, deleted: true, updatedAt: Date.now() };
  for (const p of Object.values(state.customPlayers)) {
    if (p.draftId === id && !p.deleted) state.customPlayers[p.id] = { id: p.id, deleted: true, updatedAt: Date.now() };
  }
  persist();
}

const PLAYER_FIELDS = ['pick', 'round', 'team', 'name', 'college', 'nbaGames', 'nbaFrom', 'nbaTo', 'pos', 'bbrefId'];

function cleanFields(fields) {
  const out = {};
  for (const f of PLAYER_FIELDS) if (f in fields) out[f] = fields[f];
  return out;
}

export function addPlayer(draftId, fields) {
  const id = uid('u');
  state.customPlayers[id] = { id, draftId: String(draftId), nbaGames: 0, ...cleanFields(fields), updatedAt: Date.now() };
  persist();
  return id;
}

export function addPlayers(draftId, list) {
  const now = Date.now();
  for (const fields of list) {
    const id = uid('u');
    state.customPlayers[id] = { id, draftId: String(draftId), nbaGames: 0, ...cleanFields(fields), updatedAt: now };
  }
  persist();
}

export function updatePlayer(p, fields) {
  if (p.custom) {
    state.customPlayers[p.id] = { ...state.customPlayers[p.id], ...cleanFields(fields), updatedAt: Date.now() };
  } else {
    const prev = state.playerEdits[p.id]?.fields || {};
    state.playerEdits[p.id] = { fields: { ...prev, ...cleanFields(fields) }, updatedAt: Date.now() };
  }
  persist();
}

export function deletePlayer(p) {
  if (p.custom) state.customPlayers[p.id] = { id: p.id, deleted: true, updatedAt: Date.now() };
  else state.playerEdits[p.id] = { deleted: true, updatedAt: Date.now() };
  persist();
}

export function revertPlayer(p) {
  if (p.custom) return;
  state.playerEdits[p.id] = { fields: {}, updatedAt: Date.now() };
  persist();
}

// ---------- backup / sync ----------

export function snapshot() {
  const out = { version: 1, exportedAt: new Date().toISOString() };
  for (const k of SYNCED_MAPS) out[k] = state[k];
  return out;
}

export function mergeIn(remote, origin = 'import') {
  if (!remote || typeof remote !== 'object') throw new Error('קובץ לא תקין');
  const before = JSON.stringify(snapshotMaps());
  state = { ...state, ...mergeState(state, remote) };
  const changed = JSON.stringify(snapshotMaps()) !== before;
  if (changed) persist(origin);
  return changed;
}

function snapshotMaps() {
  return SYNCED_MAPS.map((k) => state[k]);
}

export function resetAll() {
  state = blankState();
  persist();
}

export function counts() {
  const live = (m) => Object.values(m).filter((x) => !x.deleted).length;
  return {
    annotations: Object.keys(state.annotations).length,
    customDrafts: live(state.customDrafts),
    customPlayers: live(state.customPlayers),
    playerEdits: Object.keys(state.playerEdits).length,
  };
}

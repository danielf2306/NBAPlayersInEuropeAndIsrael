// Team lists for autocomplete: Israeli leagues + European clubs + anything the user typed before.
import { ISRAEL, ISRAEL_LEAGUES, normalize } from './model.js';
import * as store from './store.js';
import { flag } from './nba.js';

let israel = [];
let europe = [];
let other = [];

const LEAGUE_ORDER = { winner: 0, leumit: 1, artzit: 2, historical: 3 };
export const LEAGUE_LABEL = { ...ISRAEL_LEAGUES, historical: 'היסטורית' };

export async function init() {
  const [il, eu, ot] = await Promise.all([
    fetch('data/teams-israel.json').then((r) => r.json()).catch(() => []),
    fetch('data/teams-europe.json').then((r) => r.json()).catch(() => []),
    fetch('data/teams-other.json').then((r) => r.json()).catch(() => []),
  ]);
  israel = il
    .map((t) => ({
      name: t.he,
      alt: t.en || '',
      country: ISRAEL,
      league: t.league,
      meta: [LEAGUE_LABEL[t.league] + (t.division ? ` (${t.division === 'north' ? 'צפון' : 'דרום'})` : ''), t.city].filter(Boolean).join(' · '),
      group: LEAGUE_LABEL[t.league] || 'ישראל',
    }))
    .sort((a, b) => (LEAGUE_ORDER[a.league] ?? 9) - (LEAGUE_ORDER[b.league] ?? 9) || a.name.localeCompare(b.name, 'he'));
  europe = eu.map((t) => ({ name: t.en, alt: t.he || '', country: t.country, meta: `${flag(t.country)} ${t.country}`, group: `${flag(t.country)} ${t.country}` }));
  other = ot.map((t) => ({ name: t.en, alt: '', country: t.country, meta: `${flag(t.country)} ${t.country}`, group: `${flag(t.country)} ${t.country}` }));
  for (const t of [...israel, ...europe, ...other]) t.key = normalize(`${t.name} ${t.alt} ${t.country === ISRAEL ? '' : t.country}`);
}

export function israelTeams() {
  return israel;
}

function userTeams(scope) {
  const known = new Set([...israel, ...europe, ...other].map((t) => t.name));
  const region = { israel: 'il', europe: 'eu', other: 'other' }[scope];
  return store
    .usedTeams()
    .filter((t) => !known.has(t.he) && t.region === region)
    .map((t) => ({
      name: t.he,
      alt: '',
      country: t.country,
      league: t.league,
      meta: t.country === ISRAEL ? (ISRAEL_LEAGUES[t.league] || '') : `${t.country ? flag(t.country) + ' ' : ''}${t.country}`,
      group: 'הוזנו על ידך',
      key: normalize(`${t.he} ${t.country === ISRAEL ? '' : t.country}`),
    }));
}

function score(t, q) {
  if (!q) return 1;
  const words = q.split(' ');
  if (!words.every((w) => t.key.includes(w))) return 0;
  if (normalize(t.name).startsWith(q)) return 4;
  if (t.key.split(' ').some((w) => w.startsWith(words[0]))) return 3;
  return 1;
}

/** scope: 'israel' | 'europe' | 'other' */
export function search(query, scope, limit = 40) {
  const q = normalize(query);
  // Israeli clubs are offered in the Europe section too; picking one moves the row to Israel.
  // Skip the text being typed right now (it's saved as you type, so it shows up as a "used" team).
  const mine = userTeams(scope).filter((t) => normalize(t.name) !== q);
  const pool = [...mine, ...{ israel, europe: [...europe, ...israel], other }[scope]];
  if (!q) return pool.slice(0, limit);
  return pool
    .map((t, i) => ({ t, s: score(t, q), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.t);
}

export function findIsraeli(name) {
  return israel.find((t) => t.name === name) || null;
}

/** Match an Israeli club by its Hebrew or English name ("Hapoel Holon" → הפועל חולון). */
export function matchIsraeli(name) {
  const n = normalize(name);
  if (!n) return null;
  return israel.find((t) => normalize(t.name) === n || normalize(t.alt) === n) || null;
}

export function findEuropean(name) {
  return europe.find((t) => t.name === name) || null;
}

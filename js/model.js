// Pure data logic (no DOM) — shared by the app and the Node tests.

export const ISRAEL = 'ישראל';

export const PATHS = {
  nba_eu: { label: 'מה-NBA לאירופה', short: 'מ-NBA לאירופה', desc: 'שיחק ב-NBA ואז הגיע לאירופה' },
  eu_nba: { label: 'מאירופה ל-NBA', short: 'מאירופה ל-NBA', desc: 'הגיע מאירופה ואז שיחק ב-NBA' },
  eu_nba_eu: { label: 'אירופה, NBA וחזרה לאירופה', short: 'הלוך ושוב', desc: 'שיחק באירופה, עבר ל-NBA וחזר לאירופה' },
  nba_only: { label: 'NBA בלבד', short: 'NBA בלבד', desc: 'שיחק ב-NBA ולא שיחק באירופה' },
  eu_only: { label: 'אירופה בלבד', short: 'אירופה בלבד', desc: 'לא שיחק ב-NBA, שיחק באירופה' },
  none: { label: 'לא NBA ולא אירופה', short: 'אחר', desc: 'לא שיחק ב-NBA וגם לא באירופה' },
};

// Israel is listed in the UI as its own section, but for the NBA/Europe path it
// counts as European basketball (FIBA Europe, EuroLeague).
export const ISRAEL_LEAGUES = {
  winner: 'ליגת העל',
  leumit: 'לאומית',
  artzit: 'ארצית',
  other: 'אחר',
};

// ---------- text helpers ----------

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇ]/g, '') // Latin accents + Hebrew niqqud
    .replace(/[״"'׳`’]/g, '')
    .replace(/[.\-_()/]/g, ' ')
    .replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- seasons ----------
// A season is stored as its start year: 1998 === "1998/99".

export function seasonLabel(start) {
  if (start == null || start === '') return '';
  const s = Number(start);
  return `${s}/${String((s + 1) % 100).padStart(2, '0')}`;
}

export function seasonOptions(from = 1975, to = new Date().getFullYear() + 1) {
  const out = [];
  for (let y = to; y >= from; y--) out.push(y);
  return out;
}

// ---------- players ----------

export function annotationKey(p) {
  return p.bbrefId ? `bb:${p.bbrefId}` : p.id;
}

export function emptyAnnotation() {
  return { path: '', stints: [], israel: null, notes: '', updatedAt: 0 };
}

export function europeStints(a) {
  return (a?.stints || []).filter((s) => s.country !== ISRAEL);
}

export function israelStints(a) {
  return (a?.stints || []).filter((s) => s.country === ISRAEL);
}

export function sortStints(stints) {
  return [...stints].sort((x, y) => (x.season ?? 9999) - (y.season ?? 9999));
}

/** First arrival outside the NBA (Europe incl. Israel), by season. */
export function firstEuropeArrival(a) {
  const withSeason = (a?.stints || []).filter((s) => s.season != null && s.season !== '');
  if (!withSeason.length) return (a?.stints || [])[0] || null;
  return sortStints(withSeason)[0];
}

/** First arrival in Europe *after* the NBA career started (for NBA→Europe players). */
export function firstArrivalAfterNba(p, a) {
  if (!p.nbaFrom) return null;
  const nbaStart = p.nbaFrom - 1;
  return sortStints((a?.stints || []).filter((s) => s.season != null && s.season !== '' && Number(s.season) >= nbaStart))[0] || null;
}

export function playedNba(p) {
  return (p.nbaGames || 0) > 0;
}

/**
 * Work out the NBA/Europe path from the NBA seasons and the European stints.
 * nbaFrom/nbaTo are season end years (1999 = 1998/99); stint.season is a start year.
 * Returns '' when there isn't enough information yet.
 */
export function computePath(p, a) {
  const stints = (a?.stints || []).filter((s) => s.season != null && s.season !== '');
  const anyStint = (a?.stints || []).length > 0;
  if (!playedNba(p)) return anyStint ? 'eu_only' : '';
  if (!anyStint) return '';
  if (!stints.length || !p.nbaFrom) return '';
  const nbaStart = p.nbaFrom - 1;
  const before = stints.some((s) => Number(s.season) < nbaStart);
  const after = stints.some((s) => Number(s.season) >= nbaStart);
  if (before && after) return 'eu_nba_eu';
  if (before) return 'eu_nba';
  return 'nba_eu';
}

export function effectivePath(p, a) {
  return a?.path || computePath(p, a);
}

export function cameToIsrael(a) {
  if (israelStints(a).length) return true;
  return a?.israel === true;
}

/** True when the user has looked at this player (any decision recorded). */
export function isChecked(p, a) {
  return Boolean(effectivePath(p, a)) || a?.israel === false || a?.israel === true;
}

export function pathFlags(path) {
  return {
    nbaToEurope: path === 'nba_eu' || path === 'eu_nba_eu',
    europeToNba: path === 'eu_nba' || path === 'eu_nba_eu',
    europe: ['nba_eu', 'eu_nba', 'eu_nba_eu', 'eu_only'].includes(path),
  };
}

// ---------- stats ----------

function countBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    for (const k of [].concat(keyFn(it)).filter(Boolean)) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'he'));
}

/** players: [{player, ann}] */
export function draftStats(rows) {
  const s = {
    total: rows.length,
    playedNba: 0,
    checked: 0,
    nbaToEurope: 0,
    europeToNba: 0,
    backAndForth: 0,
    europe: 0,
    nbaOnly: 0,
    europeOnly: 0,
    israel: 0,
    nbaGames: 0,
    byRound: [],
    israelTeams: [],
    europeCountries: [],
    europeTeams: [],
    arrivalSeasons: [],
    israelPlayers: [],
  };
  const rounds = new Map();
  for (const { player: p, ann: a } of rows) {
    const path = effectivePath(p, a);
    const f = pathFlags(path);
    const r = p.round ?? '—';
    if (!rounds.has(r)) rounds.set(r, { round: r, total: 0, playedNba: 0, nbaToEurope: 0, europeToNba: 0, israel: 0 });
    const rs = rounds.get(r);
    rs.total++;
    if (playedNba(p)) { s.playedNba++; rs.playedNba++; }
    s.nbaGames += p.nbaGames || 0;
    if (isChecked(p, a)) s.checked++;
    if (f.nbaToEurope) { s.nbaToEurope++; rs.nbaToEurope++; }
    if (f.europeToNba) { s.europeToNba++; rs.europeToNba++; }
    if (path === 'eu_nba_eu') s.backAndForth++;
    if (f.europe) s.europe++;
    if (path === 'nba_only') s.nbaOnly++;
    if (path === 'eu_only') s.europeOnly++;
    if (cameToIsrael(a)) { s.israel++; rs.israel++; s.israelPlayers.push(p); }
  }
  s.byRound = [...rounds.values()].sort((x, y) => (x.round === '—') - (y.round === '—') || x.round - y.round);
  const anns = rows.map((r) => r.ann).filter(Boolean);
  s.israelTeams = countBy(anns, (a) => [...new Set(israelStints(a).map((x) => x.team).filter(Boolean))]);
  s.europeCountries = countBy(anns, (a) => [...new Set(europeStints(a).map((x) => x.country).filter(Boolean))]);
  s.europeTeams = countBy(anns, (a) => [...new Set(europeStints(a).map((x) => x.team).filter(Boolean))]);
  s.arrivalSeasons = countBy(rows, ({ player, ann }) => {
    const st = firstArrivalAfterNba(player, ann);
    return st ? seasonLabel(st.season) : null;
  });
  return s;
}

// ---------- sync / merge ----------

/** Merge two record maps, keeping the newest version of each record (tombstones included). */
export function mergeMaps(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (!out[k] || (v?.updatedAt || 0) > (out[k]?.updatedAt || 0)) out[k] = v;
  }
  return out;
}

export const SYNCED_MAPS = ['annotations', 'customDrafts', 'customPlayers', 'playerEdits'];

export function mergeState(local, remote) {
  const out = { ...local };
  for (const k of SYNCED_MAPS) out[k] = mergeMaps(local?.[k], remote?.[k]);
  return out;
}

// ---------- bulk paste for manual drafts ----------

/**
 * Parse pasted lines into players. Accepts tab/comma/semicolon/pipe separated rows:
 *   "1, Player Name, TEAM, College"   or   "Player Name"
 * A header row (containing "player"/"שחקן"/"name") is skipped.
 */
export function parsePastedPlayers(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(rk|pk|#)?\s*[\t,;|]?\s*(player|name|שחקן|שם)\b/i.test(line)) continue;
    const parts = line.split(/\t|\s*[,;|]\s*/).map((x) => x.trim());
    let pick = null;
    if (/^\d+$/.test(parts[0])) pick = Number(parts.shift());
    // Basketball-Reference rows start with "Rk Pk": keep the second number as the pick.
    if (parts.length > 1 && /^\d+$/.test(parts[0])) pick = Number(parts.shift());
    // Accepts "name, TEAM, college" or "TEAM, name, college".
    const [a1 = '', a2 = '', a3 = ''] = parts;
    const isTeam = (x) => /^[A-Z]{2,4}$/.test(x);
    let team = '';
    let name = a1;
    let college = a2;
    if (isTeam(a1) && a2) { team = a1; name = a2; college = a3; } else if (isTeam(a2)) { team = a2; college = a3; }
    if (!name) continue;
    out.push({ pick, name, team, college });
  }
  return out;
}

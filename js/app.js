import * as store from './store.js';
import * as teams from './teams.js';
import * as sync from './sync.js';
import { attach as autocomplete } from './autocomplete.js';
import { $, $$, esc, toast, dialog, download } from './dom.js';
import { isNative, syncSystemBars } from './native.js';
import * as wiki from './wiki.js';
import { teamChip, teamColors, flag, eraClass, jersey, BALL_SVG, COURT_SVG, COUNTRIES } from './nba.js';
import {
  ISRAEL, ISRAEL_LEAGUES, PATHS, normalize, seasonLabel, seasonOptions, emptyAnnotation,
  computePath, effectivePath, cameToIsrael, isChecked, playedNba, pathFlags, draftStats,
  europeStints, israelStints, sortStints, firstArrivalAfterNba, firstEuropeArrival, parsePastedPlayers, stintPhase, stintSeasons,
} from './model.js';

const app = document.getElementById('app');
const ui = { draftFilter: {}, draftQuery: {}, statsMetric: 'nbaToEurope' };
let pendingSave = null; // flushes the player editor before leaving the page
let resizeHandler = null; // redraws the chart on the stats page

// ---------------------------------------------------------------- helpers

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const fmt = (n) => Number(n || 0).toLocaleString('he-IL');

function draftTitle(d) {
  return d.custom ? `${d.year}${d.title ? ` · ${d.title}` : ''}` : `${d.year}`;
}

/** Seasons (start years) inside the NBA career in which he didn't play in the NBA. */
function nbaRuns(p) {
  const runs = p.nbaRuns;
  // Ignore the bundled runs if the user edited the NBA seasons by hand.
  if (!runs?.length || runs[0][0] !== p.nbaFrom || runs[runs.length - 1][1] !== p.nbaTo) return null;
  return runs;
}

function nbaGaps(p) {
  const runs = nbaRuns(p) || [];
  const gaps = [];
  for (let i = 1; i < runs.length; i++) for (let y = runs[i - 1][1] + 1; y < runs[i][0]; y++) gaps.push(y - 1);
  return gaps;
}

function nbaSeasons(p, { isolate = true } = {}) {
  if (!p.nbaFrom) return '';
  const a = seasonLabel(p.nbaFrom - 1);
  const b = seasonLabel((p.nbaTo || p.nbaFrom) - 1);
  const range = a === b ? a : `${a} – ${b}`;
  // Keep "1998/99 – 2018/19" left-to-right inside Hebrew sentences.
  return isolate ? `\u2066${range}\u2069` : range;
}

function pathBadge(path) {
  return path && PATHS[path] ? `<span class="badge ${path}">${esc(PATHS[path].short)}</span>` : '';
}

function israelBadge(a) {
  if (!cameToIsrael(a)) return '';
  const names = [...new Set(israelStints(a).map((s) => s.team).filter(Boolean))];
  return `<span class="badge il">🇮🇱 ${esc(names.join(', ') || 'ישראל')}</span>`;
}

function empty(title, text) {
  return `<div class="empty">${BALL_SVG}<b>${esc(title)}</b>${text}</div>`;
}

function playerRow(p, { showYear = false } = {}) {
  const a = store.ann(p);
  const path = effectivePath(p, a);
  const first = firstArrivalAfterNba(p, a) || firstEuropeArrival(a);
  const sub = [
    p.college || (p.custom ? '' : 'ללא קולג׳'),
    playedNba(p) ? `${fmt(p.nbaGames)} מש׳ NBA` : 'לא שיחק ב-NBA',
    first ? `${first.country ? flag(first.country) + ' ' : ''}${first.season != null && first.season !== '' ? seasonLabel(first.season) + ' ' : ''}${first.team || ''}` : '',
  ].filter(Boolean).map((x) => `<bdi>${esc(x)}</bdi>`).join(' · ');
  const cls = [isChecked(p, a) ? '' : 'unchecked', playedNba(p) ? '' : 'bust'].join(' ');
  return `<li><a class="prow ${cls}" href="#/player/${encodeURIComponent(p.id)}">
    ${jersey(p.pick, p.round)}
    <span class="who"><span class="name ltr">${esc(p.name)}</span>
      <span class="line2">${showYear ? `<span class="year-tag">${p.year}</span>` : ''}${teamChip(p.team)}<span class="sub" dir="rtl">${sub}</span></span></span>
    <span class="badges">${pathBadge(path)}${israelBadge(a)}</span>
  </a></li>`;
}

function tiles(list) {
  return `<div class="tiles">${list
    .map((t) => `<div class="tile ${t.cls || ''}"><div class="label">${esc(t.label)}</div><div class="value num">${t.value}</div>${t.sub ? `<div class="sub">${esc(t.sub)}</div>` : ''}</div>`)
    .join('')}</div>`;
}

function bars(entries, { limit = 12, empty = 'אין עדיין נתונים', flags = false } = {}) {
  if (!entries.length) return `<p class="muted small">${empty}</p>`;
  if (flags) entries = entries.map(([k, v]) => [`${flag(k)} ${k}`, v]);
  const max = Math.max(...entries.map((e) => e[1]));
  const rest = entries.slice(limit);
  const shown = entries.slice(0, limit);
  if (rest.length) shown.push([`אחרים (${rest.length})`, rest.reduce((s, e) => s + e[1], 0)]);
  return `<div class="bars">${shown
    .map(([k, v]) => `<div class="bar-row" title="${esc(k)}: ${v}"><span class="name">${esc(k)}</span><span class="track"><span class="fill" style="width:${(v / Math.max(max, v)) * 100}%;display:block"></span></span><span class="num">${v}</span></div>`)
    .join('')}</div>`;
}

function statTiles(s) {
  return tiles([
    { label: 'נבחרים', value: fmt(s.total) },
    { label: 'שיחקו ב-NBA', value: fmt(s.playedNba), sub: `${pct(s.playedNba, s.total)}%`, cls: 't-nba' },
    { label: 'מה-NBA לאירופה', value: fmt(s.nbaToEurope), sub: 'שיחקו ב-NBA ואז באירופה', cls: 't-nbaeu' },
    { label: 'מאירופה ל-NBA', value: fmt(s.europeToNba), sub: 'שיחקו באירופה ואז ב-NBA', cls: 't-eunba' },
    { label: 'הלוך ושוב', value: fmt(s.backAndForth), sub: 'חזרו לאירופה או ל-NBA (נספרים בשני הכיוונים)', cls: 't-both' },
    { label: 'שיחקו באירופה', value: fmt(s.europe), sub: `${pct(s.europe, s.total)}% מהנבחרים`, cls: 't-eu' },
    { label: 'הגיעו לישראל', value: fmt(s.israel), sub: `${pct(s.israel, s.total)}% מהנבחרים`, cls: 't-il' },
    { label: 'נבדקו', value: `${pct(s.checked, s.total)}%`, sub: `${s.checked} מתוך ${s.total}`, cls: 't-check' },
  ]);
}

function setNav(name) {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
}

// ---------------------------------------------------------------- views: drafts

const ERAS = {
  1980: ['עידן מג׳יק ובירד', 'סאבוניס, פטרוביץ׳ והדור הראשון מאירופה'],
  1990: ['עידן ג׳ורדן', 'קוקוץ׳, דיבאץ׳ והפריצה האירופית'],
  2000: ['המהפכה הבינלאומית', 'נוביצקי, פארקר, ג׳ינובילי — והשיבה לאירופה'],
  2010: ['עידן השלשות', 'יותר בינלאומיים מאי פעם'],
  2020: ['הדור החדש', 'דונצ׳יץ׳, וומבניאמה ואבדיה'],
};

function ring(value, label) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return `<div class="ring" role="img" aria-label="${value}% ${esc(label)}"><svg viewBox="0 0 92 92"><circle class="track" cx="46" cy="46" r="${r}"/><circle class="val" cx="46" cy="46" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - value / 100)}"/></svg><div class="lbl"><b>${value}%</b><small>${esc(label)}</small></div></div>`;
}

function viewDrafts() {
  setNav('drafts');
  const list = store.drafts();
  const all = store.rows(store.allPlayers());
  const total = draftStats(all);
  const byDecade = new Map();
  for (const d of list) {
    const dec = Math.floor(d.year / 10) * 10;
    if (!byDecade.has(dec)) byDecade.set(dec, []);
    byDecade.get(dec).push(d);
  }
  const years = list.filter((d) => !d.custom).map((d) => d.year);
  let html = `
  <section class="hero">
    ${COURT_SVG}
    <div class="hero-top">
      <div>
        <div class="kicker">NBA DRAFT ${Math.min(...years)}–${Math.max(...years)}</div>
        <h1>מהדראפט <span class="accent">לאירופה</span><br>ומשם לישראל</h1>
        <p>${fmt(total.total)} בחירות דראפט. מי עבר מה-NBA לאירופה, מי הגיע מאירופה ל-NBA — ומי נחת אצלנו.</p>
      </div>
      ${ring(pct(total.checked, total.total), 'נבדקו')}
    </div>
    <div class="scoreboard">
      <div class="score"><div class="v">${fmt(total.nbaToEurope)}</div><div class="l">מה-NBA לאירופה</div></div>
      <div class="score"><div class="v">${fmt(total.europeToNba)}</div><div class="l">מאירופה ל-NBA</div></div>
      <div class="score il"><div class="v">${fmt(total.israel)}</div><div class="l">🇮🇱 הגיעו לישראל</div></div>
      <div class="score"><div class="v">${fmt(total.checked)}</div><div class="l">שחקנים נבדקו</div></div>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn primary" id="add-draft">+ דראפט ידני</button><a class="btn" href="#/stats">לסטטיסטיקה</a></div>
  </section>`;
  for (const [dec, ds] of byDecade) {
    const [name, sub] = ERAS[dec] || ['', ''];
    html += `<div class="era-head ${eraClass(dec)}"><span class="era">${dec}s</span><span><div class="era-name">${esc(name || `שנות ה-${String(dec).slice(2)}`)}</div><div class="era-sub">${esc(sub)}</div></span></div><div class="draft-grid">`;
    for (const d of ds) {
      const s = draftStats(store.rows(store.draftPlayers(d.id)));
      html += `<a class="draft-card ${eraClass(d.year)}" href="#/draft/${encodeURIComponent(d.id)}">
        ${BALL_SVG.replace('class="ball"', 'class="wm"')}
        ${s.total && s.checked === s.total ? '<span class="done">✓ הושלם</span>' : ''}
        <div class="year">${d.year}</div>
        <div class="title">${d.custom ? esc(d.title || 'דראפט ידני') : `${s.total} נבחרים · ${s.playedNba} ב-NBA`}</div>
        <div class="meta">${s.nbaToEurope ? `<span class="badge nba_eu">מ-NBA לאירופה ${s.nbaToEurope}</span>` : ''}${s.europeToNba ? `<span class="badge eu_nba">מאירופה ל-NBA ${s.europeToNba}</span>` : ''}${s.israel ? `<span class="badge il">🇮🇱 ${s.israel}</span>` : ''}</div>
        <div class="progress" title="נבדקו ${s.checked} מתוך ${s.total}"><span style="width:${pct(s.checked, s.total)}%"></span></div>
      </a>`;
    }
    html += `</div>`;
  }
  const src = store.sourceInfo();
  html += `<p class="muted small" style="margin-top:24px">נתוני הדראפט ומשחקי ה-NBA: ${esc(src.source)} (עודכן ${esc(src.generated)}). דראפט שחסר (למשל 2026) — אפשר להוסיף ידנית.</p>`;
  app.innerHTML = html;
  $('#add-draft').onclick = addDraftDialog;
}

async function addDraftDialog() {
  const res = await dialog(`<h2>דראפט חדש</h2>
    <div class="form-grid">
      <label class="field">שנה<input name="year" type="number" inputmode="numeric" min="1946" max="2100" required value="${new Date().getFullYear()}"></label>
      <label class="field wide">שם / תיאור (לא חובה)<input name="title" placeholder="לדוגמה: דראפט 2026"></label>
    </div>
    <p class="hint">אחרי היצירה אפשר להוסיף שחקנים אחד-אחד או להדביק רשימה שלמה.</p>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" value="cancel" formnovalidate>ביטול</button><button class="btn primary" value="ok">צור דראפט</button></div>`);
  if (!res) return;
  const id = store.addDraft({ year: res.data.get('year'), title: res.data.get('title').trim() });
  location.hash = `#/draft/${id}`;
}

// ---------------------------------------------------------------- views: one draft

const FILTERS = [
  ['all', 'הכל', () => true],
  ['unchecked', 'לא נבדקו', (p, a) => !isChecked(p, a)],
  ['nba', 'שיחקו ב-NBA', (p) => playedNba(p)],
  ['nba_eu', 'מ-NBA לאירופה', (p, a) => pathFlags(effectivePath(p, a)).nbaToEurope],
  ['eu_nba', 'מאירופה ל-NBA', (p, a) => pathFlags(effectivePath(p, a)).europeToNba],
  ['europe', 'שיחקו באירופה', (p, a) => pathFlags(effectivePath(p, a)).europe],
  ['israel', 'בישראל', (p, a) => cameToIsrael(a)],
  ['intl', 'ללא קולג׳', (p) => !p.college],
];

function viewDraft(id) {
  setNav('drafts');
  const d = store.draft(id);
  if (!d) return notFound();
  const players = store.draftPlayers(id);
  const rows = store.rows(players);
  const s = draftStats(rows);
  const filter = ui.draftFilter[id] || 'all';
  const q = ui.draftQuery[id] || '';
  const rounds = [...new Set(players.map((p) => p.round).filter(Boolean))].sort((a, b) => a - b);

  const top3 = players.filter((p) => p.pick).slice(0, 3);
  app.innerHTML = `
  <section class="hero draft-hero ${eraClass(d.year)}">
    ${COURT_SVG}
    <span class="big-year" aria-hidden="true">${d.year}</span>
    <div class="crumbs"><a href="#/">דראפטים</a> ›</div>
    <div class="kicker">NBA DRAFT</div>
    <h1>דראפט <span class="display">${d.year}</span>${d.custom && d.title ? `<small class="small" style="font-weight:500;opacity:.8">${esc(d.title)}</small>` : ''}</h1>
    ${top3.length ? `<div class="podium">${top3.map((p) => `<a href="#/player/${encodeURIComponent(p.id)}"><span class="pk">#${p.pick}</span><span class="nm ltr">${esc(p.name)}</span><span class="tm">${teamChip(p.team)}</span></a>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:14px">
      <button class="btn primary" id="add-player">+ שחקן</button>
      <button class="btn" id="paste-players">הדבקת רשימה</button>
      ${d.custom ? `<button class="btn" id="edit-draft">עריכה</button>` : ''}
    </div>
  </section>

  <details class="card" open>
    <summary>סטטיסטיקה לדראפט ${d.year}</summary>
    ${statTiles(s)}
    <div class="grid-2" style="margin-top:16px">
      <div>
        <h3>לפי סיבוב</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>סיבוב</th><th class="num">נבחרים</th><th class="num">ב-NBA</th><th class="num">מ-NBA לאירופה</th><th class="num">מאירופה ל-NBA</th><th class="num">ישראל</th></tr></thead>
          <tbody>${s.byRound.map((r) => `<tr><td>${r.round}</td><td class="num">${r.total}</td><td class="num">${r.playedNba}</td><td class="num">${r.nbaToEurope}</td><td class="num">${r.europeToNba}</td><td class="num">${r.israel}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div>
        <h3>קבוצות בישראל</h3>
        ${bars(s.israelTeams, { empty: 'עוד לא סומנו שחקנים שהגיעו לישראל' })}
        ${s.israelPlayers.length ? `<p class="small" style="margin-top:8px">${s.israelPlayers.map((p) => `<a class="ltr" href="#/player/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join(' · ')}</p>` : ''}
      </div>
      <div>
        <h3>מדינות באירופה</h3>
        ${bars(s.europeCountries, { empty: 'עוד לא הוזנו קבוצות באירופה', flags: true })}
      </div>
      <div>
        <h3>עונת הגעה לאירופה (אחרי ה-NBA)</h3>
        ${bars(s.arrivalSeasons, { empty: 'אין עדיין נתונים' })}
      </div>
    </div>
  </details>

  <section class="card">
    <div class="searchbar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><input id="dq" type="search" placeholder="חיפוש שחקן בדראפט…" value="${esc(q)}"></div>
    <div class="chips" role="toolbar" aria-label="סינון">
      ${FILTERS.map(([k, label, fn]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}"><bdi>${label}</bdi><span class="n"><bdi>${rows.filter((r) => fn(r.player, r.ann)).length}</bdi></span></button>`).join('')}
      ${rounds.length > 1 ? rounds.map((r) => `<button class="chip" data-f="r${r}" aria-pressed="${filter === `r${r}`}">סיבוב ${r}</button>`).join('') : ''}
    </div>
    <ul class="plist" id="plist"></ul>
  </section>`;

  const renderList = () => {
    const f = ui.draftFilter[id] || 'all';
    const nq = normalize(ui.draftQuery[id] || '');
    const fn = f.startsWith('r') ? (p) => String(p.round) === f.slice(1) : FILTERS.find((x) => x[0] === f)[2];
    const shown = rows.filter((r) => fn(r.player, r.ann) && (!nq || normalize(`${r.player.name} ${r.player.college || ''} ${r.player.team || ''}`).includes(nq)));
    $('#plist').innerHTML = shown.length ? shown.map((r) => playerRow(r.player)).join('') : `<li>${players.length ? empty('AIRBALL', 'אין שחקנים שמתאימים לסינון') : empty('EMPTY ROSTER', 'אין עדיין שחקנים בדראפט הזה — הוסף שחקן או הדבק רשימה')}</li>`;
  };
  renderList();

  $$('.chip', app).forEach((b) => (b.onclick = () => {
    ui.draftFilter[id] = b.dataset.f;
    $$('.chip', app).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  }));
  $('#dq').oninput = (e) => { ui.draftQuery[id] = e.target.value; renderList(); };
  $('#add-player').onclick = () => playerDialog({ draftId: id });
  $('#paste-players').onclick = () => pasteDialog(id);
  if (d.custom) $('#edit-draft').onclick = () => editDraftDialog(d);
}

async function editDraftDialog(d) {
  const res = await dialog(`<h2>עריכת דראפט</h2>
    <div class="form-grid">
      <label class="field">שנה<input name="year" type="number" inputmode="numeric" required value="${d.year}"></label>
      <label class="field wide">שם / תיאור<input name="title" value="${esc(d.title)}"></label>
    </div>
    <div class="row" style="margin-top:16px"><button class="btn danger" value="delete" formnovalidate>מחיקת הדראפט</button><span class="spacer"></span><button class="btn" value="cancel" formnovalidate>ביטול</button><button class="btn primary" value="ok">שמירה</button></div>`);
  if (!res) return;
  if (res.action === 'delete') {
    if (!confirm('למחוק את הדראפט וכל השחקנים שהוספת בו?')) return;
    store.deleteDraft(d.id);
    location.hash = '#/';
    return;
  }
  store.updateDraft(d.id, { year: Number(res.data.get('year')), title: res.data.get('title').trim() });
  route();
}

function seasonSelect(name, value, { placeholder = '—', endYear = false, min = null } = {}) {
  // endYear: option value is the season's end year (used for nbaFrom/nbaTo)
  const opts = seasonOptions(min ?? 1946).map((y) => {
    const v = endYear ? y + 1 : y;
    return `<option value="${v}" ${String(value) === String(v) ? 'selected' : ''}>${seasonLabel(y)}</option>`;
  });
  return `<select name="${name}"><option value="">${placeholder}</option>${opts.join('')}</select>`;
}

async function playerDialog({ draftId, player: p }) {
  const v = p || {};
  const res = await dialog(`<h2>${p ? 'עריכת פרטי שחקן' : 'הוספת שחקן'}</h2>
    <div class="form-grid">
      <label class="field wide">שם<input name="name" required value="${esc(v.name)}" dir="auto"></label>
      <label class="field">מס׳ בחירה<input name="pick" type="number" inputmode="numeric" min="1" value="${v.pick ?? ''}"></label>
      <label class="field">סיבוב<input name="round" type="number" inputmode="numeric" min="1" value="${v.round ?? ''}"></label>
      <label class="field">קבוצה בוחרת<input name="team" value="${esc(v.team)}" placeholder="LAL" dir="ltr"></label>
      <label class="field">עמדה<input name="pos" value="${esc(v.pos)}" placeholder="G / F / C" dir="ltr"></label>
      <label class="field wide">מכללה / קבוצה לפני הדראפט<input name="college" value="${esc(v.college)}" dir="auto"></label>
      <label class="field">משחקים ב-NBA<input name="nbaGames" type="number" inputmode="numeric" min="0" value="${v.nbaGames ?? 0}"></label>
      <label class="field">עונה ראשונה ב-NBA${seasonSelect('nbaFrom', v.nbaFrom, { endYear: true })}</label>
      <label class="field">עונה אחרונה ב-NBA${seasonSelect('nbaTo', v.nbaTo, { endYear: true })}</label>
      <label class="field">מזהה Basketball-Reference<input name="bbrefId" value="${esc(v.bbrefId)}" placeholder="nowitdi01" dir="ltr"></label>
    </div>
    <div class="row" style="margin-top:16px">
      ${p ? `<button class="btn danger" value="delete" formnovalidate>מחיקה</button>${p.edited ? `<button class="btn" value="revert" formnovalidate>שחזור מקור</button>` : ''}` : ''}
      <span class="spacer"></span><button class="btn" value="cancel" formnovalidate>ביטול</button><button class="btn primary" value="ok">שמירה</button>
    </div>`);
  if (!res) return;
  if (res.action === 'delete') {
    if (!confirm(`למחוק את ${v.name}?`)) return;
    store.deletePlayer(p);
    location.hash = `#/draft/${encodeURIComponent(p.draftId)}`;
    return;
  }
  if (res.action === 'revert') {
    store.revertPlayer(p);
    return route();
  }
  const f = res.data;
  const num = (k) => (f.get(k) === '' ? null : Number(f.get(k)));
  const fields = {
    name: f.get('name').trim(),
    pick: num('pick'),
    round: num('round'),
    team: f.get('team').trim(),
    pos: f.get('pos').trim(),
    college: f.get('college').trim(),
    nbaGames: num('nbaGames') || 0,
    nbaFrom: num('nbaFrom'),
    nbaTo: num('nbaTo'),
    bbrefId: f.get('bbrefId').trim() || null,
  };
  if (fields.nbaGames > 0 && !fields.nbaFrom) toast('כדאי לבחור עונה ראשונה ב-NBA כדי שהמסלול יחושב אוטומטית');
  if (p) {
    store.updatePlayer(p, fields);
    route();
  } else {
    const newId = store.addPlayer(draftId, fields);
    location.hash = `#/player/${encodeURIComponent(newId)}`;
  }
}

async function pasteDialog(draftId) {
  let parsed = [];
  const res = await dialog(`<h2>הדבקת רשימת שחקנים</h2>
    <p class="small muted">שורה לכל שחקן. אפשר: <span class="kbd">שם</span>, או <span class="kbd">בחירה, שם, קבוצה, מכללה</span> (מופרד בפסיק או טאב — אפשר להעתיק טבלה מ-Basketball-Reference או מ-Excel).</p>
    <textarea name="text" dir="auto" placeholder="1, Cooper Flagg, DAL, Duke&#10;2, Dylan Harper, SAS, Rutgers"></textarea>
    <p class="hint" id="paste-preview">0 שחקנים</p>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" value="cancel" formnovalidate>ביטול</button><button class="btn primary" value="ok">הוספה</button></div>`, {
    onOpen(d) {
      const ta = d.querySelector('textarea');
      ta.oninput = () => {
        parsed = parsePastedPlayers(ta.value);
        d.querySelector('#paste-preview').textContent = `${parsed.length} שחקנים${parsed[0] ? ` — לדוגמה: ${parsed[0].pick ? `#${parsed[0].pick} ` : ''}${parsed[0].name}${parsed[0].team ? ` (${parsed[0].team})` : ''}` : ''}`;
      };
    },
  });
  if (!res || !parsed.length) return;
  store.addPlayers(draftId, parsed);
  toast(`נוספו ${parsed.length} שחקנים`);
  route();
}

// ---------------------------------------------------------------- views: player

function extLinks(p) {
  const q = encodeURIComponent(p.name);
  const links = [];
  if (p.bbrefId) links.push(['Basketball-Reference', `https://www.basketball-reference.com/players/${p.bbrefId[0]}/${p.bbrefId}.html`]);
  else links.push(['Basketball-Reference', `https://www.basketball-reference.com/search/search.fcgi?search=${q}`]);
  links.push(
    ['RealGM', `https://basketball.realgm.com/search?q=${q}`],
    ['Proballers', `https://www.google.com/search?q=${q}+site%3Aproballers.com`],
    ['Eurobasket', `https://www.google.com/search?q=${q}+site%3Aeurobasket.com`],
    ['מנהלת הליגה', `https://www.google.com/search?q=${q}+site%3Abasket.co.il`],
    ['גוגל', `https://www.google.com/search?q=${q}+basketball+career+europe`],
  );
  return `<span id="wiki-links" class="links" style="margin:0">${wikiButtons(p, null)}</span>`
    + links.map(([t, u]) => `<a class="btn small" href="${u}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join('');
}

// Wikipedia: a manual link saved on the player wins; otherwise the article found by
// searching Wikipedia (English, plus Hebrew when that page exists); otherwise a search link.
function wikiButtons(p, found, pending = false) {
  const own = store.ann(p)?.wikiUrl;
  const btn = (label, url, cls = '') => `<a class="btn small ${cls}" href="${esc(url)}" target="_blank" rel="noopener">${label} ↗</a>`;
  let html;
  if (own) html = btn('ויקיפדיה', own, 'navy');
  else if (found) html = btn('ויקיפדיה', found.en.url, 'navy') + (found.he ? btn('ויקיפדיה בעברית', found.he.url, 'navy') : '');
  else html = btn(pending ? 'ויקיפדיה…' : 'חיפוש בוויקיפדיה', wiki.searchUrl(p.name));
  return html + `<button type="button" class="btn small icon" id="wiki-edit" title="קישור ויקיפדיה אחר" aria-label="עריכת קישור ויקיפדיה">✎</button>`;
}

async function renderWiki(p) {
  const box = $('#wiki-links');
  if (!box) return;
  const bind = () => {
    $('#wiki-edit').onclick = () => {
      const current = store.ann(p)?.wikiUrl || '';
      const url = prompt('הדבק קישור לדף הוויקיפדיה של השחקן (ריק = חזרה לחיפוש האוטומטי):', current);
      if (url === null) return;
      const clean = url.trim();
      if (clean && !/^https:\/\/[a-z-]+\.(m\.)?wikipedia\.org\//.test(clean)) return toast('זה לא נראה כמו קישור לוויקיפדיה');
      store.saveAnn(p, { ...(store.ann(p) || emptyAnnotation()), wikiUrl: clean || undefined });
      renderWiki(p);
    };
  };
  if (store.ann(p)?.wikiUrl) { box.innerHTML = wikiButtons(p, null); return bind(); }
  box.innerHTML = wikiButtons(p, null, true);
  bind();
  let found = null;
  try {
    found = await wiki.lookup(p.bbrefId || p.id, p.name);
  } catch {
    // offline or blocked: keep the search link
  }
  if (box.isConnected) { box.innerHTML = wikiButtons(p, found); bind(); }
}

const PATH_ICONS = { nba_eu: '✈️', eu_nba: '🇺🇸', eu_nba_eu: '🔁', nba_eu_nba: '↩️', nba_only: '🏀', eu_only: '🇪🇺', none: '—' };

/** Career timeline: NBA / Europe / Israel lanes on one season axis. */
function timeline(p, a) {
  const segs = [];
  if (playedNba(p) && p.nbaFrom) {
    for (const [from, to] of nbaRuns(p) || [[p.nbaFrom, p.nbaTo || p.nbaFrom]]) segs.push({ lane: 'nba', from: from - 1, to: to - 1, label: 'NBA' });
  }
  for (const st of a.stints || []) {
    if (st.season == null || st.season === '') continue;
    const from = Number(st.season);
    const to = st.until != null && st.until !== '' ? Math.max(from, Number(st.until)) : from;
    segs.push({ lane: st.country === ISRAEL ? 'il' : 'eu', from, to, label: st.team || '?', title: `${st.team || ''} ${seasonLabel(from)}${to > from ? `–${seasonLabel(to)}` : ''}` });
  }
  if (!segs.length) return '';
  const min = Math.min(...segs.map((x) => x.from));
  const max = Math.max(...segs.map((x) => x.to)) + 1;
  const span = Math.max(max - min, 1);
  const pos = (y) => ((y - min) / span) * 100;
  const lanes = [['nba', 'NBA'], ['eu', 'אירופה'], ['il', 'ישראל']].filter(([k]) => segs.some((x) => x.lane === k));
  const step = span > 16 ? 5 : span > 6 ? 2 : 1;
  const ticks = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push(y);
  return lanes.map(([k, name]) => `<div class="tl-row"><span class="tl-label">${name}</span><div class="tl-lane">${segs
    .filter((x) => x.lane === k)
    .map((x) => {
      const w = pos(x.to + 1) - pos(x.from);
      return `<span class="tl-seg ${k}" style="left:${pos(x.from)}%;width:${w}%" title="${esc(x.title || `${seasonLabel(x.from)}–${seasonLabel(x.to)}`)}">${w >= 14 ? esc(x.label) : ''}</span>`;
    })
    .join('')}</div></div>`).join('')
    + `<div class="tl-axis">${ticks.map((y) => `<span style="left:${pos(y)}%">${y}</span>`).join('')}</div>`;
}

function viewPlayer(id) {
  setNav('drafts');
  const p = store.player(id);
  if (!p) return notFound();
  const d = store.draft(p.draftId);
  const siblings = store.draftPlayers(p.draftId);
  const idx = siblings.findIndex((x) => x.id === p.id);
  const prev = siblings[idx - 1];
  const next = siblings[idx + 1];
  const nextUnchecked = siblings.slice(idx + 1).find((x) => !isChecked(x, store.ann(x)));

  // Working copy — saved automatically on every change.
  const work = structuredClone(store.ann(p) || emptyAnnotation());
  work.stints = work.stints || [];
  let saveTimer;
  const flush = () => {
    clearTimeout(saveTimer);
    pendingSave = null;
    // The Wikipedia link is edited outside this form; keep whatever is stored.
    store.saveAnn(p, { ...work, wikiUrl: store.ann(p)?.wikiUrl });
  };
  const save = () => {
    clearTimeout(saveTimer);
    $('#save-status').textContent = 'שומר…';
    renderSummary();
    pendingSave = flush;
    saveTimer = setTimeout(() => {
      flush();
      const st = $('#save-status');
      if (st) st.textContent = 'נשמר ✓';
    }, 350);
  };

  const [t1, t2] = teamColors(p.team);
  const seasons = p.nbaFrom ? (p.nbaTo || p.nbaFrom) - p.nbaFrom + 1 : 0;
  app.innerHTML = `
  <section class="player-hero" style="--t1:${t1};--t2:${t2}">
    ${COURT_SVG}
    ${p.pick ? `<span class="pick-wm" aria-hidden="true">#${p.pick}</span>` : ''}
    <div class="top">
      <div class="crumbs"><a href="#/">דראפטים</a> › <a href="#/draft/${encodeURIComponent(p.draftId)}">דראפט ${esc(d ? draftTitle(d) : p.year)}</a></div>
      <button class="btn" id="edit-player">עריכה</button>
    </div>
    <h1>${esc(p.name)}</h1>
    <div class="meta">${teamChip(p.team)}<span>דראפט ${p.year}${p.pick ? ` · בחירה ${p.pick}` : ''}${p.round ? ` · סיבוב ${p.round}` : ''}</span>${p.pos ? `<span class="badge outline" style="color:#fff;border-color:rgb(255 255 255 / 35%)">${esc(p.pos)}</span>` : ''}</div>
    <div class="cardback">
      <div><b>${p.pick ? `#${p.pick}` : '—'}</b><span>בחירה</span></div>
      <div><b>${p.round ?? '—'}</b><span>סיבוב</span></div>
      <div><b>${fmt(p.nbaGames)}</b><span>משחקי NBA</span></div>
      <div><b>${seasons || '—'}</b><span>עונות NBA</span></div>
    </div>
  </section>

  <section class="card">
    <dl class="facts">
      <div><dt>מכללה / מוצא</dt><dd>${esc(p.college || 'ללא קולג׳ (כנראה בינלאומי)')}</dd></div>
      <div><dt>עונות ב-NBA</dt><dd class="num">${esc(nbaSeasons(p) || 'לא שיחק ב-NBA')}</dd></div>
      <div><dt>קבוצה בוחרת</dt><dd class="ltr" style="text-align:right">${esc(teamColors(p.team)[2] || '—')}</dd></div>
      ${p.born ? `<div><dt>תאריך לידה</dt><dd class="num">${esc(p.born)}</dd></div>` : ''}
    </dl>
    <div class="links">${extLinks(p)}</div>
  </section>

  <section class="card">
    <h2>המסלול: NBA ↔ אירופה</h2>
    <div id="timeline" class="timeline"></div>
    <div id="summary" class="summary-line"></div>
    <div class="segmented" id="path" role="group" aria-label="מסלול">
      <button type="button" data-path=""><span class="ic">✨</span>אוטומטי</button>
      ${Object.entries(PATHS).map(([k, v]) => `<button type="button" data-path="${k}" title="${esc(v.desc)}"><span class="ic">${PATH_ICONS[k]}</span>${esc(v.label)}</button>`).join('')}
    </div>
    <p class="hint">״אוטומטי״ מחשב את המסלול לפי עונות ה-NBA ועונות הקבוצות שהזנת (ישראל נחשבת לאירופה). שחקן שבדקת ולא שיחק באירופה — סמן ״NBA בלבד״.</p>
  </section>

  <section class="card">
    <h2>קבוצות באירופה 🇪🇺</h2>
    <div class="stints" id="eu-stints"></div>
    <button class="btn" id="add-eu" type="button">+ הוספת קבוצה באירופה</button>
    <p class="hint">עונה אחת: בוחרים רק ״מעונה״. כמה עונות ברצף באותה קבוצה: בוחרים גם ״עד עונה״.</p>
  </section>

  <section class="card il-card">
    <h2>ישראל 🇮🇱</h2>
    <div class="segmented" id="il" role="group" aria-label="הגיע לישראל?">
      <button type="button" data-il="">לא נבדק</button>
      <button type="button" data-il="no">לא הגיע לישראל</button>
      <button type="button" data-il="yes">הגיע לישראל</button>
    </div>
    <div id="il-block">
      <div class="stints" id="il-stints"></div>
      <button class="btn" id="add-il" type="button">+ הוספת קבוצה בישראל</button>
      <p class="hint">עונה אחת: בוחרים רק ״מעונה״. כמה עונות ברצף: בוחרים גם ״עד עונה״.</p>
    </div>
  </section>

  <section class="card">
    <label class="field">הערות<textarea id="notes" dir="auto" placeholder="מקורות, פרטים נוספים…">${esc(work.notes || '')}</textarea></label>
  </section>

  <div class="savebar">
    <span class="status" id="save-status">${store.ann(p) ? 'נשמר ✓' : 'השינויים נשמרים אוטומטית'}</span>
    ${prev ? `<a class="btn" href="#/player/${encodeURIComponent(prev.id)}" title="${esc(prev.name)}">→ הקודם</a>` : ''}
    ${nextUnchecked && nextUnchecked !== next ? `<a class="btn" href="#/player/${encodeURIComponent(nextUnchecked.id)}" title="${esc(nextUnchecked.name)}">הבא שלא נבדק</a>` : ''}
    ${next ? `<a class="btn primary" href="#/player/${encodeURIComponent(next.id)}" title="${esc(next.name)}">הבא ←</a>` : ''}
  </div>`;

  function renderSummary() {
    const computed = computePath(p, work);
    const path = work.path || computed;
    const parts = [];
    const gaps = nbaGaps(p);
    parts.push(playedNba(p)
      ? `שיחק ב-NBA ${nbaSeasons(p)} (${fmt(p.nbaGames)} משחקים${gaps.length ? `, ללא ${gaps.length === 1 ? 'עונת' : 'העונות'} ${gaps.map(seasonLabel).join(', ')}` : ''}).`
      : 'לא שיחק ב-NBA.');
    const describe = (s) => `${s.season != null && s.season !== '' ? `${s.until > s.season ? 'בעונות' : 'בעונת'} \u2066${stintSeasons(s)}\u2069 ` : ''}ל${s.team || 'קבוצה לא ידועה'}${s.country ? ` (${s.country})` : ''}`;
    const byPhase = (ph) => sortStints(work.stints.filter((s) => stintPhase(p, s) === ph))[0];
    const [before, middle, after] = ['before', 'middle', 'after'].map(byPhase);
    if (before) parts.push(`לפני ה-NBA שיחק באירופה: ${describe(before)}.`);
    if (middle) parts.push(`באמצע הקריירה יצא לאירופה ${describe(middle)} וחזר ל-NBA.`);
    if (after) parts.push(`אחרי ה-NBA הגיע לאירופה ${describe(after)}.`);
    const first = firstEuropeArrival(work);
    if (!before && !middle && !after && first) parts.push(`קבוצה ראשונה באירופה: ${describe(first)}.`);
    if (cameToIsrael(work)) {
      const il = sortStints(israelStints(work));
      parts.push(il.length ? `בישראל: ${il.map((s) => `${s.team || '?'}${s.season != null && s.season !== '' ? ` (\u2066${stintSeasons(s)}\u2069)` : ''}`).join(', ')}.` : 'הגיע לישראל.');
    }
    const label = path ? `<strong>${esc(PATHS[path].label)}</strong>${!work.path && computed ? ' <span class="muted small">(חושב אוטומטית)</span>' : ''}` : '<strong>לא נקבע עדיין</strong>';
    $('#summary').innerHTML = `${label}<br>${esc(parts.join(' '))}`;
    $('#timeline').innerHTML = timeline(p, work);
    $$('#path button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.path === (work.path || ''))));
    const ilState = work.israel === true || israelStints(work).length ? 'yes' : work.israel === false ? 'no' : '';
    $$('#il button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.il === ilState)));
    $('#il-block').classList.toggle('hidden', ilState !== 'yes');
  }

  function stintEditor(container, kind) {
    const list = work.stints.filter((s) => (kind === 'il' ? s.country === ISRAEL : s.country !== ISRAEL));
    if (!list.length) {
      container.innerHTML = `<p class="muted small">${kind === 'il' ? 'לא הוזנו קבוצות בישראל' : 'לא הוזנו קבוצות באירופה'}</p>`;
      return;
    }
    const untilSelect = (s) => seasonSelect('until', s.until, { placeholder: 'עונה אחת בלבד', min: s.season != null && s.season !== '' ? Number(s.season) + 1 : null });
    container.innerHTML = list.map((s, i) => `
      <div class="stint" data-i="${i}">
        <div class="range">
          <label class="field">מעונה${seasonSelect('season', s.season, { placeholder: 'בחר עונה' })}</label>
          <span class="dash" aria-hidden="true">–</span>
          <label class="field">עד עונה${untilSelect(s)}</label>
        </div>
        <label class="field">קבוצה<input name="team" value="${esc(s.team)}" placeholder="${kind === 'il' ? 'התחל להקליד, למשל: הפועל…' : 'Start typing, e.g. Real…'}" dir="auto"></label>
        ${kind === 'il'
          ? `<label class="field">ליגה<select name="league"><option value="">—</option>${Object.entries(ISRAEL_LEAGUES).map(([k, l]) => `<option value="${k}" ${s.league === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`
          : `<label class="field">מדינה<input name="country" value="${esc(s.country)}" dir="auto"></label>`}
        <button class="btn small danger remove" type="button" data-remove>✕ הסרה</button>
      </div>`).join('');
    $$('.stint', container).forEach((row) => {
      const s = list[Number(row.dataset.i)];
      const sel = row.querySelector('[name=season]');
      const bindUntil = () => {
        const until = row.querySelector('[name=until]');
        until.onchange = () => { s.until = until.value === '' ? null : Number(until.value); save(); };
      };
      sel.onchange = () => {
        s.season = sel.value === '' ? null : Number(sel.value);
        // An end season before the start makes no sense: drop it and offer only later seasons.
        if (s.until != null && (s.season == null || s.until <= s.season)) s.until = null;
        row.querySelector('[name=until]').outerHTML = untilSelect(s);
        bindUntil();
        save();
      };
      bindUntil();
      const team = row.querySelector('[name=team]');
      team.oninput = () => { s.team = team.value.trim(); save(); };
      autocomplete(team, {
        source: (q) => teams.search(q, kind === 'il' ? 'israel' : 'europe'),
        onSelect: (it) => {
          s.team = it.name;
          if (kind === 'il') {
            if (it.league && ISRAEL_LEAGUES[it.league]) { s.league = it.league; row.querySelector('[name=league]').value = it.league; }
          } else if (it.country) {
            s.country = it.country;
            row.querySelector('[name=country]').value = it.country;
          }
          save();
        },
      });
      if (kind === 'il') {
        const lg = row.querySelector('[name=league]');
        lg.onchange = () => { s.league = lg.value; save(); };
      } else {
        const c = row.querySelector('[name=country]');
        c.oninput = () => { s.country = c.value.trim(); save(); };
        autocomplete(c, {
          source: (q) => COUNTRIES.filter((x) => x !== ISRAEL && normalize(x).includes(normalize(q))).map((x) => ({ name: x, meta: flag(x) })),
          onSelect: (it) => { s.country = it.name; save(); },
        });
      }
      row.querySelector('[data-remove]').onclick = () => {
        work.stints.splice(work.stints.indexOf(s), 1);
        save();
        renderStints();
      };
    });
  }

  function renderStints() {
    stintEditor($('#eu-stints'), 'eu');
    stintEditor($('#il-stints'), 'il');
    renderSummary();
  }

  function addStint(kind) {
    const lastSeason = sortStints(work.stints).filter((s) => s.season != null && s.season !== '').pop()?.season;
    const guess = lastSeason != null ? Number(lastSeason) + 1 : p.nbaTo || null;
    work.stints.push(kind === 'il' ? { season: guess, team: '', country: ISRAEL, league: '' } : { season: guess, team: '', country: '' });
    if (kind === 'il') work.israel = true;
    save();
    renderStints();
    const rows = $$(kind === 'il' ? '#il-stints .stint' : '#eu-stints .stint');
    rows[rows.length - 1]?.querySelector('[name=team]').focus();
  }

  renderStints();
  $$('#path button').forEach((b) => (b.onclick = () => { work.path = b.dataset.path; save(); renderSummary(); }));
  $$('#il button').forEach((b) => (b.onclick = () => {
    const v = b.dataset.il;
    if (v !== 'yes' && israelStints(work).length) {
      if (!confirm('להסיר את הקבוצות בישראל שהוזנו?')) return;
      work.stints = work.stints.filter((s) => s.country !== ISRAEL);
    }
    work.israel = v === 'yes' ? true : v === 'no' ? false : null;
    save();
    renderStints();
    if (v === 'yes' && !israelStints(work).length) addStint('il');
  }));
  $('#add-eu').onclick = () => addStint('eu');
  $('#add-il').onclick = () => addStint('il');
  $('#notes').oninput = (e) => { work.notes = e.target.value; save(); };
  $('#edit-player').onclick = () => playerDialog({ player: p });
  renderWiki(p);
}

// ---------------------------------------------------------------- views: stats

const METRICS = {
  nbaToEurope: 'מה-NBA לאירופה',
  europeToNba: 'מאירופה ל-NBA',
  israel: 'הגיעו לישראל',
  europe: 'שיחקו באירופה',
  playedNba: 'שיחקו ב-NBA',
  checked: 'נבדקו',
};

function columnChart(data, metric, W = 800) {
  const H = 220;
  const pad = { t: 10, r: 8, b: 26, l: 30 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(2, step - 2);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const every = step * 5 >= 34 ? 5 : 10;
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(METRICS[metric])} לפי שנת דראפט">`;
  svg += `<g class="grid">${ticks.map((t) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}</g>`;
  data.forEach((d, i) => {
    // RTL page, but years read left→right like a timeline.
    const x = pad.l + i * step + 1;
    const h = Math.max(0, H - pad.b - y(d.value));
    const r = Math.min(4, bw / 2, h);
    const top = H - pad.b - h;
    const path = h > 0
      ? `M${x},${H - pad.b}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${H - pad.b}Z`
      : '';
    svg += `<rect class="col-hit" x="${x - 1}" y="${pad.t}" width="${step}" height="${H - pad.t - pad.b}" data-i="${i}"/>`;
    if (path) svg += `<path class="col" d="${path}" data-i="${i}"/>`;
    if (d.label % every === 0 || data.length < 16) svg += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${d.label}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function viewStats() {
  setNav('stats');
  const ds = store.drafts().slice().sort((a, b) => a.year - b.year);
  const per = ds.map((d) => ({ d, s: draftStats(store.rows(store.draftPlayers(d.id))) }));
  const all = draftStats(store.rows(store.allPlayers()));
  const metric = ui.statsMetric;

  app.innerHTML = `
  <section class="hero">
    ${COURT_SVG}
    <div class="kicker">BOX SCORE</div>
    <h1>סטטיסטיקה</h1>
    <p>כל הדראפטים יחד — ${fmt(all.total)} בחירות, ${fmt(all.playedNba)} שיחקו ב-NBA.</p>
    <div class="scoreboard">
      <div class="score"><div class="v">${fmt(all.nbaToEurope)}</div><div class="l">מה-NBA לאירופה</div></div>
      <div class="score"><div class="v">${fmt(all.europeToNba)}</div><div class="l">מאירופה ל-NBA</div></div>
      <div class="score"><div class="v">${fmt(all.backAndForth)}</div><div class="l">הלוך ושוב</div></div>
      <div class="score il"><div class="v">${fmt(all.israel)}</div><div class="l">🇮🇱 בישראל</div></div>
    </div>
  </section>
  <section class="card"><h2>הנתונים המלאים</h2>${statTiles(all)}</section>
  <section class="card">
    <div class="row" style="margin-bottom:8px"><h2 style="margin:0">לפי שנת דראפט</h2><span class="spacer"></span>
      <select id="metric" style="width:auto">${Object.entries(METRICS).map(([k, v]) => `<option value="${k}" ${k === metric ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </div>
    <div class="colchart" dir="ltr"><div class="chart-svg"></div><div class="tooltip" hidden></div></div>
  </section>
  <div class="grid-2">
    <section class="card"><h2>קבוצות בישראל</h2>${bars(all.israelTeams, { limit: 15, empty: 'עוד לא סומנו שחקנים בישראל' })}</section>
    <section class="card"><h2>מדינות באירופה</h2>${bars(all.europeCountries, { limit: 15, empty: 'עוד לא הוזנו קבוצות באירופה', flags: true })}</section>
    <section class="card"><h2>קבוצות באירופה</h2>${bars(all.europeTeams, { limit: 15, empty: 'עוד לא הוזנו קבוצות באירופה' })}</section>
    <section class="card"><h2>עונת הגעה לאירופה (אחרי NBA)</h2>${bars(all.arrivalSeasons, { limit: 15 })}</section>
  </div>
  <section class="card">
    <h2>טבלה לפי דראפט</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>דראפט</th><th class="num">נבחרים</th><th class="num">ב-NBA</th><th class="num">מ-NBA לאירופה</th><th class="num">מאירופה ל-NBA</th><th class="num">הלוך ושוב</th><th class="num">באירופה</th><th class="num">ישראל</th><th class="num">נבדקו</th></tr></thead>
      <tbody>${per.slice().reverse().map(({ d, s }) => `<tr data-href="#/draft/${encodeURIComponent(d.id)}" style="cursor:pointer"><td class="big"><a href="#/draft/${encodeURIComponent(d.id)}">${esc(draftTitle(d))}</a></td><td class="num">${s.total}</td><td class="num">${s.playedNba}</td><td class="num">${s.nbaToEurope}</td><td class="num">${s.europeToNba}</td><td class="num">${s.backAndForth}</td><td class="num">${s.europe}</td><td class="num">${s.israel}</td><td class="num">${pct(s.checked, s.total)}%</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;

  $('#metric').onchange = (e) => { ui.statsMetric = e.target.value; viewStats(); };
  $$('tr[data-href]').forEach((tr) => (tr.onclick = () => (location.hash = tr.dataset.href)));
  const chart = $('.colchart');
  const tip = $('.tooltip', chart);
  // Draw at the real pixel width so text isn't stretched on phones.
  const draw = () => {
    $('.chart-svg', chart).innerHTML = columnChart(per.map(({ d, s }) => ({ label: d.year, value: s[metric] })), metric, Math.max(280, chart.clientWidth));
  };
  draw();
  resizeHandler = draw;
  const data = per;
  chart.addEventListener('pointermove', (e) => {
    const t = e.target.closest('[data-i]');
    $$('.col', chart).forEach((c) => c.classList.remove('hover'));
    if (!t) { tip.hidden = true; return; }
    const { d, s } = data[Number(t.dataset.i)];
    $(`.col[data-i="${t.dataset.i}"]`, chart)?.classList.add('hover');
    const box = chart.getBoundingClientRect();
    tip.hidden = false;
    tip.textContent = `${draftTitle(d)}: ${s[ui.statsMetric]} ${METRICS[ui.statsMetric]} (מתוך ${s.total})`;
    tip.style.left = `${Math.min(Math.max(e.clientX - box.left, 60), box.width - 60) - tip.offsetWidth / 2}px`;
    tip.style.top = `${e.clientY - box.top - 8}px`;
    tip.style.transform = 'translateY(-100%)';
  });
  chart.addEventListener('pointerleave', () => { tip.hidden = true; $$('.col', chart).forEach((c) => c.classList.remove('hover')); });
  chart.addEventListener('click', (e) => {
    const t = e.target.closest('[data-i]');
    if (t) location.hash = `#/draft/${encodeURIComponent(data[Number(t.dataset.i)].d.id)}`;
  });
}

// ---------------------------------------------------------------- views: Israel

function viewIsrael() {
  setNav('israel');
  const byTeam = new Map();
  let count = 0;
  for (const p of store.allPlayers()) {
    const a = store.ann(p);
    if (!cameToIsrael(a)) continue;
    count++;
    const st = israelStints(a);
    if (!st.length) st.push({ team: 'ללא קבוצה מוגדרת' });
    for (const s of st) {
      const k = s.team || 'ללא קבוצה מוגדרת';
      if (!byTeam.has(k)) byTeam.set(k, []);
      byTeam.get(k).push({ p, s, a });
    }
  }
  const teamsSorted = [...byTeam.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0], 'he'));
  app.innerHTML = `
  <section class="hero" style="--jumbo:linear-gradient(135deg,#001a5c 0%,#0038b8 60%,#3d6be0 100%)">
    ${COURT_SVG}
    <div class="kicker">ISRAELI BASKETBALL</div>
    <h1>נחתו <span class="accent">בישראל</span> 🇮🇱</h1>
    <p>שחקני דראפט NBA ששיחקו בליגת העל, בלאומית או בארצית — לפי קבוצה.</p>
    <div class="scoreboard">
      <div class="score il"><div class="v">${count}</div><div class="l">שחקנים</div></div>
      <div class="score il"><div class="v">${byTeam.size}</div><div class="l">קבוצות</div></div>
    </div>
  </section>
  ${teamsSorted.length ? `<div class="grid-2 israel-list">${teamsSorted.map(([team, list]) => {
    const info = teams.findIsraeli(team);
    return `<section class="card"><h3><span>${esc(team)}</span><span class="muted small">${info ? esc(ISRAEL_LEAGUES[info.league] || 'היסטורית') + ' · ' : ''}${list.length}</span></h3>
      <ul>${list.sort((x, y) => (x.s.season ?? 9999) - (y.s.season ?? 9999)).map(({ p, s }) => `<li>${teamChip(p.team)}<a class="ltr" style="font-weight:700" href="#/player/${encodeURIComponent(p.id)}">${esc(p.name)}</a> <span class="muted small">— ${stintSeasons(s) ? `\u2066${stintSeasons(s)}\u2069 · ` : ''}${s.league ? ISRAEL_LEAGUES[s.league] + ' · ' : ''}דראפט ${p.year}${p.pick ? ` #${p.pick}` : ''}</span></li>`).join('')}</ul></section>`;
  }).join('')}</div>` : `<div class="card">${empty('NO ROSTER YET', 'עוד לא סומנו שחקנים שהגיעו לישראל.<br>פתח שחקן מתוך דראפט וסמן ״הגיע לישראל״.')}</div>`}`;
}

// ---------------------------------------------------------------- views: search

function viewSearch(params) {
  setNav('search');
  const q = params.get('q') || '';
  const f = params.get('f') || 'all';
  app.innerHTML = `
  <div class="page-head"><h1>חיפוש שחקנים</h1></div>
  <div class="searchbar"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg><input id="q" type="search" placeholder="שם שחקן, מכללה או קבוצה (בכל הדראפטים)" value="${esc(q)}" autofocus></div>
  <div class="chips" style="margin-bottom:12px">${FILTERS.map(([k, label]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${label}</button>`).join('')}</div>
  <section class="card"><ul class="plist" id="results"></ul></section>`;
  const all = store.allPlayers().map((p) => ({ p, key: normalize(`${p.name} ${p.college || ''}`) }));
  let filter = f;
  const run = () => {
    const nq = normalize($('#q').value);
    const fn = FILTERS.find((x) => x[0] === filter)[2];
    const res = all.filter(({ p, key }) => {
      if (nq && !key.includes(nq)) {
        const a = store.ann(p);
        if (!(a?.stints || []).some((s) => normalize(s.team).includes(nq))) return false;
      }
      return fn(p, store.ann(p));
    });
    const shown = !nq && filter === 'all' ? [] : res.slice(0, 200);
    $('#results').innerHTML = shown.length
      ? shown.map(({ p }) => playerRow(p, { showYear: true })).join('') + (res.length > 200 ? `<li class="empty">מוצגים 200 מתוך ${res.length}</li>` : '')
      : `<li>${nq || filter !== 'all' ? empty('AIRBALL', 'לא נמצאו שחקנים') : empty('SCOUTING', 'הקלד שם שחקן, מכללה או קבוצה — או בחר סינון')}</li>`;
    history.replaceState(null, '', `#/search?q=${encodeURIComponent($('#q').value)}&f=${filter}`);
  };
  $('#q').oninput = run;
  $$('.chip', app).forEach((b) => (b.onclick = () => {
    filter = b.dataset.f;
    $$('.chip', app).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    run();
  }));
  run();
}

// ---------------------------------------------------------------- views: settings

const APK_URL = 'https://github.com/danielf2306/NBAPlayersInEuropeAndIsrael/releases/latest/download/nba-draft-europe.apk';

function csvExport() {
  const head = ['draft', 'pick', 'round', 'name', 'nba_team', 'college', 'nba_games', 'nba_seasons', 'path', 'europe_first_season', 'europe_first_team', 'europe_teams', 'israel', 'israel_teams', 'notes'];
  const lines = [head.join(',')];
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  for (const p of store.allPlayers().sort((a, b) => a.year - b.year || (a.pick ?? 1e6) - (b.pick ?? 1e6))) {
    const a = store.ann(p);
    const path = effectivePath(p, a);
    const first = firstArrivalAfterNba(p, a) || firstEuropeArrival(a);
    lines.push([
      p.year, p.pick, p.round, p.name, p.team, p.college, p.nbaGames, nbaSeasons(p, { isolate: false }), path ? PATHS[path].label : '',
      first && first.season != null ? seasonLabel(first.season) : '', first?.team || '',
      sortStints(europeStints(a)).map((s) => `${stintSeasons(s) ? stintSeasons(s) + ' ' : ''}${s.team} (${s.country})`).join('; '),
      a?.israel === false ? 'לא' : cameToIsrael(a) ? 'כן' : '',
      sortStints(israelStints(a)).map((s) => `${stintSeasons(s) ? stintSeasons(s) + ' ' : ''}${s.team}${s.league ? ` (${ISRAEL_LEAGUES[s.league]})` : ''}`).join('; '),
      a?.notes || '',
    ].map(q).join(','));
  }
  return download(`nba-drafts-europe-israel-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + lines.join('\n'), 'text/csv;charset=utf-8');
}

function viewSettings() {
  setNav('settings');
  const s = sync.getSettings();
  const c = store.counts();
  const theme = localStorage.getItem('nbaeu:theme') || 'auto';
  app.innerHTML = `
  <div class="page-head"><h1>הגדרות</h1></div>

  <section class="card">
    <h2>סנכרון בין הטלפון למחשב</h2>
    <p class="small">הנתונים נשמרים בכל מכשיר בנפרד. הסנכרון שומר עותק ב-Gist פרטי בחשבון ה-GitHub שלך, וכל מכשיר שמחובר עם אותו טוקן רואה את אותם נתונים. אחרי החיבור הכל אוטומטי.</p>
    ${sync.enabled() ? '' : `
    <ol class="small steps">
      <li><a href="https://github.com/settings/tokens/new?scopes=gist&description=NBA%20Draft%20Europe%20sync" target="_blank" rel="noopener"><strong>לחץ כאן ליצירת טוקן ב-GitHub ↗</strong></a> (צריך להיות מחובר ל-GitHub).</li>
      <li>ב-<b>Expiration</b> בחר <b>No expiration</b>. התיבה <b>gist</b> כבר מסומנת — לא לסמן שום דבר אחר.</li>
      <li>גלול למטה ולחץ <b>Generate token</b>, ואז העתק את הטוקן (מתחיל ב-<span class="kbd ltr">ghp_</span>). <b>שמור אותו</b> (למשל בהודעה לעצמך) — GitHub מציג אותו פעם אחת בלבד, ותצטרך אותו גם במכשיר השני.</li>
      <li>הדבק אותו כאן ולחץ <b>התחברות וסנכרון</b>.</li>
      <li>במכשיר השני (אתר / אפליקציה): הגדרות ← אותו טוקן ← התחברות. הנתונים יתמזגו אוטומטית.</li>
    </ol>`}
    ${sync.enabled() ? `
      <p>מחובר ✓ · Gist: <span class="ltr kbd">${esc(s.gistId)}</span><br><span class="muted small">סנכרון אחרון: ${s.lastSync ? new Date(s.lastSync).toLocaleString('he-IL') : '—'}</span></p>
      <div class="row"><button class="btn primary" id="sync-now">סנכרן עכשיו</button><button class="btn danger" id="sync-off">ניתוק</button></div>`
    : `
      <div class="form-grid">
        <label class="field wide">טוקן GitHub<input id="tok" type="password" dir="ltr" placeholder="ghp_… / github_pat_…" autocomplete="off"></label>
        <details class="wide small"><summary class="muted">מתקדם</summary><label class="field" style="margin-top:6px">Gist ID (לא חובה — יימצא או ייווצר אוטומטית)<input id="gid" dir="ltr"></label></details>
      </div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="sync-on">התחברות וסנכרון</button></div>`}
  </section>

  <section class="card">
    <h2>גיבוי וייצוא</h2>
    <p class="small muted">${c.annotations} שחקנים עם נתונים · ${c.customDrafts} דראפטים ידניים · ${c.customPlayers} שחקנים שהוספת · ${c.playerEdits} עריכות</p>
    <div class="row">
      <button class="btn" id="export-json">ייצוא גיבוי (JSON)</button>
      <label class="btn">ייבוא גיבוי<input type="file" id="import-json" accept="application/json,.json" hidden></label>
      <button class="btn" id="export-csv">ייצוא לאקסל (CSV)</button>
    </div>
    <p class="hint">ייבוא ממזג: לכל שחקן נשמרת הגרסה העדכנית ביותר.</p>
  </section>

  <section class="card">
    <h2>תצוגה</h2>
    <div class="segmented" id="theme">
      <button type="button" data-t="auto" aria-pressed="${theme === 'auto'}">לפי המכשיר</button>
      <button type="button" data-t="light" aria-pressed="${theme === 'light'}">בהיר</button>
      <button type="button" data-t="dark" aria-pressed="${theme === 'dark'}">כהה</button>
    </div>
  </section>

  ${isNative() ? `
  <section class="card">
    <h2>אפליקציית אנדרואיד</h2>
    <p class="small">הנתונים נשמרים בטלפון. <strong>הסרת האפליקציה מוחקת אותם</strong> — הפעל סנכרון או ייצא גיבוי מדי פעם.<br>
    גרסה חדשה: הורד את קובץ ה-APK העדכני והתקן מעל הקיים — הנתונים נשמרים.</p>
    <a class="btn" href="${APK_URL}" target="_blank" rel="noopener">הורדת הגרסה האחרונה ↗</a>
  </section>` : `
  <section class="card">
    <h2>התקנה כאפליקציה בטלפון</h2>
    <p class="small"><strong>אנדרואיד — אפליקציה (APK):</strong> הורד את הקובץ, פתח אותו ואשר ״התקנה ממקורות לא ידועים״.<br>
    <strong>אייפון:</strong> פתח את האתר ב-Safari ← כפתור השיתוף ← ״הוסף למסך הבית״.<br>
    <strong>אנדרואיד בלי APK:</strong> פתח ב-Chrome ← תפריט ⋮ ← ״התקנת אפליקציה״.<br>
    האפליקציה עובדת גם בלי אינטרנט.</p>
    <div class="row"><a class="btn primary" href="${APK_URL}">הורדת APK לאנדרואיד</a>${installPrompt ? '<button class="btn" id="install">התקנה מהדפדפן</button>' : ''}</div>
  </section>`}

  <section class="card">
    <h2>מקורות</h2>
    <p class="small">דראפטים 1980–${Math.max(...store.drafts().filter((d) => !d.custom).map((d) => d.year))} ומשחקי NBA: ${esc(store.sourceInfo().source)}, עודכן ${esc(store.sourceInfo().generated)}.<br>
    רשימות הקבוצות (ליגת העל, לאומית, ארצית ומועדוני אירופה) מובנות באפליקציה; כל קבוצה חדשה שתקליד תתווסף אוטומטית להשלמה.</p>
  </section>

  <section class="card">
    <h2>איפוס</h2>
    <button class="btn danger" id="reset">מחיקת כל הנתונים שלי במכשיר הזה</button>
  </section>`;

  if (sync.enabled()) {
    $('#sync-now').onclick = () => sync.syncNow().then(viewSettings);
    $('#sync-off').onclick = () => { if (confirm('לנתק את הסנכרון? הנתונים יישארו במכשיר.')) { sync.disconnect(); viewSettings(); } };
  } else {
    $('#sync-on').onclick = async () => {
      const tok = $('#tok').value.trim();
      if (!tok) return toast('הדבק טוקן');
      try {
        await sync.connect(tok, $('#gid').value);
        toast('מחובר ומסונכרן');
      } catch (e) {
        toast(`שגיאה: ${e.message}`);
      }
      route();
    };
  }
  const fail = (e) => toast(`הייצוא נכשל: ${e.message}`);
  $('#export-json').onclick = () => download(`nba-europe-israel-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(store.snapshot(), null, 1)).catch(fail);
  $('#export-csv').onclick = () => csvExport().catch(fail);
  $('#import-json').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const changed = store.mergeIn(JSON.parse(await file.text()), 'local');
      toast(changed ? 'הגיבוי יובא ומוזג' : 'אין שינויים — הכל כבר קיים');
      viewSettings();
    } catch (err) {
      toast(`ייבוא נכשל: ${err.message}`);
    }
  };
  $$('#theme button').forEach((b) => (b.onclick = () => { setTheme(b.dataset.t); viewSettings(); }));
  $('#install')?.addEventListener('click', async () => { installPrompt.prompt(); installPrompt = null; });
  $('#reset').onclick = () => {
    if (confirm('למחוק את כל הסימונים, הדראפטים הידניים והעריכות במכשיר הזה? (אם יש סנכרון — הנתונים בענן יחזרו בסנכרון הבא)')) {
      store.resetAll();
      toast('נמחק');
      viewSettings();
    }
  };
}

function setTheme(t) {
  localStorage.setItem('nbaeu:theme', t);
  applyTheme();
}

function applyTheme() {
  const t = localStorage.getItem('nbaeu:theme') || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
  syncSystemBars();
}

// ---------------------------------------------------------------- router

function notFound() {
  app.innerHTML = `<div class="card">${empty('OUT OF BOUNDS', 'הדף לא נמצא. <a href="#/">חזרה לדראפטים</a>')}</div>`;
}

let lastRoute = '';
function route() {
  pendingSave?.();
  resizeHandler = null;
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  const changedPage = path !== lastRoute;
  lastRoute = path;
  switch (parts[0]) {
    case undefined: viewDrafts(); break;
    case 'draft': viewDraft(parts[1]); break;
    case 'player': viewPlayer(parts[1]); break;
    case 'stats': viewStats(); break;
    case 'israel': viewIsrael(); break;
    case 'search': viewSearch(params); break;
    case 'settings': viewSettings(); break;
    default: notFound();
  }
  if (changedPage) window.scrollTo(0, 0);
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

async function main() {
  applyTheme();
  try {
    await Promise.all([store.init(), teams.init()]);
  } catch (e) {
    app.innerHTML = `<div class="card empty">שגיאה בטעינת הנתונים: ${esc(e.message)}</div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', () => pendingSave?.());
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => resizeHandler?.(), 150); });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && pendingSave?.());
  route();

  // Re-render when data arrives from another device, unless the user is typing.
  store.onChange((origin) => {
    if (origin !== 'sync') return;
    const typing = document.activeElement && app.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!typing) route();
  });
  const badge = document.getElementById('sync-badge');
  sync.onStatus(({ state, message }) => {
    badge.hidden = state === 'off' || state === 'idle';
    badge.dataset.state = state;
    badge.textContent = state === 'ok' ? '☁ מסונכרן' : state === 'error' ? '☁ שגיאת סנכרון' : '☁ מסנכרן…';
    badge.title = message;
  });
  sync.start();

  // The Android app ships its files inside the APK, so it needs no service worker.
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isNative()) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('sw', e));
  }
}

main();

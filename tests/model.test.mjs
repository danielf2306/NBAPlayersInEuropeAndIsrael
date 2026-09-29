import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePath, effectivePath, cameToIsrael, isChecked, draftStats, mergeState,
  parsePastedPlayers, normalize, seasonLabel, firstArrivalAfterNba, ISRAEL, stintPhase, pathFlags, stintSeasons,
} from '../js/model.js';

// nbaFrom/nbaTo are season end years; stint.season is a start year.
const dirk = { id: '1998-9', name: 'Dirk Nowitzki', nbaGames: 1522, nbaFrom: 1999, nbaTo: 2019, round: 1 };
const bust = { id: '1990-50', name: 'Nobody', nbaGames: 0, round: 2 };

test('season labels', () => {
  assert.equal(seasonLabel(1998), '1998/99');
  assert.equal(seasonLabel(1999), '1999/00');
  assert.equal(seasonLabel(''), '');
});

test('path: Europe before NBA', () => {
  const a = { stints: [{ season: 1994, team: 'DJK Würzburg', country: 'גרמניה' }] };
  assert.equal(computePath(dirk, a), 'eu_nba');
});

test('path: NBA then Europe', () => {
  assert.equal(computePath(dirk, { stints: [{ season: 2019, team: 'X', country: 'ספרד' }] }), 'nba_eu');
  // the last NBA season itself counts as leaving the NBA
  assert.equal(computePath(dirk, { stints: [{ season: 2018, team: 'X', country: 'ספרד' }] }), 'nba_eu');
});

test('path: Europe during the rookie season counts as coming from Europe', () => {
  assert.equal(computePath(dirk, { stints: [{ season: 1998, team: 'DJK Würzburg', country: 'גרמניה' }] }), 'eu_nba');
});

test('path: NBA, Europe, back to the NBA (Europe season before the last NBA season)', () => {
  const jbc = { id: '1980-1', name: 'Joe Barry Carroll', nbaGames: 705, nbaFrom: 1981, nbaTo: 1991, nbaRuns: [[1981, 1984], [1986, 1991]] };
  const a = { stints: [{ season: 1984, team: 'Simac Milano', country: 'איטליה' }] };
  assert.equal(computePath(jbc, a), 'nba_eu_nba');
  assert.equal(stintPhase(jbc, a.stints[0]), 'middle');
  assert.equal(firstArrivalAfterNba(jbc, a).team, 'Simac Milano');
  const f = pathFlags('nba_eu_nba');
  assert.ok(f.nbaToEurope && f.europeToNba && f.europe);
  // and ending the career in Europe too still counts as "came back to the NBA"
  assert.equal(computePath(jbc, { stints: [...a.stints, { season: 1991, team: 'X', country: 'יוון' }] }), 'nba_eu_nba');
  // one-season NBA player who went to Europe the same season: left the NBA
  assert.equal(computePath({ nbaGames: 5, nbaFrom: 2000, nbaTo: 2000 }, { stints: [{ season: 1999, team: 'X', country: 'יוון' }] }), 'nba_eu');
});

test('path: back and forth, Israel counts as Europe', () => {
  const a = { stints: [{ season: 1995, team: 'A', country: 'יוון' }, { season: 2020, team: 'מכבי תל אביב', country: ISRAEL }] };
  assert.equal(computePath(dirk, a), 'eu_nba_eu');
});

test('path: no NBA games', () => {
  assert.equal(computePath(bust, { stints: [] }), '');
  assert.equal(computePath(bust, { stints: [{ season: 1991, team: 'X', country: 'איטליה' }] }), 'eu_only');
});

test('path: unknown season leaves path undecided, manual override wins', () => {
  assert.equal(computePath(dirk, { stints: [{ team: 'X', country: 'ספרד' }] }), '');
  assert.equal(effectivePath(dirk, { path: 'nba_only', stints: [] }), 'nba_only');
});

test('israel flags and checked state', () => {
  assert.equal(cameToIsrael({ stints: [{ team: 'הפועל חולון', country: ISRAEL }] }), true);
  assert.equal(cameToIsrael({ israel: true, stints: [] }), true);
  assert.equal(cameToIsrael({ israel: false, stints: [] }), false);
  assert.equal(isChecked(dirk, null), false);
  assert.equal(isChecked(dirk, { israel: false, stints: [] }), true);
});

test('first arrival after NBA', () => {
  const a = { stints: [{ season: 1995, team: 'Early', country: 'גרמניה' }, { season: 2021, team: 'Late', country: 'ספרד' }] };
  assert.equal(firstArrivalAfterNba(dirk, a).team, 'Late');
});

test('draft stats', () => {
  const rows = [
    { player: dirk, ann: { stints: [{ season: 2019, team: 'Real Madrid', country: 'ספרד' }, { season: 2020, team: 'מכבי תל אביב', country: ISRAEL, league: 'winner' }] } },
    { player: { ...dirk, id: 'b' }, ann: { stints: [{ season: 1990, team: 'Partizan', country: 'סרביה' }] } },
    { player: bust, ann: null },
  ];
  const s = draftStats(rows);
  assert.equal(s.total, 3);
  assert.equal(s.playedNba, 2);
  assert.equal(s.nbaToEurope, 1);
  assert.equal(s.europeToNba, 1);
  assert.equal(s.israel, 1);
  assert.equal(s.checked, 2);
  assert.deepEqual(s.israelTeams, [['מכבי תל אביב', 1]]);
  assert.deepEqual(s.arrivalSeasons, [['2019/20', 1]]);
  assert.equal(s.byRound.find((r) => r.round === 2).total, 1);
});

test('merge keeps the newest record per key', () => {
  const local = { annotations: { a: { notes: 'old', updatedAt: 1 }, b: { notes: 'mine', updatedAt: 5 } }, customDrafts: {}, customPlayers: {}, playerEdits: {} };
  const remote = { annotations: { a: { notes: 'new', updatedAt: 2 }, b: { notes: 'theirs', updatedAt: 3 }, c: { updatedAt: 1 } } };
  const m = mergeState(local, remote);
  assert.equal(m.annotations.a.notes, 'new');
  assert.equal(m.annotations.b.notes, 'mine');
  assert.ok(m.annotations.c);
});

test('paste parser', () => {
  const rows = parsePastedPlayers('Player\tTm\n1, Cooper Flagg, DAL, Duke\n2\t2\tSAS\tDylan Harper\tRutgers\nJust A Name\n\n');
  assert.deepEqual(rows[0], { pick: 1, name: 'Cooper Flagg', team: 'DAL', college: 'Duke' });
  assert.deepEqual(rows[1], { pick: 2, name: 'Dylan Harper', team: 'SAS', college: 'Rutgers' });
  assert.deepEqual(rows[2], { pick: null, name: 'Just A Name', team: '', college: '' });
  assert.equal(rows.length, 3);
});

test('normalize handles accents, final letters and quotes', () => {
  assert.equal(normalize('Luka Dončić'), 'luka doncic');
  assert.equal(normalize('מכבי ראשל"צ'), normalize('מכבי ראשלצ'));
  assert.ok(normalize('הפועל ירושלים').includes('ירושלימ'));
});

test('stint season ranges', () => {
  assert.equal(stintSeasons({ season: 1984 }), '1984/85');
  assert.equal(stintSeasons({ season: 1984, until: 1986 }), '1984/85–1986/87');
  assert.equal(stintSeasons({ season: 1984, until: 1984 }), '1984/85');
  assert.equal(stintSeasons({ season: 1984, until: 1980 }), '1984/85');
  assert.equal(stintSeasons({ team: 'X' }), '');
});

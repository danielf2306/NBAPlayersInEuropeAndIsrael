import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickArticle, articleUrl, lookupUrl } from '../js/wiki.js';

test('picks the matching article and its Hebrew link', () => {
  const json = { query: { pages: [
    { title: 'Dallas Mavericks', index: 2 },
    { title: 'Dirk Nowitzki', index: 1, langlinks: [{ lang: 'he', title: 'דירק נוביצקי' }] },
  ] } };
  const r = pickArticle(json, 'Dirk Nowitzki');
  assert.equal(r.en.title, 'Dirk Nowitzki');
  assert.equal(r.en.url, 'https://en.wikipedia.org/wiki/Dirk_Nowitzki');
  assert.equal(r.he.title, 'דירק נוביצקי');
  assert.ok(r.he.url.startsWith('https://he.wikipedia.org/wiki/'));
});

test('matches names with accents and skips unrelated/disambiguation pages', () => {
  const json = { query: { pages: [
    { title: 'Jason Williams (disambiguation)', index: 1 },
    { title: 'Jason Williams (basketball, born 1975)', index: 2 },
  ] } };
  assert.equal(pickArticle(json, 'Jason Williams').en.title, 'Jason Williams (basketball, born 1975)');
  const luka = { query: { pages: [{ title: 'Luka Dončić', index: 1 }] } };
  assert.equal(pickArticle(luka, 'Luka Doncic').en.title, 'Luka Dončić');
  assert.equal(pickArticle(luka, 'Luka Dončić').he, null);
});

test('no plausible article → null', () => {
  assert.equal(pickArticle({ query: { pages: [{ title: 'Kansas Jayhawks men\'s basketball', index: 1 }] } }, 'Joe Smith'), null);
  assert.equal(pickArticle({}, 'Joe Smith'), null);
});

test('urls', () => {
  assert.equal(articleUrl('en', "Shaquille O'Neal"), "https://en.wikipedia.org/wiki/Shaquille_O'Neal");
  const u = new URL(lookupUrl('Omri Casspi'));
  assert.equal(u.searchParams.get('origin'), '*');
  assert.equal(u.searchParams.get('gsrsearch'), 'Omri Casspi basketball');
  assert.equal(u.searchParams.get('lllang'), 'he');
});

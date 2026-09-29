// Finds a player's Wikipedia article (English + Hebrew when it exists) through the
// public MediaWiki API, which allows cross-origin requests with origin=*.
import { normalize } from './model.js';

const CACHE_KEY = 'nbaeu:wiki:v1';
const MISS_TTL = 7 * 24 * 3600 * 1000; // retry "not found" after a week

export function articleUrl(lang, title) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

export function searchUrl(name, lang = 'en') {
  const q = lang === 'en' ? `${name} basketball` : name;
  return `https://${lang}.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`;
}

export function lookupUrl(name) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*',
    generator: 'search', gsrsearch: `${name} basketball`, gsrlimit: '5', gsrnamespace: '0',
    prop: 'langlinks', lllang: 'he', lllimit: 'max',
  });
  return `https://en.wikipedia.org/w/api.php?${params}`;
}

/**
 * Pick the best search hit: the highest-ranked article whose title contains the
 * player's first and last name (ignoring accents), e.g. "Jason Williams (basketball, born 1975)".
 */
export function pickArticle(json, name) {
  const pages = [...(json?.query?.pages || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const words = normalize(name).split(' ').filter((w) => w.length > 1);
  const first = words[0];
  const last = words[words.length - 1];
  const hit = pages.find((p) => {
    const t = normalize(p.title);
    return t.includes(last) && (!first || t.includes(first)) && !/disambiguation|list of|draft/.test(t);
  });
  if (!hit) return null;
  const he = (hit.langlinks || []).find((l) => l.lang === 'he');
  const heTitle = he?.title ?? he?.['*'];
  return {
    en: { title: hit.title, url: articleUrl('en', hit.title) },
    he: heTitle ? { title: heTitle, url: articleUrl('he', heTitle) } : null,
  };
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}

function writeCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full: skip caching */ }
}

/** Resolves to {en, he} or null. Results are cached per player on this device. */
export async function lookup(key, name, fetchFn = fetch) {
  const cache = readCache();
  const hit = cache[key];
  if (hit && (hit.found || Date.now() - hit.t < MISS_TTL)) return hit.found || null;
  const res = await fetchFn(lookupUrl(name));
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const found = pickArticle(await res.json(), name);
  cache[key] = { found, t: Date.now() };
  writeCache(cache);
  return found;
}

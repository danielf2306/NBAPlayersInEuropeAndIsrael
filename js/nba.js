// Visual flavour: NBA team colours (by Basketball-Reference code) and country flags.
import { esc } from './dom.js';

// [primary, secondary, full name]
export const TEAMS = {
  ATL: ['#E03A3E', '#C1D32F', 'Atlanta Hawks'],
  BOS: ['#007A33', '#BA9653', 'Boston Celtics'],
  BRK: ['#000000', '#FFFFFF', 'Brooklyn Nets'],
  NJN: ['#002A60', '#CD1041', 'New Jersey Nets'],
  CHA: ['#1D1160', '#00788C', 'Charlotte Bobcats'],
  CHO: ['#1D1160', '#00788C', 'Charlotte Hornets'],
  CHH: ['#00778B', '#1D1160', 'Charlotte Hornets'],
  CHI: ['#CE1141', '#000000', 'Chicago Bulls'],
  CLE: ['#860038', '#FDBB30', 'Cleveland Cavaliers'],
  DAL: ['#00538C', '#B8C4CA', 'Dallas Mavericks'],
  DEN: ['#0E2240', '#FEC524', 'Denver Nuggets'],
  DET: ['#C8102E', '#1D42BA', 'Detroit Pistons'],
  GSW: ['#1D428A', '#FFC72C', 'Golden State Warriors'],
  HOU: ['#CE1141', '#000000', 'Houston Rockets'],
  IND: ['#002D62', '#FDBB30', 'Indiana Pacers'],
  KCK: ['#E03A3E', '#002B5C', 'Kansas City Kings'],
  LAC: ['#C8102E', '#1D428A', 'Los Angeles Clippers'],
  SDC: ['#EF3E42', '#006BB6', 'San Diego Clippers'],
  LAL: ['#552583', '#FDB927', 'Los Angeles Lakers'],
  MEM: ['#12173F', '#5D76A9', 'Memphis Grizzlies'],
  VAN: ['#00807A', '#E43C40', 'Vancouver Grizzlies'],
  MIA: ['#98002E', '#F9A01B', 'Miami Heat'],
  MIL: ['#00471B', '#EEE1C6', 'Milwaukee Bucks'],
  MIN: ['#0C2340', '#78BE20', 'Minnesota Timberwolves'],
  NOH: ['#00778B', '#1D1160', 'New Orleans Hornets'],
  NOK: ['#00778B', '#1D1160', 'New Orleans/Oklahoma City Hornets'],
  NOP: ['#0C2340', '#C8102E', 'New Orleans Pelicans'],
  NYK: ['#006BB6', '#F58426', 'New York Knicks'],
  OKC: ['#007AC1', '#EF3B24', 'Oklahoma City Thunder'],
  SEA: ['#00653A', '#FFC200', 'Seattle SuperSonics'],
  ORL: ['#0077C0', '#C4CED4', 'Orlando Magic'],
  PHI: ['#006BB6', '#ED174C', 'Philadelphia 76ers'],
  PHO: ['#1D1160', '#E56020', 'Phoenix Suns'],
  POR: ['#E03A3E', '#000000', 'Portland Trail Blazers'],
  SAC: ['#5A2D81', '#63727A', 'Sacramento Kings'],
  SAS: ['#000000', '#C4CED4', 'San Antonio Spurs'],
  TOR: ['#CE1141', '#000000', 'Toronto Raptors'],
  UTA: ['#002B5C', '#F9A01B', 'Utah Jazz'],
  WAS: ['#002B5C', '#E31837', 'Washington Wizards'],
  WSB: ['#E31837', '#002B5C', 'Washington Bullets'],
};

export function teamColors(code) {
  return TEAMS[code] || ['#1D428A', '#C8102E', code || ''];
}

export function teamChip(code) {
  if (!code) return '';
  const [a, b, name] = teamColors(code);
  return `<span class="team-chip" style="--t1:${a};--t2:${b}" title="${esc(name)}">${esc(code)}</span>`;
}

export const FLAGS = {
  'ישראל': '🇮🇱', 'ספרד': '🇪🇸', 'איטליה': '🇮🇹', 'יוון': '🇬🇷', 'טורקיה': '🇹🇷', 'צרפת': '🇫🇷',
  'גרמניה': '🇩🇪', 'רוסיה': '🇷🇺', 'ליטא': '🇱🇹', 'סרביה': '🇷🇸', 'קרואטיה': '🇭🇷', 'סלובניה': '🇸🇮',
  'מונטנגרו': '🇲🇪', 'בוסניה והרצגובינה': '🇧🇦', 'צפון מקדוניה': '🇲🇰', 'פולין': '🇵🇱', "צ'כיה": '🇨🇿',
  'סלובקיה': '🇸🇰', 'הונגריה': '🇭🇺', 'רומניה': '🇷🇴', 'בולגריה': '🇧🇬', 'קפריסין': '🇨🇾', 'אוקראינה': '🇺🇦',
  'בלארוס': '🇧🇾', 'לטביה': '🇱🇻', 'אסטוניה': '🇪🇪', 'פינלנד': '🇫🇮', 'שוודיה': '🇸🇪', 'נורווגיה': '🇳🇴',
  'דנמרק': '🇩🇰', 'הולנד': '🇳🇱', 'בלגיה': '🇧🇪', 'שווייץ': '🇨🇭', 'אוסטריה': '🇦🇹', 'פורטוגל': '🇵🇹',
  'בריטניה': '🇬🇧', 'אנגליה': '🏴', 'אירלנד': '🇮🇪', 'גאורגיה': '🇬🇪', 'איסלנד': '🇮🇸', 'אלבניה': '🇦🇱',
  'קוסובו': '🇽🇰', "אזרבייג'ן": '🇦🇿', 'לוקסמבורג': '🇱🇺', 'יוגוסלביה': '🇷🇸', 'ברית המועצות': '🇷🇺',
  'ארמניה': '🇦🇲', 'מולדובה': '🇲🇩', 'מלטה': '🇲🇹', 'ליבנון': '🇱🇧',
};

export const COUNTRIES = Object.keys(FLAGS).filter((c) => !['אנגליה'].includes(c));

export function flag(country) {
  return FLAGS[country] || '🌍';
}

// Draft eras give each decade its own accent colour.
export function eraClass(year) {
  const dec = Math.floor(Number(year) / 10) * 10;
  return `era-${dec >= 1980 && dec <= 2020 ? dec : 'x'}`;
}

/** Jersey-shaped pick number. */
export function jersey(pick, round) {
  const n = pick ?? '–';
  return `<span class="jersey r${round || 0}" aria-label="בחירה ${esc(n)}"><svg viewBox="0 0 40 44" aria-hidden="true"><path d="M10 1H15Q20 9 25 1H30Q31 12 38 14V43H2V14Q9 12 10 1Z"/></svg><b>${esc(n)}</b></span>`;
}

export const BALL_SVG = `<svg class="ball" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--ball)"/><g fill="none" stroke="var(--ball-seam)" stroke-width="2.6" stroke-linecap="round"><circle cx="32" cy="32" r="30"/><path d="M2 32h60M32 2v60M11 11c12 11 12 31 0 42M53 11c-12 11-12 31 0 42"/></g></svg>`;

/** Faint half-court lines used behind heroes. */
export const COURT_SVG = `<svg class="court" viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3"><rect x="4" y="4" width="592" height="292"/><line x1="300" y1="4" x2="300" y2="296"/><circle cx="300" cy="150" r="48"/><circle cx="300" cy="150" r="16"/><rect x="4" y="94" width="116" height="112"/><circle cx="120" cy="150" r="36"/><path d="M4 22h56a150 150 0 010 256H4"/><rect x="480" y="94" width="116" height="112"/><circle cx="480" cy="150" r="36"/><path d="M596 22h-56a150 150 0 000 256h56"/></g></svg>`;

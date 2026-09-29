/**
 * The press (Centuria 2.0 §E). Turns log lines into newspaper items whose
 * register tracks the century — broadsheet, wire service, broadcast, feed —
 * and whose foreign voices keep each nation's character.
 */
import { expand, type Grammar } from './grammar';
import { hash01 } from '../rng';
import type { NationVoice } from '../procgen/nation';

export type PressRegister = 'broadsheet' | 'wire' | 'broadcast' | 'feed';
export type NewsCategory =
  | 'war' | 'peace' | 'diplomacy' | 'frontier' | 'world' | 'economy' | 'unrest' | 'domestic' | 'reaction';

export function registerFor(year: number): PressRegister {
  if (year < 1946) return 'broadsheet';
  if (year < 1976) return 'wire';
  if (year < 2006) return 'broadcast';
  return 'feed';
}

const MASTHEAD: Record<PressRegister, readonly string[]> = {
  broadsheet: ['The #place# Gazette', 'The #place# Courier', 'The #place# Herald', 'The Morning #place#'],
  wire: ['#place# Evening Standard', 'The #place# Tribune', '#place# Wire Service', 'The Daily #place#'],
  broadcast: ['#place# Broadcasting', 'Channel #num# #place#', 'The #place# Nightly', '#place# News Network'],
  feed: ['#place#Now', 'Feed · #place#', '#place# Live', 'Pulse #place#'],
};

export function masthead(year: number, place: string, seed: number): string {
  const reg = registerFor(year);
  const opts = MASTHEAD[reg];
  const pick = opts[Math.floor(hash01(seed, reg, 'mast') * opts.length)];
  return pick.replace('#place#', place.replace(/\s+/g, reg === 'feed' ? '' : ' ')).replace('#num#', String(2 + Math.floor(hash01(seed, 'ch') * 8)));
}

/** Headline grammars per register; `#who#` is the story's subject. */
const HEADLINES: Record<PressRegister, Grammar> = {
  broadsheet: {
    war: ['WAR! #who.upper# TAKES UP ARMS', 'GRAVE NEWS: HOSTILITIES WITH #who.upper#', 'THE GUNS SPEAK — #who.upper#'],
    peace: ['PEACE SIGNED WITH #who.upper#', 'THE GUNS FALL SILENT', 'ARMISTICE: TERMS WITH #who.upper#'],
    diplomacy: ['DIPLOMATIC NOTE FROM #who.upper#', '#who.upper#: THE CHANCERIES STIR', 'ENVOYS BUSY OVER #who.upper#'],
    frontier: ['THE FRONTIER MOVES', 'BORDER NEWS: #who.upper#', 'LINES REDRAWN ON THE MAP'],
    world: ['FROM ABROAD: #who.upper#', 'WORLD AFFAIRS — #who.upper#', 'CABLES FROM THE CONTINENT'],
    economy: ['MARKETS AND MONEY', 'THE EXCHEQUER REPORTS', 'TRADE INTELLIGENCE'],
    unrest: ['DISORDER IN THE STREETS', 'THE MOB AND THE MINISTRY', 'UNREST SPREADS'],
    domestic: ['AT HOME', 'NEWS OF THE REALM', 'FROM THE PROVINCES'],
    reaction: ['#who.upper# RESPONDS', 'WORD FROM #who.upper#', '#who.upper# SPEAKS'],
  },
  wire: {
    war: ['#who# at war — front reports', 'Fighting erupts with #who#', 'Troops move against #who#'],
    peace: ['Peace deal struck with #who#', 'Ceasefire holds with #who#', 'Talks end war with #who#'],
    diplomacy: ['#who# in diplomatic manoeuvre', 'Embassy row: #who#', 'Foreign ministers meet on #who#'],
    frontier: ['Border redrawn near #who#', 'Frontier shift reported', 'Map changes on the border'],
    world: ['#who# — world roundup', 'Overseas: #who#', 'International desk: #who#'],
    economy: ['Economy watch', 'Business desk', 'Market report'],
    unrest: ['Unrest flares', 'Strikes and protests', 'Police and protesters clash'],
    domestic: ['Home news', 'National desk', 'Around the country'],
    reaction: ['#who# reacts', 'Statement from #who#', '#who# issues response'],
  },
  broadcast: {
    war: ['Tonight: war with #who#', 'Conflict with #who# — live coverage', 'Breaking: fighting with #who#'],
    peace: ['Peace with #who# — what it means', 'The war with #who# is over', 'Deal signed: #who#'],
    diplomacy: ['#who# and us: the diplomatic picture', 'Summit watch: #who#', 'Diplomacy: #who# makes a move'],
    frontier: ['The shifting border', 'Borderlands: a changing map', 'Territory report'],
    world: ['World tonight: #who#', 'Around the globe: #who#', 'Foreign report: #who#'],
    economy: ['Your money tonight', 'Economic outlook', 'Markets close'],
    unrest: ['Unrest on our streets', 'Protest special', 'A nation divided?'],
    domestic: ['At home tonight', 'National report', 'Across the nation'],
    reaction: ['#who# responds', '#who# on the record', 'Reaction from #who#'],
  },
  feed: {
    war: ['🔴 LIVE: war with #who#', 'War with #who# — what we know', '#who# conflict: live updates'],
    peace: ['#who# peace deal: explained', 'It is over: peace with #who#', 'Peace with #who# — the reaction'],
    diplomacy: ['#who# thread 🧵', '#who# just made a move', 'Diplomatic drama: #who#'],
    frontier: ['Border map update 🗺', 'The border just moved', 'Territory shift: the numbers'],
    world: ['Trending abroad: #who#', 'World: #who#', '#who# is trending'],
    economy: ['Markets 📉📈', 'Your wallet, explained', 'Economy update'],
    unrest: ['Protests: live', 'Unrest — latest', 'Streets erupt'],
    domestic: ['Around the country', 'Local updates', 'National feed'],
    reaction: ['#who# responds 👀', '#who# statement goes viral', 'Everyone is quoting #who#'],
  },
};

export function headline(cat: NewsCategory, who: string, year: number, key: string): string {
  const g = HEADLINES[registerFor(year)];
  return expand(g, `#${cat}#`, key, { who });
}

const VOICE_LEAD: Record<NationVoice, readonly string[]> = {
  formal: ['In a formal note, ', 'Through official channels, ', 'In a measured communiqué, '],
  bombastic: ['In a thundering address, ', 'Before a roaring crowd, ', 'With characteristic bluster, '],
  terse: ['', 'Briefly: ', 'Without elaboration: '],
  florid: ['In a statement of some length, ', 'With considerable ornament, ', 'In verse-heavy prose, '],
};

export function voiceLead(voice: NationVoice | undefined, key: string): string {
  if (!voice) return '';
  const opts = VOICE_LEAD[voice];
  return opts[Math.floor(hash01(key, 'voice') * opts.length)];
}

const PREFIX_CATEGORY: readonly [RegExp, NewsCategory][] = [
  [/^(WAR|BATTLE|CAMPAIGN|MOBILI[SZ]ATION|DISMEMBERED|INVASION|OCCUPATION)/i, 'war'],
  [/^(PEACE|ARMISTICE|CEASEFIRE)/i, 'peace'],
  [/^(SANCTIONS|TREATY|ENTENTE|ALLIANCE|EMBASSY|ENVOY|NEGOTIATION|COALITION|ULTIMATUM|BLOC|ESPIONAGE)/i, 'diplomacy'],
  [/^(FRONTIER|SECESSION|CLAIM)/i, 'frontier'],
  [/^(A NEW POWER|REVOLUTION|REGIME CHANGE|FIRST CONTACT|WORLD|FOREIGN)/i, 'world'],
  [/^(MARKET|CRASH|DEPRESSION|INFLATION|DEFAULT|BANK|CURRENCY|TRADE|BOOM|RECESSION)/i, 'economy'],
  [/^(STRIKE|RIOT|PROTEST|UNREST|REVOLT|UPRISING|CRACKDOWN)/i, 'unrest'],
];

export function classify(text: string): { cat: NewsCategory; body: string } {
  const m = /^([A-Z][A-Za-z' ]{1,40}?)(?: of [^:]{1,40}| in [^:]{1,40})?:\s+(.*)$/s.exec(text);
  if (m) {
    for (const [re, cat] of PREFIX_CATEGORY) if (re.test(m[1])) return { cat, body: m[2].charAt(0).toUpperCase() + m[2].slice(1) };
  }
  for (const [re, cat] of PREFIX_CATEGORY) if (re.test(text)) return { cat, body: text };
  return { cat: 'domestic', body: text };
}

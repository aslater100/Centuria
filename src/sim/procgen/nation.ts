/**
 * Procedural nations (Centuria 2.0 §H). Pure and seeded: the same seed always
 * yields the same culture, name, leader, flag, quirks and voice. Uses its own
 * Rng so generating an identity never perturbs the sim's serialized streams.
 */
import { Rng, hash01 } from '../rng';

export type CultureId =
  | 'nordic' | 'latin' | 'slavic' | 'steppe' | 'levantine' | 'insular' | 'highland' | 'austral';

interface CultureDef {
  id: CultureId;
  onsets: readonly string[];
  middles: readonly string[];
  endings: readonly string[];
  placeSuffixes: readonly string[];
  givenNames: readonly string[];
  palette: readonly string[];
  currency: readonly string[];
}

export const CULTURES: readonly CultureDef[] = [
  {
    id: 'nordic',
    onsets: ['Var', 'Skel', 'Hald', 'Tor', 'Ey', 'Sven', 'Fjal', 'Ask', 'Brek', 'Dun'],
    middles: ['', 'e', 'a', 'ri', 'ol', 'und'],
    endings: ['mark', 'heim', 'vik', 'land', 'stad', 'dal'],
    placeSuffixes: ['vik', 'by', 'holm', 'stad', 'fjord', 'havn'],
    givenNames: ['Aske', 'Tove', 'Harald', 'Sigrun', 'Eskil', 'Ingrid', 'Bjorn', 'Liv'],
    palette: ['#1f4e8c', '#c8102e', '#f2f2f2', '#fecc02', '#2b2b2b'],
    currency: ['Krona', 'Mark', 'Daler'],
  },
  {
    id: 'latin',
    onsets: ['Val', 'Cor', 'Mar', 'Aur', 'Lus', 'Ser', 'Tav', 'Bel', 'Cas', 'Or'],
    middles: ['en', 'a', 'i', 'ol', 'ar', 'es'],
    endings: ['ia', 'ona', 'essa', 'ano', 'ora', 'enza'],
    placeSuffixes: ['ano', 'ella', 'ora', 'ino', 'ia', 'osa'],
    givenNames: ['Aurelio', 'Livia', 'Marco', 'Sabina', 'Tullio', 'Octavia', 'Renzo', 'Clara'],
    palette: ['#0b6e3f', '#ce2b37', '#ffffff', '#f4c300', '#003f87'],
    currency: ['Lira', 'Scudo', 'Real'],
  },
  {
    id: 'slavic',
    onsets: ['Vol', 'Kras', 'Bor', 'Zel', 'Drav', 'Mir', 'Rus', 'Stav', 'Vel', 'Pol'],
    middles: ['o', 'e', 'a', 'in', 'ov', 'an'],
    endings: ['ia', 'ovia', 'avia', 'ensk', 'grad', 'ina'],
    placeSuffixes: ['grad', 'ovo', 'insk', 'ets', 'ava', 'opol'],
    givenNames: ['Milan', 'Vesna', 'Radoslav', 'Zora', 'Bogdan', 'Mila', 'Yaroslav', 'Danica'],
    palette: ['#ffffff', '#0039a6', '#d52b1e', '#2e7d32', '#ffd600'],
    currency: ['Ruble', 'Dinar', 'Grosz'],
  },
  {
    id: 'steppe',
    onsets: ['Kar', 'Tem', 'Bat', 'Ala', 'Kaz', 'Ul', 'Ord', 'Tur', 'Sar', 'Ak'],
    middles: ['a', 'u', 'ir', 'an', 'al', 'ai'],
    endings: ['stan', 'khan', 'ar', 'yurt', 'ul', 'ai'],
    placeSuffixes: ['kent', 'abad', 'tau', 'ar', 'kul', 'bek'],
    givenNames: ['Temir', 'Aigerim', 'Baatar', 'Saule', 'Arslan', 'Dana', 'Nurlan', 'Ayana'],
    palette: ['#00afca', '#fec50c', '#c8102e', '#006233', '#ffffff'],
    currency: ['Som', 'Tenge', 'Tanga'],
  },
  {
    id: 'levantine',
    onsets: ['Qas', 'Zah', 'Mar', 'Sid', 'Nah', 'Kha', 'Dar', 'Sam', 'Ras', 'Tam'],
    middles: ['a', 'i', 'ar', 'ir', 'un', 'ab'],
    endings: ['ia', 'an', 'ad', 'ira', 'at', 'un'],
    placeSuffixes: ['abad', 'iya', 'ar', 'un', 'aq', 'at'],
    givenNames: ['Karim', 'Layla', 'Nabil', 'Samira', 'Tariq', 'Yasmin', 'Idris', 'Rana'],
    palette: ['#007a3d', '#ffffff', '#ce1126', '#000000', '#c09300'],
    currency: ['Dirham', 'Dinar', 'Riyal'],
  },
  {
    id: 'insular',
    onsets: ['Bray', 'Kil', 'Pen', 'Ash', 'Wex', 'Carr', 'Dun', 'Glen', 'Mor', 'Tre'],
    middles: ['', 'e', 'ing', 'wy', 'ar', 'en'],
    endings: ['shire', 'land', 'wick', 'ford', 'mere', 'wall'],
    placeSuffixes: ['ton', 'ford', 'bury', 'wick', 'port', 'field'],
    givenNames: ['Arthur', 'Edith', 'Rhys', 'Maeve', 'Owen', 'Isla', 'Hugh', 'Rowena'],
    palette: ['#012169', '#c8102e', '#ffffff', '#169b62', '#ff883e'],
    currency: ['Pound', 'Sovereign', 'Crown'],
  },
  {
    id: 'highland',
    onsets: ['Alt', 'Berg', 'Ober', 'Grau', 'Stein', 'Wald', 'Rhen', 'Hoch', 'Tann', 'Kron'],
    middles: ['', 'en', 'er', 'an', 'el', 'is'],
    endings: ['ia', 'land', 'burg', 'mark', 'reich', 'tal'],
    placeSuffixes: ['burg', 'dorf', 'berg', 'hausen', 'feld', 'tal'],
    givenNames: ['Konrad', 'Greta', 'Anselm', 'Hedda', 'Lothar', 'Irma', 'Ulrich', 'Wilma'],
    palette: ['#000000', '#dd0000', '#ffce00', '#ffffff', '#1b5e20'],
    currency: ['Taler', 'Gulden', 'Mark'],
  },
  {
    id: 'austral',
    onsets: ['Tai', 'Mau', 'Ko', 'Ari', 'Wai', 'Hin', 'Nua', 'Pua', 'Rua', 'Ta'],
    middles: ['a', 'e', 'o', 'ha', 'ki', 'ra'],
    endings: ['nui', 'roa', 'aki', 'ora', 'ahi', 'iti'],
    placeSuffixes: ['nui', 'roa', 'kai', 'ahi', 'iti', 'ua'],
    givenNames: ['Aroha', 'Tane', 'Moana', 'Rangi', 'Hana', 'Kai', 'Mere', 'Tipene'],
    palette: ['#00247d', '#cc142b', '#ffffff', '#00843d', '#ffcd00'],
    currency: ['Tala', 'Pa\'anga', 'Dollar'],
  },
];

export type FlagDivision =
  | 'plain' | 'bicolor_h' | 'bicolor_v' | 'tricolor_h' | 'tricolor_v'
  | 'nordic_cross' | 'canton' | 'quartered' | 'saltire' | 'diagonal' | 'chevron';
export type FlagCharge =
  | 'none' | 'star' | 'sun' | 'crescent' | 'disc' | 'crown' | 'gear' | 'eagle' | 'tree' | 'cross' | 'stars_ring';

export interface FlagSpec {
  division: FlagDivision;
  /** Field colours in division order (1–3 used). */
  colors: string[];
  charge: FlagCharge;
  chargeColor: string;
}

export type NationVoice = 'formal' | 'bombastic' | 'terse' | 'florid';

export interface QuirkDef {
  id: string;
  label: string;
  desc: string;
}

/** Signature national quirks — read by the reaction engine and the press. */
export const QUIRKS: readonly QuirkDef[] = [
  { id: 'naval_pride', label: 'Naval Pride', desc: 'Never forgives a humiliation at sea.' },
  { id: 'republic_patron', label: 'Patron of Republics', desc: 'Courts every new republic.' },
  { id: 'crown_legitimist', label: 'Legitimist', desc: 'Rallies to any threatened crown.' },
  { id: 'grain_hawk', label: 'Grain Hawk', desc: 'Treats famine abroad as leverage.' },
  { id: 'revanchist', label: 'Revanchist', desc: 'Remembers every lost province, forever.' },
  { id: 'merchant_soul', label: 'Merchant Soul', desc: 'Forgives much for a good trade deal.' },
  { id: 'zealot', label: 'Zealous', desc: 'Judges neighbours by their faith and creed.' },
  { id: 'isolationist', label: 'Isolationist', desc: 'Wants to be left alone — and to leave alone.' },
  { id: 'status_seeker', label: 'Status Seeker', desc: 'Craves recognition; slights sting doubly.' },
  { id: 'pragmatist', label: 'Pragmatist', desc: 'Grudges fade quickly when interests align.' },
  { id: 'arms_racer', label: 'Arms Racer', desc: 'Answers every army with a bigger one.' },
  { id: 'humanitarian', label: 'Humanitarian', desc: 'Condemns crackdowns and rewards aid.' },
];

export interface GeneratedNation {
  culture: CultureId;
  /** Bare land name, e.g. "Varnesia". */
  land: string;
  /** Formal state name for the regime, e.g. "Republic of Varnesia". */
  name: string;
  adjective: string;
  leaderName: string;
  leaderTitle: string;
  flag: FlagSpec;
  quirks: string[];
  voice: NationVoice;
  currencyName: string;
}

export function nationRng(seed: number, key: string | number): Rng {
  return new Rng(Math.floor(hash01(seed, 'nation', key) * 4294967296));
}

function cultureOf(id: CultureId): CultureDef {
  return CULTURES.find((c) => c.id === id) ?? CULTURES[0];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function landName(rng: Rng, culture: CultureId): string {
  const c = cultureOf(culture);
  return capitalize(rng.pick(c.onsets) + rng.pick(c.middles) + rng.pick(c.endings));
}

export function placeName(rng: Rng, culture: CultureId): string {
  const c = cultureOf(culture);
  return capitalize(rng.pick(c.onsets) + rng.pick(c.middles) + rng.pick(c.placeSuffixes));
}

/** Given names alternate masculine/feminine by index in every culture table. */
export function personName(rng: Rng, culture: CultureId): { name: string; feminine: boolean } {
  const c = cultureOf(culture);
  const i = rng.int(c.givenNames.length);
  const surname = capitalize(rng.pick(c.onsets) + rng.pick(c.middles) + rng.pick(c.placeSuffixes));
  return { name: `${c.givenNames[i]} ${surname}`, feminine: i % 2 === 1 };
}

export function adjectiveOf(land: string): string {
  if (/ia$/.test(land)) return land + 'n';
  if (/[aeiou]$/.test(land)) return land.endsWith('e') ? land : land + 'n';
  if (/(land|mark|heim|burg|reich|stad|tal|dal|vik|berg)$/.test(land)) return land + 'er';
  if (/(stan|khan|an|un|ad|at|ar|ul|ai|aq)$/.test(land)) return land + 'i';
  if (/(wick|ford|wall|ton)$/.test(land)) return land;
  return land + 'ish';
}

const STATE_FORMS: Record<string, readonly string[]> = {
  parliamentary: ['Republic of {L}', '{A} Commonwealth', 'Federal Republic of {L}'],
  merchant_republic: ['Most Serene Republic of {L}', 'Free Cities of {L}', 'Merchant League of {L}'],
  const_monarchy: ['Kingdom of {L}', 'Grand Duchy of {L}', 'United Kingdom of {L}'],
  abs_monarchy: ['Empire of {L}', 'Tsardom of {L}', 'Realm of {L}'],
  theocracy: ['Holy Dominion of {L}', 'Sacred Commonwealth of {L}', 'Consecrated Realm of {L}'],
  junta: ['{L} Directorate', 'Military Government of {L}', 'State of {L}'],
  peoples_republic: ["People's Republic of {L}", "Workers' Union of {L}", "Socialist Commonwealth of {L}"],
  one_party: ['{L} National State', 'Unified Republic of {L}', 'Party State of {L}'],
  fascist: ['{L} Imperium', 'New Order of {L}', 'National Realm of {L}'],
  corporate: ['{L} Consolidated', 'Syndicate of {L}', 'Corporate Republic of {L}'],
};

const LEADER_TITLES: Record<string, readonly string[]> = {
  parliamentary: ['President', 'Prime Minister', 'Chancellor'],
  merchant_republic: ['Doge', 'First Consul', 'Grand Pensionary'],
  const_monarchy: ['King', 'Grand Duke', 'Prince'],
  abs_monarchy: ['Emperor', 'Tsar', 'King'],
  theocracy: ['High Prelate', 'Patriarch', 'Supreme Elder'],
  junta: ['General', 'Marshal', 'Admiral'],
  peoples_republic: ['Chairman', 'First Secretary', 'Premier'],
  one_party: ['Leader', 'Secretary-General', 'President-for-Life'],
  fascist: ['Leader', 'Duce', 'Protector'],
  corporate: ['Chief Executive', 'Chairman of the Board', 'Director-General'],
};

/** Regime → preferred flag charges and forced colours (ideology reads on the flag). */
const REGIME_HERALDRY: Record<string, { charges: readonly FlagCharge[]; color?: string }> = {
  peoples_republic: { charges: ['star', 'gear'], color: '#c8102e' },
  one_party: { charges: ['star', 'disc'] },
  fascist: { charges: ['eagle', 'disc'], color: '#1a1a1a' },
  theocracy: { charges: ['cross', 'crescent', 'sun'] },
  abs_monarchy: { charges: ['crown', 'eagle'] },
  const_monarchy: { charges: ['crown', 'none'] },
  junta: { charges: ['star', 'eagle', 'none'] },
  corporate: { charges: ['gear', 'disc', 'stars_ring'] },
  parliamentary: { charges: ['none', 'stars_ring', 'tree'] },
  merchant_republic: { charges: ['none', 'sun', 'tree'] },
};

const DIVISIONS: readonly FlagDivision[] = [
  'plain', 'bicolor_h', 'bicolor_v', 'tricolor_h', 'tricolor_v',
  'nordic_cross', 'canton', 'quartered', 'saltire', 'diagonal', 'chevron',
];

function distinctColors(rng: Rng, palette: readonly string[], n: number): string[] {
  const pool = [...palette];
  const out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(rng.int(pool.length), 1)[0]);
  return out;
}

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** The candidate that stands out best against every field colour. */
export function contrastingColor(field: readonly string[], candidates: readonly string[]): string {
  let best = candidates[0];
  let bestD = -1;
  for (const c of candidates) {
    const d = Math.min(...field.map((f) => colorDistance(c, f)));
    if (d > bestD) { bestD = d; best = c; }
  }
  return best;
}

export function generateFlag(rng: Rng, culture: CultureId, regime: string): FlagSpec {
  const c = cultureOf(culture);
  const division = culture === 'nordic' && rng.chance(0.6) ? 'nordic_cross' : rng.pick(DIVISIONS);
  const colors = distinctColors(rng, c.palette, 3);
  const her = REGIME_HERALDRY[regime];
  if (her?.color) colors[0] = her.color;
  const charge: FlagCharge = her ? rng.pick(her.charges) : rng.pick(['none', 'star', 'sun', 'disc'] as const);
  const chargeColor = contrastingColor(colors, [...c.palette, '#ffffff', '#fecc02', '#111111']);
  return { division, colors, charge, chargeColor };
}

/** Re-heraldize after a regime change: keep the field, swap the ideology marks. */
export function reviseFlag(flag: FlagSpec, regime: string, seed: number): FlagSpec {
  const rng = nationRng(seed, `revise:${regime}`);
  const her = REGIME_HERALDRY[regime];
  const colors = [...flag.colors];
  if (her?.color) colors[0] = her.color;
  return {
    division: flag.division,
    colors,
    charge: her ? rng.pick(her.charges) : flag.charge,
    chargeColor: contrastingColor(colors, [flag.chargeColor, '#ffffff', '#fecc02', '#111111']),
  };
}

export function stateNameFor(land: string, regime: string, rng: Rng): string {
  const forms = STATE_FORMS[regime] ?? ['{L}'];
  return rng.pick(forms).replace('{L}', land).replace('{A}', adjectiveOf(land));
}

const FEMININE_TITLES: Record<string, string> = {
  King: 'Queen', 'Grand Duke': 'Grand Duchess', Prince: 'Princess', Emperor: 'Empress',
  Tsar: 'Tsarina', Doge: 'Dogaressa',
};

export function leaderTitleFor(regime: string, rng: Rng, feminine = false): string {
  const t = rng.pick(LEADER_TITLES[regime] ?? ['Leader']);
  return feminine ? FEMININE_TITLES[t] ?? t : t;
}

export interface NationGenOptions {
  regime: string;
  culture?: CultureId;
  /** Names already taken in this world — regenerated on collision. */
  taken?: ReadonlySet<string>;
}

export function generateNation(seed: number, key: string | number, opts: NationGenOptions): GeneratedNation {
  const rng = nationRng(seed, key);
  const culture = opts.culture ?? rng.pick(CULTURES).id;
  let land = landName(rng, culture);
  for (let i = 0; i < 8 && opts.taken?.has(land); i++) land = landName(rng, culture);
  const name = stateNameFor(land, opts.regime, rng);
  const leader = personName(rng, culture);
  const leaderTitle = leaderTitleFor(opts.regime, rng, leader.feminine);
  const leaderName = leader.name;
  const flag = generateFlag(rng, culture, opts.regime);
  const nQuirks = 1 + (rng.chance(0.5) ? 1 : 0);
  const quirks: string[] = [];
  while (quirks.length < nQuirks) {
    const q = rng.pick(QUIRKS).id;
    if (!quirks.includes(q)) quirks.push(q);
  }
  const voice = rng.pick(['formal', 'bombastic', 'terse', 'florid'] as const);
  const currencyName = rng.pick(cultureOf(culture).currency);
  return { culture, land, name, adjective: adjectiveOf(land), leaderName, leaderTitle, flag, quirks, voice, currencyName };
}

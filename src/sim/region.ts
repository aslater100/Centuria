/**
 * RegionSim — the aggregate simulation that takes over at the flip (GDD §2.4).
 *
 * The moment town #2 is founded, individual settlers become cohort statistics
 * and a small cast of Notables carries the attachment forward. Settlements
 * grow, age, migrate, and get raided as populations, not agents — this is the
 * performance answer that lets the game scale to a State and beyond.
 */
import { Rng } from './rng';
import { MINUTES_PER_DAY, DAYS_PER_SEASON, DAYS_PER_YEAR, SEASONS, START_YEAR } from './defs';
import type { Simulation, Settler, LogEntry } from './sim';
import { RegionMap } from './worldgen';
import type { TownSite } from './worldgen';
import { Weather } from './weather';

/** Region-tier clock runs faster: 30 game-minutes per tick (GDD §8.6). */
export const REGION_MINUTES_PER_TICK = 30;

export const AGE_BANDS = ['0-14', '15-29', '30-49', '50-69', '70+'] as const;
const BAND_SPAN_YEARS = [15, 15, 20, 20, 15];
const BASE_MORTALITY_PER_YEAR = [0.015, 0.006, 0.009, 0.03, 0.12]; // 1900 frontier rates

export interface Cohorts {
  bands: number[]; // population count per age band (fractional internally)
}

export interface Settlement {
  id: number;
  name: string;
  x: number; // region coords 0..100
  y: number;
  foundedDay: number;
  cohorts: Cohorts;
  food: number;
  wood: number;
  satisfaction: number; // 0–100
  housing: number; // capacity
  landQuality: number; // = site fertility: the land budgets the farms
  site: TownSite;
  lastRaidDay: number;
  lastFloodDay: number;
  strikeUntil: number; // day; > now means production strike
  grievance: number; // 0–100 pressure gauge (GDD §5.5 unrest ladder)
}

/** Provisional government lean chosen at the Incorporation ceremony. */
export type GovLean = 'council' | 'mayor' | 'compact';

export const GOV_LEANS: Record<GovLean, { name: string; desc: string }> = {
  council: {
    name: 'Council of Towns',
    desc: 'Every town a voice. +6 satisfaction everywhere, but consensus is slow: −15% tax collection.',
  },
  mayor: {
    name: 'The Iron Mayor',
    desc: 'One strong hand. +20% tax collection, +20% militia — and −6 satisfaction (people grumble).',
  },
  compact: {
    name: 'Merchant Compact',
    desc: 'Commerce rules. +15% income per worker, but services cost +25% (everything is invoiced).',
  },
};

export type NotableRole = 'Mayor' | 'Doctor' | 'Captain' | 'Granger' | 'Forewoman' | 'Reeve';

export interface Notable {
  id: number;
  name: string;
  age: number;
  traits: string[];
  role: NotableRole;
  settlementId: number;
  bio: string[]; // accumulated story beats
  alive: boolean;
}

export interface Expedition {
  fromId: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  pop: number;
  food: number;
  wood: number;
  departDay: number;
  arrivesDay: number;
  name: string;
  site: TownSite;
}

const TOWN_NAMES = [
  'Eastvale', 'Norwick', 'Millbrook', 'Ashford', 'Redfort', 'Larkspur',
  'Coldwater', 'Hartsfield', 'Brindle', 'Ostmark', 'Fenwick', 'Sorrel',
];

export const ROLE_BONUS_DESC: Record<NotableRole, string> = {
  Mayor: '+5 satisfaction',
  Doctor: '−15% mortality',
  Captain: '+25% militia',
  Granger: '+10% food production',
  Forewoman: '+10% wood production',
  Reeve: '+10% immigration appeal',
};

/** Hard cap on settlements per region — see docs/design/map-scale.md. */
export const MAX_SETTLEMENTS = 9;

export class RegionSim {
  rng: Rng;
  minute: number;
  map: RegionMap;
  weather: Weather;
  settlements: Settlement[] = [];
  notables: Notable[] = [];
  expeditions: Expedition[] = [];
  log: LogEntry[] = [];
  stateProclaimed = false;
  /** charter done, waiting on the player's ceremony choices */
  ceremonyPending = false;
  charterProgress = 0; // 0–100, fills once eligible; the civics gate of the slice
  // ---- State-tier systems (switch on at Incorporation, GDD §2.5) ----
  stateName = '';
  govLean: GovLean | null = null;
  treasury = 0;
  taxRate = 0.1; // 0–0.3
  servicesLevel = 1; // 0–2: health & schools — satisfaction + mortality
  militiaLevel = 1; // 0–2: funded defense
  gdpLastMonth = 0;
  gameOver = false;
  private droughtAnnounced = false;
  private nextId = 1000;
  private nextEventDay: number;
  private townNamePool: string[];

  constructor(rng: Rng, minute: number, map: RegionMap, weather: Weather) {
    this.rng = rng;
    this.minute = minute;
    this.map = map;
    this.weather = weather;
    this.nextEventDay = this.day + 4 + rng.int(4);
    this.townNamePool = [...TOWN_NAMES];
  }

  // ---- time (mirrors town sim) ----
  get day(): number {
    return Math.floor(this.minute / MINUTES_PER_DAY);
  }
  get seasonIndex(): number {
    return Math.floor((this.day % DAYS_PER_YEAR) / DAYS_PER_SEASON);
  }
  get season(): string {
    return SEASONS[this.seasonIndex];
  }
  get year(): number {
    return START_YEAR + Math.floor(this.day / DAYS_PER_YEAR);
  }
  get dateLabel(): string {
    const dayOfSeason = (this.day % DAYS_PER_YEAR) % DAYS_PER_SEASON + 1;
    return `${this.season} ${dayOfSeason}, ${this.year}`;
  }

  totalPop(): number {
    return Math.round(
      this.settlements.reduce((s, t) => s + this.popOf(t), 0) +
      this.expeditions.reduce((s, e) => s + e.pop, 0),
    );
  }

  popOf(t: Settlement): number {
    return t.cohorts.bands.reduce((a, b) => a + b, 0);
  }

  workersOf(t: Settlement): number {
    return t.cohorts.bands[1] + t.cohorts.bands[2] + t.cohorts.bands[3] * 0.6;
  }

  settlement(id: number): Settlement | undefined {
    return this.settlements.find((s) => s.id === id);
  }

  notablesAt(id: number): Notable[] {
    return this.notables.filter((n) => n.alive && n.settlementId === id);
  }

  private roleMult(t: Settlement, role: NotableRole): number {
    return this.notablesAt(t.id).some((n) => n.role === role) ? 1 : 0;
  }

  // ---- THE FLIP: build the region from the founding town (GDD §2.4) ----
  static fromTown(sim: Simulation, expeditionPop: number, expeditionFood: number, expeditionWood: number): RegionSim {
    // The region inherits the town's world: same map, same weather, one truth.
    const region = new RegionSim(sim.rng, sim.minute, sim.regionMap, sim.weather);
    region.log = [...sim.log];

    // Town #1 cohortifies: real settler ages, minus those leaving on the expedition.
    const stayers = sim.settlers.length - expeditionPop;
    const bands = [0, 0, 0, 0, 0];
    for (const s of sim.settlers) {
      const band = s.age < 15 ? 0 : s.age < 30 ? 1 : s.age < 50 ? 2 : s.age < 70 ? 3 : 4;
      bands[band]++;
    }
    // remove expedition members from the working bands first
    let toRemove = expeditionPop;
    for (const b of [1, 2, 3, 0, 4]) {
      const take = Math.min(bands[b], toRemove);
      bands[b] -= take;
      toRemove -= take;
      if (toRemove <= 0) break;
    }
    const homeCoord = region.map.cellToCoord(sim.site.cellX, sim.site.cellY);
    const home: Settlement = {
      id: region.nextId++,
      name: 'Founder\'s Rest',
      x: homeCoord.rx,
      y: homeCoord.ry,
      foundedDay: 0,
      cohorts: { bands },
      food: Math.max(0, sim.stock.meal + sim.stock.grain * 0.5 - expeditionFood),
      wood: Math.max(0, sim.stock.wood - expeditionWood),
      satisfaction: Math.round(sim.avgMood()),
      housing: Math.max(stayers + 6, sim.builtOf('sleep').length * 6 + 8),
      landQuality: sim.site.fertility,
      site: sim.site,
      lastRaidDay: -99,
      lastFloodDay: -99,
      strikeUntil: -1,
      grievance: 0,
    };
    region.settlements.push(home);

    // The Notables carve-out: the most story-laden settlers stay individuals.
    const scored = [...sim.settlers].sort((a, b) => region.storyScore(sim, b) - region.storyScore(sim, a));
    const roles: NotableRole[] = ['Mayor', 'Doctor', 'Captain', 'Granger', 'Forewoman', 'Reeve'];
    const count = Math.min(10, scored.length);
    for (let i = 0; i < count; i++) {
      const s = scored[i];
      const role = roles[i % roles.length];
      region.notables.push({
        id: region.nextId++,
        name: s.name,
        age: s.age,
        traits: [...s.traits],
        role,
        settlementId: home.id,
        bio: [`Founding settler, 1900.`, `Named ${role} at the flip.`],
        alive: true,
      });
    }

    region.addLog(
      `The colony has outgrown one valley. ${expeditionPop} settlers strike out to found a second town — ` +
      `from this day, the story is told in towns and Notables, not head-counts.`,
      'good',
    );

    // Expedition en route: scouts have read the land for the best nearby site.
    region.launchExpedition(home, expeditionPop, expeditionFood, expeditionWood);
    return region;
  }

  /** Site selection and travel time come from the terrain, not dice. */
  private launchExpedition(from: Settlement, pop: number, food: number, wood: number): boolean {
    const fromCell = this.map.coordToCell(from.x, from.y);
    const claimed = this.settlements
      .map((s) => this.map.coordToCell(s.x, s.y))
      .concat(this.expeditions.map((e) => this.map.coordToCell(e.targetX, e.targetY)));
    const site = this.map.bestSiteNear(fromCell.x, fromCell.y, claimed);
    if (!site) return false;
    const target = this.map.cellToCoord(site.cellX, site.cellY);
    const travel = this.map.travelDays(fromCell.x, fromCell.y, site.cellX, site.cellY);
    const name = this.townNamePool.length > 0
      ? this.townNamePool.splice(this.rng.int(this.townNamePool.length), 1)[0]
      : `New Town ${this.settlements.length + 1}`;
    this.expeditions.push({
      fromId: from.id,
      x: from.x,
      y: from.y,
      targetX: target.rx,
      targetY: target.ry,
      pop,
      food,
      wood,
      departDay: this.day,
      arrivesDay: this.day + travel,
      name,
      site,
    });
    return true;
  }

  private storyScore(sim: Simulation, s: Settler): number {
    const skillTotal = Object.values(s.skills).reduce((a, b) => a + b, 0) + s.combat;
    return skillTotal + sim.friendsOf(s).length * 5;
  }

  // ---- main loop: one tick = 30 game-minutes ----
  tick(): void {
    if (this.gameOver) return;
    const prevDay = this.day;
    this.minute += REGION_MINUTES_PER_TICK;
    if (this.day !== prevDay) this.dailyUpdate();
  }

  private dailyUpdate(): void {
    const seasonMult = [1.25, 1.35, 1.0, 0.15][this.seasonIndex];
    const weatherMult = this.weather.growthMult(this.day);
    const drought = this.weather.isDrought(this.day);
    const floodRisk = this.weather.isFloodRisk(this.day);
    for (const t of this.settlements) {
      const pop = this.popOf(t);
      if (pop <= 0) continue;
      const workers = this.workersOf(t);
      // Production & consumption: the land budgets the farms, the sky pays or
      // withholds, and the river feeds you whatever the weather (fishing).
      const granger = 1 + 0.1 * this.roleMult(t, 'Granger');
      const forewoman = 1 + 0.1 * this.roleMult(t, 'Forewoman');
      const strike = this.day < t.strikeUntil ? 0.6 : 1;
      t.food += workers * 1.15 * seasonMult * t.landQuality * weatherMult * granger * strike;
      if (t.site.river || t.site.coastal) t.food += workers * 0.18; // the fishery
      t.food -= pop * 0.75;
      t.wood += workers * 0.25 * (0.5 + t.site.forest) * forewoman * strike;
      // Floods hit river towns' stores and fields
      if (floodRisk && t.site.river && this.day - t.lastFloodDay > 25) {
        t.lastFloodDay = this.day;
        t.food *= 0.85;
        t.satisfaction -= 6;
        this.addLog(`The river floods at ${t.name} — stores spoiled, fields under water.`, 'bad');
      }
      // Housing grows when wood allows
      if (t.housing < pop + 4 && t.wood >= 20) {
        t.wood -= 20;
        t.housing += 3;
      }
      // Satisfaction: food security, crowding, raid fear, mayor — plus,
      // after Incorporation, the politics of taxes and services
      const foodDays = t.food / Math.max(1, pop * 0.75);
      const stateTerms = this.stateProclaimed
        ? -this.taxRate * 40 +
          this.servicesLevel * 4 +
          (this.govLean === 'council' ? 6 : this.govLean === 'mayor' ? -6 : 0) -
          (this.day < t.strikeUntil ? 5 : 0)
        : 0;
      const target =
        50 +
        Math.min(20, foodDays * 1.5) -
        Math.max(0, (pop - t.housing) * 2) -
        (this.day - t.lastRaidDay < 10 ? 10 : 0) +
        5 * this.roleMult(t, 'Mayor') +
        stateTerms;
      t.satisfaction += (Math.max(0, Math.min(100, target)) - t.satisfaction) * 0.08;
      // Grievance: heavy taxes build pressure daily; services and contentment vent it
      if (this.stateProclaimed) {
        const pressure =
          Math.max(0, this.taxRate - 0.15) * 35 - this.servicesLevel * 0.4 - Math.max(0, t.satisfaction - 55) * 0.05;
        t.grievance = Math.max(0, Math.min(100, t.grievance + pressure));
      }
      // Starvation
      if (t.food < 0) {
        const starved = Math.min(pop * 0.02, -t.food / 10);
        this.removePop(t, starved);
        t.food = 0;
        if (starved > 0.5 && this.rng.chance(0.2)) {
          this.addLog(`Hunger stalks ${t.name} — the granary is empty.`, 'bad');
        }
      }
    }
    // Drought is regional news: announce on onset, during growing seasons
    if (drought && !this.droughtAnnounced && this.seasonIndex < 3) {
      this.droughtAnnounced = true;
      this.addLog('Drought grips the region. Every town\'s fields slow; river towns lean on the fishery.', 'bad');
    } else if (!drought) {
      this.droughtAnnounced = false;
    }
    if (this.day % 30 === 0) this.monthlyUpdate();
    if (this.day >= this.nextEventDay) {
      this.fireEvent();
      this.nextEventDay = this.day + 4 + this.rng.int(5);
    }
    this.updateExpeditions();
    this.updateCharter();
    if (this.totalPop() <= 0) {
      this.gameOver = true;
      this.addLog('The last settlement is empty. (Failure state: depopulation.)', 'bad');
    }
  }

  private monthlyUpdate(): void {
    for (const t of this.settlements) {
      const b = t.cohorts.bands;
      // Births from fertile bands
      const births = (b[1] + b[2] * 0.6) * 0.011;
      b[0] += births;
      // Aging: a band-span fraction graduates each month
      for (let i = AGE_BANDS.length - 2; i >= 0; i--) {
        const moved = b[i] / (BAND_SPAN_YEARS[i] * 12);
        b[i] -= moved;
        b[i + 1] += moved;
      }
      // Mortality (doctor and funded services help); elders carry most of it
      const doctor = this.roleMult(t, 'Doctor') ? 0.85 : 1;
      const services = this.stateProclaimed ? 1 - 0.05 * this.servicesLevel : 1;
      for (let i = 0; i < b.length; i++) {
        b[i] -= b[i] * (BASE_MORTALITY_PER_YEAR[i] / 12) * doctor * services;
      }
      // Immigration: the frontier draws people to fed, content towns
      const reeve = 1 + 0.1 * this.roleMult(t, 'Reeve');
      if (t.satisfaction > 55 && t.food > this.popOf(t) * 2) {
        const arrivals = (this.popOf(t) * 0.02 + 2) * reeve;
        b[1] += arrivals * 0.6;
        b[2] += arrivals * 0.3;
        b[0] += arrivals * 0.1;
      }
    }
    this.migrate();
    this.caravans();
    this.ageNotables();
    if (this.stateProclaimed) this.monthlyEconomy();
  }

  /** Grain caravans: surplus towns provision hungry ones — the land is
   *  uneven (that's the worldgen's point), so the network evens it out. */
  private caravans(): void {
    if (this.settlements.length < 2) return;
    for (const needy of this.settlements) {
      const need = this.popOf(needy) * 0.75 * 20 - needy.food; // 20-day buffer target
      if (need <= 0) continue;
      const donor = [...this.settlements]
        .filter((t) => t !== needy && t.food > this.popOf(t) * 0.75 * 60)
        .sort((a, b) => b.food - a.food)[0];
      if (!donor) continue;
      const sent = Math.min(need, donor.food - this.popOf(donor) * 0.75 * 60);
      donor.food -= sent;
      needy.food += sent * 0.9; // the road takes its tithe
      if (sent > 40 && this.rng.chance(0.4)) {
        this.addLog(`Grain caravans roll from ${donor.name} to ${needy.name}.`, 'info');
      }
    }
  }

  /** The money layer that arrives with Statehood (GDD §2.5). */
  private monthlyEconomy(): void {
    const incomeMult = this.govLean === 'compact' ? 1.15 : 1;
    const collection = this.govLean === 'council' ? 0.85 : this.govLean === 'mayor' ? 1.2 : 1;
    const serviceCost = this.govLean === 'compact' ? 1.25 : 1;
    let gdp = 0;
    for (const t of this.settlements) {
      const strike = this.day < t.strikeUntil ? 0.6 : 1;
      gdp += this.workersOf(t) * 1.2 * (0.8 + t.landQuality * 0.2) * incomeMult * strike;
    }
    this.gdpLastMonth = gdp;
    const revenue = gdp * this.taxRate * collection;
    const pop = this.totalPop();
    const spending =
      pop * 0.05 * this.servicesLevel * serviceCost +
      pop * 0.03 * this.militiaLevel +
      this.settlements.length * 5; // administration
    this.treasury += revenue - spending;
    if (this.treasury < 0) {
      this.treasury = 0;
      if (this.servicesLevel > 0) {
        this.servicesLevel--;
        this.addLog('The treasury is empty — services are cut back. The towns notice.', 'bad');
      }
    }
    // Strikes: pressure vents when grievance boils over
    for (const t of this.settlements) {
      if (t.grievance > 60 && this.day >= t.strikeUntil && this.rng.chance(0.5)) {
        t.strikeUntil = this.day + 15;
        t.grievance -= 40; // the strike itself is the release valve
        this.addLog(`Strike in ${t.name}! Workers down tools over taxes and conditions.`, 'bad');
      }
    }
  }

  private migrate(): void {
    if (this.settlements.length < 2) return;
    const ranked = [...this.settlements].sort((a, b) => b.satisfaction - a.satisfaction);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.satisfaction - worst.satisfaction > 15 && this.popOf(worst) > 10) {
      const movers = this.popOf(worst) * 0.02;
      this.removePop(worst, movers);
      best.cohorts.bands[1] += movers * 0.7;
      best.cohorts.bands[2] += movers * 0.3;
    }
  }

  private ageNotables(): void {
    for (const n of this.notables) {
      if (!n.alive) continue;
      n.age += 1 / 12;
      const annualRisk = n.age > 75 ? 0.12 : n.age > 60 ? 0.03 : 0.004;
      if (this.rng.chance(annualRisk / 12)) {
        n.alive = false;
        n.bio.push(`Died ${this.year}, aged ${Math.floor(n.age)}.`);
        this.addLog(`${n.name}, ${n.role} of ${this.settlement(n.settlementId)?.name ?? 'the colony'}, has died, aged ${Math.floor(n.age)}.`, 'bad');
        this.mintNotable(n.role, n.settlementId);
      }
    }
  }

  /** New Notables rise from the cohorts when a role falls vacant (GDD §2.4). */
  private mintNotable(role: NotableRole, settlementId: number): void {
    const t = this.settlement(settlementId);
    if (!t || this.popOf(t) < 10) return;
    const first = ['Edda', 'Tomas', 'Sela', 'Bruno', 'Petra', 'Anders', 'Ivy', 'Casimir'][this.rng.int(8)];
    const last = ['Weller', 'Stroud', 'Halvorsen', 'Quint', 'Mercer', 'Dunmore'][this.rng.int(6)];
    const n: Notable = {
      id: this.nextId++,
      name: `${first} ${last}`,
      age: 25 + this.rng.int(20),
      traits: [],
      role,
      settlementId,
      bio: [`Rose to ${role} of ${t.name}, ${this.year}.`],
      alive: true,
    };
    this.notables.push(n);
    this.addLog(`${n.name} rises to ${role} of ${t.name}.`, 'info');
  }

  private fireEvent(): void {
    const t = this.settlements[this.rng.int(this.settlements.length)];
    if (!t || this.popOf(t) < 1) return;
    const roll = this.rng.next();
    if (roll < 0.3) {
      // Raid, resolved abstractly by militia strength (GDD §7: abstraction rises with tier)
      const strength = 2 + this.rng.int(Math.max(2, Math.floor(this.totalPop() / 40)));
      const captain = 1 + 0.25 * this.roleMult(t, 'Captain');
      const funded = this.stateProclaimed ? 1 + 0.2 * this.militiaLevel + (this.govLean === 'mayor' ? 0.2 : 0) : 1;
      const militia = this.workersOf(t) * 0.12 * captain * funded;
      t.lastRaidDay = this.day;
      if (militia >= strength) {
        this.addLog(`Raiders struck ${t.name} and were driven off by the militia.`, 'good');
      } else {
        const losses = Math.min(this.popOf(t) * 0.06, strength - militia);
        this.removePop(t, losses);
        t.food *= 0.85;
        this.addLog(`Raiders overran ${t.name}'s pickets — ${Math.max(1, Math.round(losses))} lost, stores plundered.`, 'bad');
      }
    } else if (roll < 0.45) {
      const sick = Math.round(this.popOf(t) * 0.05);
      t.cohorts.bands[4] *= 0.92;
      t.cohorts.bands[0] *= 0.97;
      t.satisfaction -= 5;
      this.addLog(`Fever in ${t.name} — ${sick} bedridden; the old and the young suffer worst.`, 'bad');
    } else if (roll < 0.6) {
      t.food += this.workersOf(t) * 4;
      this.addLog(`A bumper harvest in ${t.name}.`, 'good');
    } else if (roll < 0.8) {
      const wave = 3 + this.rng.int(6);
      t.cohorts.bands[1] += wave * 0.7;
      t.cohorts.bands[2] += wave * 0.3;
      this.addLog(`A wagon train of ${wave} arrives at ${t.name}, drawn by word of the frontier.`, 'good');
    } else {
      t.satisfaction = Math.min(100, t.satisfaction + 6);
      this.addLog(`${t.name} holds a harvest fair. Spirits lift.`, 'good');
    }
  }

  // ---- expeditions & expansion ----
  canFoundTown(fromId: number): { ok: boolean; reason: string } {
    const t = this.settlement(fromId);
    if (!t) return { ok: false, reason: 'no settlement' };
    if (this.settlements.length + this.expeditions.length >= MAX_SETTLEMENTS) {
      return { ok: false, reason: 'region fully settled (see map-scale design)' };
    }
    if (this.popOf(t) < 24) return { ok: false, reason: `needs 24 pop (has ${Math.floor(this.popOf(t))})` };
    if (t.food < 80) return { ok: false, reason: `needs 80 food (has ${Math.floor(t.food)})` };
    if (t.wood < 80) return { ok: false, reason: `needs 80 wood (has ${Math.floor(t.wood)})` };
    const fromCell = this.map.coordToCell(t.x, t.y);
    const claimed = this.settlements
      .map((s) => this.map.coordToCell(s.x, s.y))
      .concat(this.expeditions.map((e) => this.map.coordToCell(e.targetX, e.targetY)));
    if (!this.map.bestSiteNear(fromCell.x, fromCell.y, claimed)) {
      return { ok: false, reason: 'no viable land within reach' };
    }
    return { ok: true, reason: '' };
  }

  foundTown(fromId: number): boolean {
    const check = this.canFoundTown(fromId);
    const t = this.settlement(fromId);
    if (!check.ok || !t) return false;
    if (!this.launchExpedition(t, 8, 80, 80)) return false;
    this.removePop(t, 8);
    t.food -= 80;
    t.wood -= 80;
    const e = this.expeditions[this.expeditions.length - 1];
    const days = e.arrivesDay - this.day;
    this.addLog(
      `An expedition of 8 sets out from ${t.name} for ${e.name} — ${days} days through ` +
      `${e.site.roughness > 0.5 ? 'hard country' : 'open country'}` +
      `${e.site.river ? ', bound for a river site' : ''}${e.site.coastal ? ', on the coast' : ''}.`,
      'info',
    );
    return true;
  }

  private updateExpeditions(): void {
    for (const e of [...this.expeditions]) {
      const totalDays = Math.max(1, e.arrivesDay - e.departDay);
      const f = Math.min(1, (this.day - e.departDay) / totalDays);
      e.x = e.x + (e.targetX - e.x) * Math.min(1, f * 0.5 + 0.1);
      e.y = e.y + (e.targetY - e.y) * Math.min(1, f * 0.5 + 0.1);
      if (this.day >= e.arrivesDay) {
        const town: Settlement = {
          id: this.nextId++,
          name: e.name,
          x: e.targetX,
          y: e.targetY,
          foundedDay: this.day,
          cohorts: { bands: [e.pop * 0.1, e.pop * 0.55, e.pop * 0.35, 0, 0] },
          food: e.food,
          wood: e.wood,
          satisfaction: 60,
          housing: e.pop + 4,
          landQuality: e.site.fertility,
          site: e.site,
          lastRaidDay: -99,
          lastFloodDay: -99,
          strikeUntil: -1,
          grievance: 0,
        };
        this.settlements.push(town);
        this.expeditions = this.expeditions.filter((o) => o !== e);
        const flavor = e.site.river ? 'on the riverbank' : e.site.coastal ? 'by the sea' : e.site.fertility > 1 ? 'in good black soil' : 'on thin ground';
        this.addLog(`${town.name} is founded ${flavor} — the ${this.ordinal(this.settlements.length)} town of the colony.`, 'good');
        // A founder steps up
        this.mintNotable('Reeve', town.id);
      }
    }
  }

  private ordinal(n: number): string {
    return n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`;
  }

  // ---- the State gate (GDD §2.2) ----
  charterEligible(): boolean {
    return this.settlements.length >= 3 && this.totalPop() >= 500;
  }

  private updateCharter(): void {
    if (this.stateProclaimed || this.ceremonyPending) return;
    if (this.charterEligible()) {
      // The Mayor drafts the Regional Charter — the slice's civics gate.
      this.charterProgress = Math.min(100, this.charterProgress + 100 / 90); // ~90 days of drafting
      if (this.charterProgress >= 100) {
        this.ceremonyPending = true;
        this.addLog('The Regional Charter is drafted. The towns await your word. (Incorporation ceremony)', 'good');
      }
    } else {
      this.charterProgress = Math.max(0, this.charterProgress - 0.5);
    }
  }

  /** The promotion-as-moment (GDD §2.2): the player names the State and sets its lean. */
  completeIncorporation(stateName: string, lean: GovLean): void {
    if (!this.ceremonyPending || this.stateProclaimed) return;
    this.ceremonyPending = false;
    this.stateProclaimed = true;
    this.stateName = stateName.trim() || 'The Valley State';
    this.govLean = lean;
    this.treasury = 50;
    const mayor = this.notables.find((n) => n.alive && n.role === 'Mayor');
    this.addLog(
      `INCORPORATION: with ${this.settlements.length} towns and ${this.totalPop()} citizens, ` +
      `${mayor ? mayor.name + ' signs' : 'the council signs'} the Regional Charter under the banner of ` +
      `${GOV_LEANS[lean].name}. ${this.stateName} is proclaimed — Tier 2 begins here.`,
      'good',
    );
    if (mayor) mayor.bio.push(`Signed the Regional Charter of ${this.stateName}, ${this.year}.`);
  }

  private removePop(t: Settlement, count: number): void {
    const pop = this.popOf(t);
    if (pop <= 0) return;
    const frac = Math.min(1, count / pop);
    for (let i = 0; i < t.cohorts.bands.length; i++) t.cohorts.bands[i] *= 1 - frac;
  }

  addLog(text: string, kind: LogEntry['kind']): void {
    this.log.push({ day: this.day, text, kind });
    if (this.log.length > 200) this.log.shift();
  }
}

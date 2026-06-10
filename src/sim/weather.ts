/**
 * Weather: a deterministic daily series layered over the seasons.
 *
 * Rain feeds soil moisture; moisture feeds crops; too little is drought,
 * too much on a river is flood. The same series drives the town tile sim
 * and the region aggregate sim, so weather is one truth at every altitude.
 */
import { fbm01 } from './worldgen';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from './defs';

export type Sky = 'clear' | 'overcast' | 'rain' | 'storm' | 'snow';

export interface DayWeather {
  rainfall: number; // 0..1
  tempAnomalyC: number; // ±4°C around the seasonal norm
  sky: Sky;
}

const SEASON_RAIN_BASE = [0.55, 0.35, 0.5, 0.4]; // spring, summer, autumn, winter

export class Weather {
  constructor(private seed: number) {}

  forDay(day: number): DayWeather {
    const seasonIdx = Math.floor((day % DAYS_PER_YEAR) / DAYS_PER_SEASON);
    const base = SEASON_RAIN_BASE[seasonIdx];
    const wet = fbm01(day * 0.13, 0.5, this.seed + 51, 3); // multi-day fronts
    const rainfall = Math.max(0, Math.min(1, base * 0.6 + (wet - 0.5) * 1.1));
    const tempAnomalyC = (fbm01(day * 0.09, 7.5, this.seed + 77, 3) - 0.5) * 8;
    const winter = seasonIdx === 3;
    let sky: Sky = 'clear';
    if (rainfall > 0.62) sky = winter ? 'snow' : 'storm';
    else if (rainfall > 0.38) sky = winter ? 'snow' : 'rain';
    else if (rainfall > 0.25) sky = 'overcast';
    return { rainfall, tempAnomalyC, sky };
  }

  /** Mean rainfall over a trailing window — the drought/flood detector. */
  recentRain(day: number, window = 12): number {
    let sum = 0;
    for (let d = day - window + 1; d <= day; d++) sum += this.forDay(Math.max(0, d)).rainfall;
    return sum / window;
  }

  /** Crop growth multiplier from water balance (drought bites hard). */
  growthMult(day: number): number {
    const r = this.recentRain(day);
    if (r < 0.18) return 0.35; // drought
    if (r < 0.3) return 0.75;
    if (r > 0.62) return 0.85; // waterlogged
    return 1.1; // well-watered
  }

  isDrought(day: number): boolean {
    return this.recentRain(day) < 0.18;
  }

  isFloodRisk(day: number): boolean {
    return this.recentRain(day, 5) > 0.68;
  }
}

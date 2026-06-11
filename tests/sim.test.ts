import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/sim';
import { MINUTES_PER_DAY, MINUTES_PER_TICK, TUNING } from '../src/sim/defs';

const ticksPerDay = MINUTES_PER_DAY / MINUTES_PER_TICK;

function runDays(sim: Simulation, days: number): void {
  for (let i = 0; i < days * ticksPerDay; i++) sim.tick();
}

function paintFarm(sim: Simulation, x: number, y: number, w: number, h: number): void {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      sim.planZone('farm', x + dx, y + dy);
    }
  }
}

describe('Simulation', () => {
  it('founds a colony of 12 with starting stocks', () => {
    const sim = new Simulation(42);
    expect(sim.settlers).toHaveLength(12);
    expect(sim.stock.meal).toBeGreaterThan(0);
    expect(sim.world.tiles.some((t) => t.stockpileZone)).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = new Simulation(7);
    const b = new Simulation(7);
    runDays(a, 5);
    runDays(b, 5);
    expect(a.stock).toEqual(b.stock);
    expect(a.settlers.map((s) => [s.name, Math.round(s.mood)])).toEqual(
      b.settlers.map((s) => [s.name, Math.round(s.mood)]),
    );
  });

  it('settlers eat: meals are consumed over time', () => {
    const sim = new Simulation(42);
    const before = sim.stock.meal + sim.stock.grain;
    runDays(sim, 3);
    expect(sim.stock.meal + sim.stock.grain).toBeLessThan(before);
    expect(sim.settlers.length).toBeGreaterThan(0);
  });

  it('farms sown in spring sustain the colony past the wagon provisions', () => {
    const sim = new Simulation(42);
    paintFarm(sim, 24, 36, 3, 3);
    paintFarm(sim, 28, 36, 3, 3);
    paintFarm(sim, 32, 36, 3, 3);
    sim.placeBuilding('kitchen', 38, 32);
    runDays(sim, TUNING.farmGrowDays + 14);
    expect(sim.world.tiles.some((t) => t.kind === 'soil')).toBe(true);
    expect(sim.gameOver).toBe(false);
    expect(sim.settlers.length).toBeGreaterThanOrEqual(10);
  });

  it('a colony that never farms starves once provisions run out', () => {
    const sim = new Simulation(42);
    runDays(sim, 45);
    expect(sim.gameOver).toBe(true);
  });

  it('soft population ceiling reduces work efficiency above the cap', () => {
    const sim = new Simulation(42);
    expect(sim.softCapWorkMult()).toBe(1);
    for (let i = 0; i < 70; i++) sim.spawnSettler(32, 32);
    expect(sim.settlers.length).toBeGreaterThan(TUNING.softCapPop);
    expect(sim.softCapWorkMult()).toBeLessThan(1);
    expect(sim.softCapMoodPenalty()).toBeGreaterThan(0);
  });

  it('raids arrive, are fought off or leave, and the colony endures', () => {
    const sim = new Simulation(42);
    paintFarm(sim, 24, 36, 3, 3);
    paintFarm(sim, 28, 36, 3, 3);
    paintFarm(sim, 32, 36, 3, 3);
    sim.placeBuilding('kitchen', 38, 32);
    runDays(sim, 30); // past firstRaidDay window (11–15)
    const raidLogged = sim.log.some((l) => l.text.startsWith('RAID!'));
    expect(raidLogged).toBe(true);
    expect(sim.raidActive).toBe(false); // resolved, not stuck
    expect(sim.gameOver).toBe(false);
  });

  it('palisades block pathing until destroyed', () => {
    const sim = new Simulation(42);
    sim.planZone('wall', 32, 26);
    // prebuilt walls don't go through construction; set directly
    sim.world.at(32, 26).wall = true;
    expect(sim.world.passable(32, 26)).toBe(false);
    sim.world.at(32, 26).wall = false;
    expect(sim.world.passable(32, 26)).toBe(true);
  });

  it('a medic treats wounds, clearing infection risk', () => {
    const sim = new Simulation(42);
    const patient = sim.settlers[0];
    const medic = sim.settlers[1];
    patient.wound = { at: sim.minute, untreated: true, infectionRolled: false };
    patient.health = 70;
    for (const s of sim.settlers) s.priorities.medic = 0;
    medic.priorities.medic = 3;
    medic.skills.medic = 8;
    runDays(sim, 2);
    expect(patient.wound === null || patient.wound.untreated === false).toBe(true);
    expect(patient.infection).toBe(false);
  });

  it('settlers recreating together become friends, deepening grief', () => {
    const sim = new Simulation(42);
    paintFarm(sim, 24, 36, 3, 3);
    paintFarm(sim, 28, 36, 3, 3);
    paintFarm(sim, 32, 36, 3, 3);
    sim.placeBuilding('kitchen', 38, 32);
    sim.placeBuilding('hall', 24, 28);
    runDays(sim, 25);
    const someFriendship = sim.settlers.some((s) => sim.friendsOf(s).length > 0);
    expect(someFriendship).toBe(true);
  });

  it('a badly hurt settler still eats: bed rest never outranks a stocked larder', () => {
    // Regression (0.1 A1): bed-rest/sleep checks used to run before the food
    // check, so a settler below the bed-rest health threshold ping-ponged
    // sleep→idle→sleep and starved to death with meals in stock.
    const sim = new Simulation(42);
    sim.stock.meal = 500;
    for (const s of sim.settlers) {
      s.health = 30; // below bedRestThreshold
      s.needs.food = 10;
    }
    runDays(sim, 2);
    expect(sim.settlers).toHaveLength(12); // nobody starved
    expect(sim.settlers.every((s) => s.needs.food > 15)).toBe(true);
  });

  it('raid size never outgrows the population it preys on', () => {
    const sim = new Simulation(42);
    sim.stock.meal = 5000; // rich and late-game: wealth/time caps far above pop cap
    sim.stock.wood = 5000;
    sim.minute = 60 * MINUTES_PER_DAY;
    const fullPopRaid = sim.raidSize();
    sim.settlers.splice(3); // the colony has withered to three
    expect(sim.raidSize()).toBeLessThanOrEqual(2);
    expect(sim.raidSize()).toBeLessThan(fullPopRaid);
  });

  it('a fed colony recovers population through immigration and births', () => {
    const sim = new Simulation(42);
    sim.stock.meal = 1000;
    sim.stock.grain = 500;
    sim.settlers.splice(4); // tragedy strikes: only four remain
    runDays(sim, 30);
    expect(sim.settlers.length).toBeGreaterThan(4);
  });

  it('the dead grieve the living until buried in a burial ground', () => {
    const sim = new Simulation(42);
    sim.placeBuilding('graveyard', 24, 28, true);
    const victim = sim.settlers[0];
    victim.needs.food = 0;
    victim.health = 0.01;
    sim.tick(); // starvation claims them
    expect(sim.corpses).toHaveLength(1);
    sim.tick();
    expect(sim.settlers.some((s) => s.thoughts.some((t) => t.label.includes('Unburied')))).toBe(true);
    runDays(sim, 2);
    expect(sim.corpses).toHaveLength(0);
    expect(sim.graves).toHaveLength(1);
  });

  it('without a burial ground the dead lie in camp and the grief persists', () => {
    const sim = new Simulation(42);
    const victim = sim.settlers[0];
    victim.needs.food = 0;
    victim.health = 0.01;
    sim.tick();
    runDays(sim, 2);
    expect(sim.corpses).toHaveLength(1); // nowhere to bury them
    expect(sim.settlers.some((s) => s.thoughts.some((t) => t.label.includes('Unburied')))).toBe(true);
  });

  it('a hearth keeps settlers alive through a cold snap with no other shelter', () => {
    const sim = new Simulation(42);
    // tear down the cabins so the fire is the only warmth
    for (const b of sim.buildings.filter((o) => o.defId === 'house')) {
      for (const t of sim.world.tiles) if (t.buildingId === b.id) t.buildingId = null;
    }
    sim.buildings = sim.buildings.filter((o) => o.defId !== 'house');
    sim.placeBuilding('hearth', 31, 33, true);
    sim.coldSnapUntil = Number.MAX_SAFE_INTEGER;
    runDays(sim, 3);
    expect(sim.settlers.length).toBeGreaterThanOrEqual(12); // nobody froze (immigrants may arrive)
  });

  it('the clothes maker outfits threadbare settlers against the cold', () => {
    const sim = new Simulation(42);
    sim.placeBuilding('tailor', 24, 30, true);
    sim.stock.grain = 200;
    runDays(sim, 4);
    expect(sim.settlers.some((s) => s.clothedUntil > sim.minute)).toBe(true);
  });

  it('colony survives 60 days with basic infrastructure on default seeds', () => {
    const sim = new Simulation(1001);
    paintFarm(sim, 24, 36, 3, 3);
    paintFarm(sim, 28, 36, 3, 3);
    paintFarm(sim, 24, 40, 3, 3);
    paintFarm(sim, 28, 40, 3, 3);
    sim.placeBuilding('kitchen', 38, 32);
    sim.placeBuilding('house', 23, 28);
    sim.placeBuilding('house', 40, 28);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        if (sim.world.at(x, y).kind === 'tree') sim.markTree(x, y);
      }
    }
    runDays(sim, 60);
    expect(sim.gameOver).toBe(false);
    expect(sim.settlers.length).toBeGreaterThan(6);
  });
});

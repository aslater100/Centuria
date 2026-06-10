# Milestone 4/5 Spec — The State Layer & the Procedural World

Two systems landed together: Tier-2's first governing tools (ceremony,
money, taxes, strikes) and the procedurally generated world whose terrain,
water, and weather constrain everything at every altitude.

## Part A — The State layer

- **Incorporation ceremony:** charter completion pauses history; the player
  names the State and chooses a provisional lean — *Council of Towns*
  (+6 satisfaction, −15% collection), *Iron Mayor* (+20% collection, +20%
  militia, −6 satisfaction), *Merchant Compact* (+15% income, services
  +25% cost). The promotion is a moment, not a log line (GDD §2.2).
- **Money arrives with Statehood:** monthly GDP from workers × land;
  tax slider (0–30%); treasury; spending on services (satisfaction,
  −5%/level mortality) and militia (+20%/level raid defense); admin
  overhead; forced service cuts when the treasury empties.
- **Grievance & strikes:** a per-town 0–100 pressure gauge builds daily
  under taxes above 15%, vents as 15-day production strikes (−40%) —
  the first rung of the GDD §5.5 unrest ladder.

## Part B — The procedural world (terrain → water → weather → limits)

**One seeded generator, one truth.** `RegionMap(seed)` builds a 64×64-cell
region: fBm elevation with a west-sea/east-mountains continental gradient,
moisture and latitude/lapse temperature fields, rivers descending from wet
heights to the sea (with confluence attraction and lake-forming
depressions), and biomes (sea/lake/river/marsh/plains/forest/hills/
mountains). Every cell derives **fertility** (0.3–1.4), **forest**, and
**roughness** — the budgets the rest of the game spends.

- **The town inherits its cell:** the founding valley is the best
  river-blessed cell near the region's heart; the tile map draws a
  meandering river (or coast), forest density, rock, and **per-tile
  fertility** with irrigation bonuses within 3 tiles of water. A
  guaranteed clearing around the wagon keeps every start winnable.
- **Weather is one deterministic series** (`Weather(seed)`) shared by both
  tiers: seasonal rainfall bases × multi-day fbm fronts → sky states
  (clear/overcast/rain/storm/snow), ±4°C anomalies feeding the existing
  temperature model.
- **Limits propagate (the point of the request):**
  - *Crops:* growth = base × tile fertility × water balance (drought 0.35×,
    well-watered 1.1×, waterlogged 0.85×). Droughts are announced; rain
    slows outdoor work 15%; snow/storm visuals at both altitudes.
  - *Floods:* sustained heavy rain bursts riverbanks — town tier drowns
    field tiles near water (plant back from the banks!), region tier
    spoils 15% of river-town stores. Rivers give and take: river/coastal
    settlements also run a weather-independent **fishery** (+0.18
    food/worker), the drought stabilizer.
  - *Wood:* region wood production scales with the cell's forest density.
  - *Expansion:* expeditions pick the **best real site within range**
    (fertility, river, coast, roughness scored), travel time computed
    across actual terrain (mountains and water crossings are slow), and
    founding logs read the land ("founded on the riverbank / on thin
    ground"). `canFoundTown` fails honestly when no viable land remains
    in reach.
  - *Region map view* renders the true terrain in 8-bit blocks with
    drifting cloud cover and precipitation from today's actual weather.

## Found during tuning

The original value-noise hash was biased (mean 0.24, range 0.05–0.43):
the world generated as featureless sea-and-mush — no mountains, no
forests, no droughts — and every downstream system starved. Replaced
with a murmur-style finalizer (mean 0.5, full range). Lesson recorded:
**distribution-test noise primitives before tuning anything above them.**

## Deferred

Town-tier fishing jobs, seasonal river freeze, snowpack/meltwater flows,
soil depletion/crop rotation, regional climate differences at Nation
scale (the 1900–2100 climate system builds on this weather core),
biome-specific art sets, mineral deposits for the industrial era.

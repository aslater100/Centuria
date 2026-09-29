/**
 * Monetary & FX (GDD §5.2) — the ninth `region.ts` tick subsystem lifted to the
 * Track-C free-function form `fn(r: RegionSim, …)`. See systems/pollution.ts for the
 * rationale: each body runs VERBATIM against the same RegionSim so the
 * RNG-consumption order is byte-identical, `tick()` dispatches, and all state +
 * serialize() stay on RegionSim. The byte-identical serialize() diff is guarded by
 * tests/serialize-determinism.
 *
 * `tickMonetary` (the monthly credit-cycle / inflation / bond-service tick, gated on
 * `hasCentralBank()`) and `tickFX` (the monthly exchange-rate / regime-crisis tick)
 * are independent — no sibling calls between them. The credit-rating query
 * `computeCreditRating` (also read by `issueBonds`) and the FX queries/actions
 * `computeExchangeRate` / `devalue` / `switchCurrencyRegime` stay on RegionSim; the
 * moved bodies reach them through `r`.
 */
import type { RegionSim } from '../region';
import {
  NEUTRAL_RATE,
  SUPPLY_SHOCK_INFLATION,
  LOCAL_GOODS_INFLATION,
  FINAL_SHORTFALL_INFLATION,
  LEVERAGE_FRAGILITY,
  LEVERAGE_FRAGILE,
  FRAGILITY_GAIN,
} from '../region';

export const PRINT_YIELD_ZERO_INFLATION = 0.2;

/** Monthly tick of the credit cycle, inflation, FX, and bond service. */
export function tickMonetary(r: RegionSim): void {
  const gdp = Math.max(1, r.gdpLastMonth);

  // 1. Credit cycle: leverage grows below neutral rate, shrinks above it
  // NEUTRAL_RATE (5%, region.ts) design-intent citation, not a data source: evokes the
  // ~2-5% "natural rate of interest" central banks estimated pre-2008 (Wicksellian neutral-rate literature).
  // The 0.5 credit-growth-speed coefficient and the /5.0 leverage ceiling are design-intent citations, not a
  // data source: they evoke private-debt/GDP ratios of ~400-500% flagged as crisis-precursor territory in
  // credit-cycle literature (e.g. Reinhart & Rogoff-style debt-overhang studies).
  const dLeverage = (NEUTRAL_RATE - r.policyRate) * 0.5 * (1 - r.privateLeverage / 5.0);
  r.privateLeverage = Math.max(0, r.privateLeverage + dLeverage);

  // 2. Inflation: credit expansion + money printing + supply-chain cost-push
  // 0.08 credit-to-inflation pass-through: design-intent citation, not a data source — evokes the partial,
  // lagged pass-through of credit expansion into prices found in monetary-transmission studies (not 1:1).
  const leverageInflation = Math.max(0, dLeverage) * 0.08;
  // Print-regime inflation lift. inflationRate is the ANNUALIZED rate and this term enters the
  // TARGET level (not a per-tick accrual), so +0.08 pins the print-regime steady state near 10%/yr —
  // matching the "moderate money-financed-deficit inflation" intent this constant always claimed.
  // Calibration memo: the old +0.010 produced a ~3%/yr steady state, 4-10x below both its own
  // comment and historical seigniorage episodes. Default play never adopts 'print' (20-seed sweep
  // flat at 2%), so this bites only the regime that chooses the printing press.
  const printInflation = r.monetaryRegime === 'print' ? 0.08 : 0;
  // Cost-push (GDD §5.2): a real supply-chain shock makes goods dearer, not just
  // scarcer — the stagflation half of the 1973 oil embargo (output already drags
  // via supplyShockMult). `supplyShockSeverity()` reads last month's cached
  // supplyChainHealth (tickIntermediateGoods runs later in the tick), a natural
  // one-month price lag, and is a pure no-RNG read. It is exactly 0 whenever raws
  // flow, so in all healthy play this term is +0 and the monetary stream is
  // byte-identical; only a genuine cascade below the era baseline lifts the target.
  const supplyPush = r.supplyShockSeverity() * SUPPLY_SHOCK_INFLATION;
  // PR-3 slice 3 — the LOCAL-goods cost-push: when specialisation strands a
  // cross-sector good (slice 2's per-town gate), the goods that can't reach the
  // towns that need them are dearer there. `localGoodsScarcity` (cached last month
  // from the production gates) is 0 in single-town / self-sufficient play — and 0
  // under a *raw* shock too, since it's a pure gate ratio, never a stock or raw
  // magnitude — so this term is +0 there (byte-identical, no double-count with
  // `supplyPush`); it lifts the target only when local distribution actually fails.
  const localGoodsPush = r.localGoodsScarcity * LOCAL_GOODS_INFLATION;
  // Increment 3 — the consumer-goods cost-push: a sustained household final-goods
  // shortage (`finalConsumptionShortfall`, the demand-side sink) makes finished goods
  // dearer, the price half of the same stagflation coupling the output drag rides.
  // Exactly 0 when `consumerDemand` is off → byte-identical (no double-count with the
  // supply/local pushes, which read raw-cascade and input-stranding, not final demand).
  const finalShortfallPush = r.finalConsumptionShortfall * FINAL_SHORTFALL_INFLATION;
  // 0.02 baseline inflation target: design-intent citation, not a data source — evokes the ~2% target
  // adopted by most modern inflation-targeting central banks (Fed, ECB, BoE) since the 1990s.
  const inflTarget = 0.02 + leverageInflation + printInflation + supplyPush + localGoodsPush + finalShortfallPush;
  // 0.15 inflation-adjustment speed: design-intent citation, not a data source — evokes the multi-month lag
  // between a cost-push/monetary shock and its full showing-up in realized inflation (adaptive-expectations-
  // style stickiness), not an instantaneous repricing.
  r.inflationRate += (inflTarget - r.inflationRate) * 0.15;
  // 0.50 inflation ceiling: design-intent citation, not a data source — evokes "very high inflation" territory
  // (e.g. 1970s-80s Latin American/Israeli episodes) well below Cagan's classic hyperinflation threshold.
  r.inflationRate = Math.max(0, Math.min(0.50, r.inflationRate));

  // 3. Confidence: mean-reverts to 70, falls when debt service, inflation, or the
  //    leverage *level* (Minsky fragility) is high
  const debtService = r.privateLeverage * r.policyRate; // annual fraction
  // LEVERAGE_FRAGILITY (region.ts, from TUNING) and the 80 pressure coefficient: design-intent citation, not
  // a data source — evoke debt-service-to-income/GDP ratios (~20-25%) that BIS-style research links to
  // elevated financial-crisis risk once crossed.
  const leveragePressure = Math.max(0, debtService - LEVERAGE_FRAGILITY) * 80;
  // 0.08 inflation threshold and 40 coefficient: design-intent citation, not a data source — evoke ~8%
  // inflation as a rough point where public/business confidence surveys start showing visible erosion.
  const inflPressure = Math.max(0, r.inflationRate - 0.08) * 40;
  // LEVERAGE_FRAGILE and FRAGILITY_GAIN (region.ts, from TUNING): design-intent citation, not a data source —
  // evoke Minsky's Financial Instability Hypothesis, where leverage past a "speculative/Ponzi" threshold
  // itself erodes confidence, independent of current debt-service cost.
  const fragilityPressure = Math.max(0, r.privateLeverage - LEVERAGE_FRAGILE) * FRAGILITY_GAIN;
  // Depression ceiling: while depressionDepth > 0.05 confidence can't freely recover.
  // At depth=1.0 ceiling is ~35; it lifts linearly as depth fades.
  // Stimulus choice grants +10 to the ceiling; austerity +5.
  // 35/65 depression-ceiling floor+span and the +10/+5 stimulus/austerity bonus: design-intent citation, not
  // a data source — evoke the New-Deal-style "stimulus restores confidence faster than austerity" narrative
  // contrasted with the slower, more contested recovery under 1930s gold-standard-era austerity.
  const recoveryBonus = r.crashRecoveryChoice === 'stimulus' ? 10
    : r.crashRecoveryChoice === 'austerity' ? 5 : 0;
  const depressionCeiling = r.depressionDepth > 0.05
    ? Math.round(35 + 65 * (1 - r.depressionDepth)) + recoveryBonus + r.depressionCeilingBonus
    : 100;
  // 70 confidence-target baseline and 5 floor: design-intent citation, not a data source — evoke a survey-
  // style confidence index (0-100) resting well above neutral in normal times, with troughs in the 20-40s
  // seen in indices like the US Conference Board Consumer Confidence Index during 2008-09.
  const confTarget = Math.min(depressionCeiling, Math.max(5, 70 - leveragePressure - inflPressure - fragilityPressure));
  // 0.12 confidence mean-reversion speed: design-intent citation, not a data source — evokes sentiment/
  // confidence surveys reverting toward trend over a period of months, not instantly.
  r.confidence += (confTarget - r.confidence) * 0.12;
  r.confidence = Math.max(0, Math.min(100, r.confidence));

  // 4. Deleveraging bust: confidence crash forces rapid credit contraction
  // confidence<30 trigger and 0.05 base contraction: design-intent citation, not a data source — evoke a
  // "Minsky moment" where credit markets seize once sentiment breaks decisively, echoing the abrupt bank
  // lending contraction seen in the acute phase of the 2008 credit crunch.
  // §DIFF: economicVolatility scales the bust amplitude — this is the knob's live consumer
  // (it was advertised in the difficulty UI but consumed nowhere). At 1.0 the arithmetic is
  // exactly the legacy contraction, so the easy tier and every pinned test are byte-stable.
  const volatility = r.difficultySettings.economicVolatility;
  if (r.confidence < 30 && r.privateLeverage > 0.5) {
    r.privateLeverage *= (1 - (0.05 + (30 - r.confidence) * 0.002) * volatility);
    // rng.chance(0.2): design-intent citation, not a data source — evokes that a credit freeze headline is a
    // lumpy, episodic event, not guaranteed every month confidence is low.
    if (r.rng.chance(0.2)) {
      r.addLog('Credit markets freeze — banks call in loans as confidence breaks.', 'bad');
    }
  }

  // 5. FX dynamics
  if (r.monetaryRegime === 'peg') {
    // Peg: hold exchange rate; drain reserves if trade is unfavorable
    // 0.025 trade-deficit baseline and 0.12 reserve-drain rate: design-intent citation, not a data source —
    // evoke a peg-defending central bank spending reserves each month it runs a trade shortfall.
    const deficit = Math.max(0, r.totalPop() * 0.025 - r.exportEarningsLastMonth);
    r.treasury -= deficit * 0.12;
    // An exhausted treasury cannot defend a peg at all; a thin one gambles.
    // treasury < gdp*0.10 (full break) / gdp*0.25 with 25% gamble chance: peg-defense thresholds — design-
    // intent citation, not a data source — evoke reserve-adequacy rules of thumb (e.g. IMF "reserves cover
    // short-term external debt", Guidotti-Greenspan) and the speculative-attack dynamics of 1992 Black
    // Wednesday / the 1997 Asian Financial Crisis, where pegs broke once reserves ran critically thin.
    if (r.treasury < gdp * 0.1 || (r.treasury < gdp * 0.25 && r.rng.chance(0.25))) {
      r.monetaryRegime = 'float';
      // -25 confidence shock: design-intent citation, not a data source — evokes the sharp sentiment drop
      // recorded around historical peg collapses (e.g. 1997 Asian Financial Crisis).
      r.confidence = Math.max(5, r.confidence - 25);
      // *0.82 (~18% devaluation) with a 0.30 floor: design-intent citation, not a data source — evokes
      // real-world peg-break devaluation magnitudes, from Black Wednesday's ~15% sterling fall to the
      // 30-80% peak-to-trough falls seen in some 1997 Asian Financial Crisis currencies.
      r.exchangeRate = Math.max(r.exchangeRate * 0.82, 0.30);
      r.addLog('The currency peg breaks — reserves exhausted. The exchange rate is in freefall.', 'bad');
    }
  } else {
    // Float/print: market-driven exchange rate
    const tradeUp = r.exportEarningsLastMonth > r.totalPop() * 0.025;
    // 0.04 rate-differential coefficient: design-intent citation, not a data source — evokes uncovered
    // interest-rate parity (UIP), where a currency drifts with the gap between domestic and neutral rates.
    const rateDiff = (r.policyRate - NEUTRAL_RATE) * 0.04;
    // 0.0003 confidence-flow coefficient: design-intent citation, not a data source — evokes sentiment-driven
    // capital flows nudging FX gradually, distinct from the larger discrete peg-break repricing above.
    const confFlow = (r.confidence - 50) * 0.0003;
    // -0.012/month print-regime drag: design-intent citation, not a data source — evokes the currency
    // depreciation historically associated with money-financed deficits (a purchasing-power-parity intuition).
    const printDrag = r.monetaryRegime === 'print' ? -0.012 : 0;
    // ±0.003/month baseline trade drift: design-intent citation, not a data source — evokes a slow,
    // deterministic trade-balance-driven currency trend, distinct from short-run FX volatility.
    r.exchangeRate += (tradeUp ? 0.003 : -0.003) + rateDiff + confFlow + printDrag;
    r.exchangeRate = Math.max(0.30, Math.min(2.0, r.exchangeRate));
  }

  // 7. Print regime: money creation boosts treasury
  // 0.018/month (~21.6%/yr) print seigniorage: design-intent citation, not a data source — evokes the
  // inflation-tax/seigniorage revenue literature (Cagan-style optimal-seigniorage models), where money-
  // financed regimes have historically extracted low-double-digit-percent-of-GDP annual revenue this way.
  // Centuria 2.0 §F: seigniorage erodes as inflation expectations catch up — the
  // presses yield nothing once inflation reaches PRINT_YIELD_ZERO_INFLATION.
  if (r.monetaryRegime === 'print') {
    r.treasury += gdp * 0.018 * Math.max(0, 1 - r.inflationRate / PRINT_YIELD_ZERO_INFLATION);
  }

  // 8. Bond debt service
  // r.bondRate (region.ts: policyRate + CREDIT_RATING_SPREADS[rating]): design-intent citation, not a data
  // source — the spread scale (0 for AAA up to 25pp for D) evokes real sovereign/corporate credit-spread
  // scales, from a few tens of bps for investment-grade to many hundreds/low-thousands of bps for distressed.
  if (r.nationalDebt > 0) {
    const service = r.nationalDebt * r.bondRate / 12;
    r.treasury -= service;
    if (r.treasury < 0) {
      r.nationalDebt -= r.treasury; // unpaid interest compounds into debt
      r.treasury = 0;
    }
  }

  // 9. Update credit rating
  r.creditRating = r.computeCreditRating();

  // 10. Inflation erodes satisfaction
  // 0.05 threshold and 30 coefficient: design-intent citation, not a data source — evoke ~5% as a rough
  // point where inflation becomes politically salient/painful (echoed in "misery index"-style political-
  // economy framing and the public backlash seen in 1970s stagflation).
  if (r.inflationRate > 0.05) {
    const drag = (r.inflationRate - 0.05) * 30;
    for (const t of r.settlements) {
      t.satisfaction = Math.max(0, t.satisfaction - drag);
    }
  }

  // 11. Transmit policy rate to private lenders — banks price above the base rate
  // 0.02 + id*0.005 (2-3.5%) spread: design-intent citation, not a data source — evokes typical commercial-
  // lending spreads over a central bank's base/policy rate (historically on the order of a few points).
  for (const lender of r.lenders) {
    const spread = 0.02 + lender.id * 0.005; // 2–3.5% spread; riskier lenders charge more
    lender.interestRate = Math.max(0.01, Math.min(0.20, r.policyRate + spread));
  }

  // 12. Lender liquidity regeneration — low rates encourage banks to lend freely
  // max(0.04, 0.12 - policyRate) (4-12%/month) recovery: design-intent citation, not a data source — evokes
  // loanable-funds intuition that cheap policy rates loosen bank lending capacity faster (echoing the credit
  // growth acceleration seen during low-rate eras like the post-2008 ZIRP period).
  for (const lender of r.lenders) {
    const recoveryRate = Math.max(0.04, 0.12 - r.policyRate); // 4–12% of max loan recovered per month
    lender.liquidCash = Math.min(lender.maxLoan * 4, lender.liquidCash + lender.maxLoan * recoveryRate);
  }

  // 13. Accrue interest on outstanding Central Bank discount window loan
  if (r.centralBankLoan > 0) {
    r.centralBankLoan += r.centralBankLoan * (r.policyRate / 12);
  }

  // 14. Keep player faction's CentralBank metadata in sync (create lazily if missing)
  const pf = r.faction(r.playerFactionId);
  if (pf) {
    if (!pf.centralBank) {
      pf.centralBank = {
        factionId: r.playerFactionId,
        foundedDay: r.day,
        reserves: {},
        interestRate: r.policyRate,
        inflationRate: r.inflationRate,
      };
    } else {
      pf.centralBank.interestRate = r.policyRate;
      pf.centralBank.inflationRate = r.inflationRate;
    }
  }

  // 15. D1 — hyperinflation collapse. inflationRate is hard-clamped at 0.50 (line 78), so the
  // plan's "200% annualized" is unreachable; the collapse line lives inside the clamp. Twelve
  // consecutive months of inflation >= 0.45 ends the run. (The spec's original confidence < 20
  // co-condition was dropped after verification: sustained max inflation floors confidence near
  // 55 via the inflPressure term above, so < 20 is unreachable from inflation alone and made the
  // loss state a phantom. Sustained near-ceiling inflation IS the death spiral on its own.)
  // Reaching 0.45 requires the structural inflation target to hold ~0.50 for many months — a full
  // supply-chain cascade under a money-printing regime — so normal play never approaches it. Any
  // month the player tames inflation (rate hikes, regime switch, fixing the cascade) pulls the rate
  // back under 0.45 and resets the counter, so the collapse is always escapable until the 12th month.
  if (r.inflationRate >= 0.45) {
    r.hyperinflationMonths++;
    if (r.hyperinflationMonths >= 12 && !r.gameOver) {
      r.gameOver = true;
      r.gameOverCause = 'hyperinflation';
      r.addLog(
        'Prices double by the week and the currency is worthless — the economy collapses. (Failure state: hyperinflation.)',
        'bad',
      );
    }
  } else {
    r.hyperinflationMonths = 0;
  }
}

/** Monthly FX tick: recompute exchange rate, decay fxBoost, handle regime crises. */
export function tickFX(r: RegionSim): void {
  // Recompute exchange rate based on current conditions
  const newRate = r.computeExchangeRate();

  if (r.currencyRegime === 'gold_standard') {
    // Gold standard: rate fixed at 1.0
    r.exchangeRate = 1.0;
    // 0.03-0.08 policy-rate band: design-intent citation, not a data source — evokes the narrow discount-rate
    // range central banks historically held under the classical/interwar gold standard.
    r.policyRate = Math.max(0.03, Math.min(0.08, r.policyRate));
    // -0.002/month deflation drag: design-intent citation, not a data source — evokes the deflationary bias
    // documented under the classical/interwar gold standard (e.g. UK/US price declines through the 1920s-30s).
    r.inflationRate = Math.max(-0.05, r.inflationRate - 0.002);
    // confidence<40 collapse trigger: design-intent citation, not a data source — evokes historical gold-
    // standard exits driven by a confidence collapse rather than a mechanical rule (e.g. Britain, 1931).
    if (r.confidence < 40) {
      r.currencyRegime = 'fiat';
      // -0.2 (~20%) devaluation on collapse: design-intent citation, not a data source — evokes the
      // magnitude of currency depreciation seen when nations exited gold parity (e.g. sterling fell roughly
      // a quarter against gold within a year of the 1931 exit).
      r.exchangeRate = Math.max(0.5, r.exchangeRate - 0.2);
      r.addLog(
        'GOLD STANDARD CRISIS: Market confidence collapses. The gold peg is abandoned. ' +
        'Exchange rate falls sharply.',
        'bad'
      );
    }
  } else if (r.currencyRegime === 'fiat') {
    r.exchangeRate = newRate;
    // Fiat at very low rates: inflation creep
    // policyRate<0.02 threshold and +0.003/month creep: design-intent citation, not a data source — evokes
    // the inflation-risk debate around near-zero-rate policy (e.g. the post-2008 ZIRP era), a theoretical
    // concern this models even though realized inflation stayed low through most of that period.
    if (r.policyRate < 0.02) {
      r.inflationRate = Math.min(0.50, r.inflationRate + 0.003);
    }
  } else if (r.currencyRegime === 'currency_union') {
    // Auto-exit if partner is at war with us
    const partnerAtWar = r.currencyUnionPartnerId !== undefined &&
      (r.playerWar?.rivalId === r.currencyUnionPartnerId ||
       r.foreignWars.some(w =>
         (w.a === r.currencyUnionPartnerId || w.b === r.currencyUnionPartnerId)
       ));
    if (partnerAtWar) {
      r.currencyRegime = 'fiat';
      r.currencyUnionPartnerId = undefined;
      r.addLog('Currency union dissolved — partner nation at war. Currency floats independently.', 'bad');
    } else {
      // Lock rate to partner
      const partnerRate = r.currencyUnionPartnerId !== undefined
        ? (r.exchangeRates[`0:${r.currencyUnionPartnerId}`] ?? 1.0)
        : 1.0;
      r.exchangeRate = partnerRate;
    }
  }

  // Decay fxBoost toward 1.0 by 10%/month
  // 0.9 decay factor (10%/month): design-intent citation, not a data source — evokes the multi-month fade of
  // a temporary competitiveness gain from devaluation (the classic "J-curve" adjustment timescale).
  if (r.fxBoost > 1.0) {
    r.fxBoost = Math.max(1.0, 1.0 + (r.fxBoost - 1.0) * 0.9);
  }
}

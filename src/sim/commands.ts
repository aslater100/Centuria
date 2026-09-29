/**
 * Command layer (Centuria 2.0 §A). Every player act flows through `issue()`,
 * which records a serializable Command before applying it. The log is the
 * input tape for replay/determinism checks and the deed source for memory
 * and reactions. UI code must mutate the sim only via `issue()`.
 */
import type { RegionSim } from './region';

export const COMMAND_NAMES = [
  'abandonNegotiation', 'acceptCounter', 'acceptNegotiation', 'acceptOffer',
  'announceCurrencyChange', 'applyNationDesign', 'assaultSettlement',
  'borrowFromCentralBank', 'breakTreaty', 'brokerForeignPeace', 'buildCity',
  'buildFloodProof', 'buildHighway', 'buildMaglev', 'buildRail', 'buildRoad',
  'buildSeaWall', 'buyLand', 'callAlly', 'cancelArmyMovement', 'cancelResearch',
  'capitulate', 'censorMedia', 'chooseEventOption', 'changeCurrency', 'chooseRecoveryPath', 'claimCell',
  'completeIncorporation', 'concedeToProtesters', 'counterOffer', 'crackdownProtests',
  'declareWar', 'declareWarOnFaction', 'declineCounter', 'declineOffer', 'deleteRoute',
  'deployGeoengineering', 'doManagedRetreat', 'enactDepressionMeasure', 'enactLaw',
  'enactPlatformRegulation', 'formTradeBloc', 'foundTownAt', 'fundPublicMedia',
  'grantPressLicense', 'imposeSanction', 'investMediaLiteracy', 'inviteToBloc',
  'issueBonds', 'leaveTradeBloc', 'liftSanction', 'makeRegionalPeace',
  'offerPeaceBasket', 'offerVassalage', 'openNegotiation', 'placeDistrict',
  'proclaimNation', 'proposeDeal', 'proposeTreaty', 'recounterNegotiation',
  'recruitMilitia', 'recruitUnits', 'repairRoute', 'repayCentralBank', 'repayLoan',
  'requestLoan', 'runEspionage', 'sanctionAccordDefector', 'sendEnvoy', 'sendFoodAid',
  'sendGift', 'sendPlayerScout', 'setAutoBuildRoutes', 'setBlocTariff', 'setBlockade',
  'setCityPolicy', 'setMobilization', 'setMonetaryRegime', 'setOccupationPolicy',
  'setPolicy', 'setProvincePolicy', 'setRouteBudget', 'setRouteCargoPriority',
  'setScoutTarget', 'setTownFocus', 'setTaxRate', 'setServicesLevel', 'setMilitiaLevel', 'startResearch', 'yieldToCoalition',
] as const;

export type CommandName = typeof COMMAND_NAMES[number];

type Method<K extends CommandName> = Extract<RegionSim[K], (...args: never[]) => unknown>;
export type CommandArgs<K extends CommandName> = Parameters<Method<K>>;

export interface Command {
  day: number;
  name: CommandName;
  args: unknown[];
}

export type CommandListener = (r: RegionSim, cmd: Command, result: unknown) => void;

const listeners: CommandListener[] = [];

/** Observe applied commands (memory/reaction systems subscribe here). */
export function onCommand(fn: CommandListener): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

const NAME_SET: ReadonlySet<string> = new Set(COMMAND_NAMES);

export function isCommandName(s: string): s is CommandName {
  return NAME_SET.has(s);
}

function invoke(r: RegionSim, name: CommandName, args: readonly unknown[]): unknown {
  const fn = r[name] as unknown as (...a: unknown[]) => unknown;
  return fn.apply(r, [...args]);
}

/** Record then apply a player command. Args must be JSON-serializable. */
export function issue<K extends CommandName>(
  r: RegionSim,
  name: K,
  ...args: CommandArgs<K>
): ReturnType<Method<K>> {
  const cmd: Command = { day: r.day, name, args: JSON.parse(JSON.stringify(args ?? [])) as unknown[] };
  r.commandLog.push(cmd);
  const result = invoke(r, name, args);
  for (const l of listeners) l(r, cmd, result);
  return result as ReturnType<Method<K>>;
}

/** Re-apply a logged command (replay). Does not re-log. */
export function replay(r: RegionSim, cmd: Command): unknown {
  return invoke(r, cmd.name, cmd.args);
}

import type { StopKind } from './job/stop.js';

export interface PricingRules {
  /** Fee per zone id, in cents. */
  zoneFees: Readonly<Record<string, number>>;
  /** Charged for every stop from the third one on. */
  extraStopFee: number;
  /** Charged for every ERRAND or PURCHASE stop. */
  errandFee: number;
  /** Surcharge in basis points (1000 = 10%) for rain, night, etc. */
  surchargeBps: number;
  /** Round the total up to a multiple of this many cents (e.g. 5000 = $50). 0 disables rounding. */
  roundToCents: number;
  freeWaitMinutes: number;
  waitFeePerMinute: number;
}

export interface PricedStop {
  kind: StopKind;
  /** Zone the stop falls in, or null when it is outside every zone of the city. */
  zoneId: string | null;
}

export interface Quote {
  base: number;
  extraStops: number;
  errands: number;
  surcharge: number;
  rounding: number;
  total: number;
}

export class OutOfCoverageError extends Error {
  constructor(readonly stopIndexes: number[]) {
    super(`Stops outside coverage: ${stopIndexes.join(', ')}`);
    this.name = 'OutOfCoverageError';
  }
}

export function quoteJob(stops: readonly PricedStop[], rules: PricingRules): Quote {
  if (stops.length === 0) throw new RangeError('A job needs at least one stop');

  const uncovered = stops.flatMap((s, i) => (s.zoneId === null || rules.zoneFees[s.zoneId] === undefined ? [i] : []));
  if (uncovered.length > 0) throw new OutOfCoverageError(uncovered);

  const base = Math.max(...stops.map((s) => rules.zoneFees[s.zoneId as string] as number));
  const extraStops = Math.max(0, stops.length - 2) * rules.extraStopFee;
  const errands = stops.filter((s) => s.kind === 'ERRAND' || s.kind === 'PURCHASE').length * rules.errandFee;
  const subtotal = base + extraStops + errands;
  const surcharge = Math.round((subtotal * rules.surchargeBps) / 10_000);
  const raw = subtotal + surcharge;
  const total = rules.roundToCents > 0 ? Math.ceil(raw / rules.roundToCents) * rules.roundToCents : raw;

  return { base, extraStops, errands, surcharge, rounding: total - raw, total };
}

/** Waiting charge for one stop, given the minutes the courier waited there. */
export function waitFee(
  waitedMinutes: number,
  rules: Pick<PricingRules, 'freeWaitMinutes' | 'waitFeePerMinute'>,
): number {
  const billable = Math.max(0, Math.floor(waitedMinutes) - rules.freeWaitMinutes);
  return billable * rules.waitFeePerMinute;
}

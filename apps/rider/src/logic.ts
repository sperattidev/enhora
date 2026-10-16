import type { StopKind, StopStatus } from '@enhora/shared';

export interface NextAction {
  to: 'EN_ROUTE' | 'ARRIVED' | 'DONE';
  label: string;
  /** Deliveries close only with the code the recipient reads out. */
  needsCode: boolean;
}

const DONE_LABEL: Record<StopKind, string> = {
  PICKUP: 'Retiré el pedido',
  DROPOFF: 'Entregué',
  ERRAND: 'Terminé el trámite',
  PURCHASE: 'Hice la compra',
};

/** The single big button the courier sees for the current stop. */
export function nextAction(stop: { kind: StopKind; status: StopStatus }): NextAction | null {
  switch (stop.status) {
    case 'PENDING':
      return { to: 'EN_ROUTE', label: 'Voy en camino', needsCode: false };
    case 'EN_ROUTE':
      return { to: 'ARRIVED', label: 'Llegué', needsCode: false };
    case 'ARRIVED':
      return { to: 'DONE', label: DONE_LABEL[stop.kind], needsCode: stop.kind === 'DROPOFF' };
    default:
      return null;
  }
}

/** Whole seconds left before an offer expires, never negative. */
export function secondsLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

/** Opens turn-by-turn directions in Google Maps (app on phones, web elsewhere). */
export function directionsLink(location: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=driving`;
}

/** Index of the stop the courier works on next, or -1 when all are finished. */
export function currentStopIndex(stops: readonly { status: StopStatus }[]): number {
  return stops.findIndex((s) => s.status !== 'DONE' && s.status !== 'FAILED');
}

/** Before pickup the courier can still hand the job back. */
export function canRelease(stops: readonly { status: StopStatus }[]): boolean {
  return stops[0]?.status === 'PENDING' || stops[0]?.status === 'EN_ROUTE' || stops[0]?.status === 'ARRIVED';
}

export const LOCATION_INTERVAL_MS = 10_000;

/** Sends at most one position every LOCATION_INTERVAL_MS. */
export function shouldSendLocation(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= LOCATION_INTERVAL_MS;
}

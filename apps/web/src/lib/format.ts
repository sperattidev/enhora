import type { JobStatus, StopKind, StopStatus } from '@enhora/shared';

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

/** Formats integer cents as pesos: 125000 → "$ 1.250". */
export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

/** Parses what a person types as pesos ("1.250,50", "1250") into integer cents, or null. */
export function parsePesos(input: string): number | null {
  const clean = input.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
  if (clean === '') return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

const dateTime = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  SCHEDULED: 'Programado',
  SEARCHING: 'Buscando cadete',
  ASSIGNED: 'Cadete asignado',
  IN_PROGRESS: 'En camino',
  COMPLETED: 'Entregado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Sin cadete',
};

export type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'danger' | 'warning';

export const JOB_STATUS_TONE: Record<JobStatus, Tone> = {
  SCHEDULED: 'neutral',
  SEARCHING: 'info',
  ASSIGNED: 'progress',
  IN_PROGRESS: 'progress',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'warning',
};

export const STOP_KIND_LABEL: Record<StopKind, string> = {
  PICKUP: 'Retiro',
  DROPOFF: 'Entrega',
  ERRAND: 'Trámite',
  PURCHASE: 'Compra',
};

export const STOP_STATUS_LABEL: Record<StopStatus, string> = {
  PENDING: 'Pendiente',
  EN_ROUTE: 'En camino',
  ARRIVED: 'En el lugar',
  DONE: 'Hecho',
  FAILED: 'No se pudo',
};

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['SCHEDULED', 'SEARCHING', 'ASSIGNED', 'IN_PROGRESS'];
export const CANCELLABLE_JOB_STATUSES: readonly JobStatus[] = ['SCHEDULED', 'SEARCHING', 'ASSIGNED', 'EXPIRED'];

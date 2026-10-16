import type { JobStatus, StopKind, StopStatus } from '@enhora/shared';

export interface Overview {
  scheduled: number;
  searching: number;
  assigned: number;
  inProgress: number;
  expired: number;
  completedToday: number;
  cancelledToday: number;
  deliveredValueToday: number;
  couriersOnline: number;
  couriersApproved: number;
  cashInHands: number;
  pendingCouriers: number;
  pendingMerchants: number;
  activeMerchants: number;
}

export interface AdminJob {
  id: string;
  status: JobStatus;
  priceCents: number;
  merchantName: string;
  courierName: string | null;
  scheduledFor: string | null;
  searchingSince: string | null;
  createdAt: string;
  trackingToken: string;
  destination: string | null;
  stops: { kind: StopKind; status: StopStatus }[];
}

export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type MerchantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED';

export interface AdminCourier {
  id: string;
  userId: string;
  fullName: string;
  dni: string;
  vehicle: string;
  kycStatus: KycStatus;
  email: string;
  phone: string | null;
  createdAt: string;
}

export interface AdminMerchant {
  id: string;
  legalName: string;
  displayName: string;
  cuit: string;
  phone: string;
  address: string;
  status: MerchantStatus;
  createdAt: string;
}

export interface Zone {
  id: string;
  name: string;
  feeCents: number;
  active: boolean;
  area: GeoJSON.MultiPolygon;
}

export interface PricingRules {
  extraStopFeeCents: number;
  errandFeeCents: number;
  surchargeBps: number;
  roundToCents: number;
  freeWaitMinutes: number;
  waitFeePerMinuteCents: number;
}

export interface AuditEntry {
  id: number;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown> | null;
  adminEmail: string;
  createdAt: string;
}

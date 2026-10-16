import type { JobStatus, Quote, Role, StopKind, StopStatus } from '@enhora/shared';

export interface Account {
  id: string;
  email: string;
  role: Role;
  merchant: {
    id: string;
    displayName: string;
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
    address: string;
    location: { lat: number; lng: number };
  } | null;
  courier: { id: string; fullName: string; kycStatus: string } | null;
}

export interface JobSummary {
  id: string;
  status: JobStatus;
  priceCents: number;
  scheduledFor: string | null;
  createdAt: string;
  trackingToken: string;
  stopCount: number;
  destination: string | null;
  stops: { kind: StopKind; status: StopStatus }[];
}

export interface JobStop {
  id: string;
  position: number;
  kind: StopKind;
  status: StopStatus;
  address: string;
  location: { lat: number; lng: number };
  contactName: string | null;
  contactPhone: string | null;
  instructions: string | null;
  cashToCollectCents: number | null;
  maxSpendCents: number | null;
  deliveryCode: string | null;
  failureReason: string | null;
  finishedAt: string | null;
}

export interface JobEvent {
  actor: string;
  fromStatus: string | null;
  toStatus: string;
  stopPosition: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface JobDetail {
  id: string;
  status: JobStatus;
  priceCents: number;
  quote: Quote;
  scheduledFor: string | null;
  notes: string | null;
  trackingToken: string;
  courierName: string | null;
  cancelReason: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  stops: JobStop[];
  events: JobEvent[];
}

export interface TrackingView {
  status: JobStatus;
  merchantName: string;
  courierName: string | null;
  scheduledFor: string | null;
  createdAt: string;
  finishedAt: string | null;
  stops: { kind: StopKind; status: StopStatus }[];
}

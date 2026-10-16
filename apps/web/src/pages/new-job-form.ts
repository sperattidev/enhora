import { createJobInputSchema, type CreateJobInput, type StopKind } from '@enhora/shared';
import type { LatLng } from '@enhora/ui/map';
import { parsePesos, normalizeArPhone } from '@enhora/ui';

/** What the person is typing for one stop: raw strings until submit. */
export interface StopDraft {
  key: string;
  kind: StopKind;
  address: string;
  location: LatLng | null;
  contactName: string;
  contactPhone: string;
  instructions: string;
  cash: string;
  maxSpend: string;
}

export interface JobDraft {
  stops: StopDraft[];
  scheduled: boolean;
  /** Value of a datetime-local input, in the device's time zone. */
  scheduledFor: string;
  notes: string;
}

let counter = 0;
export function emptyStop(kind: StopKind, address = '', location: LatLng | null = null): StopDraft {
  counter += 1;
  return {
    key: `stop-${counter}`,
    kind,
    address,
    location,
    contactName: '',
    contactPhone: '',
    instructions: '',
    cash: '',
    maxSpend: '',
  };
}

const blank = (s: string) => (s.trim() === '' ? undefined : s.trim());

/** Turns the draft into the API payload, without validating it. */
export function toPayload(draft: JobDraft): unknown {
  return {
    stops: draft.stops.map((s) => ({
      kind: s.kind,
      address: s.address.trim(),
      location: s.location ?? undefined,
      contactName: blank(s.contactName),
      contactPhone: blank(s.contactPhone) && (normalizeArPhone(s.contactPhone) ?? s.contactPhone.trim()),
      instructions: blank(s.instructions),
      cashToCollect: s.kind === 'DROPOFF' && blank(s.cash) ? (parsePesos(s.cash) ?? -1) : undefined,
      maxSpend: s.kind === 'PURCHASE' ? (blank(s.maxSpend) ? (parsePesos(s.maxSpend) ?? -1) : undefined) : undefined,
    })),
    scheduledFor: draft.scheduled && draft.scheduledFor ? new Date(draft.scheduledFor).toISOString() : undefined,
    notes: blank(draft.notes),
  };
}

export type DraftErrors = { form?: string; stops: Record<number, Partial<Record<string, string>>> };

/** Validates with the shared schema and maps issues to the stop and field they belong to. */
export function validate(draft: JobDraft): { data: CreateJobInput } | { errors: DraftErrors } {
  if (draft.scheduled && !draft.scheduledFor) {
    return { errors: { form: 'Elegí fecha y hora para programar', stops: {} } };
  }
  const parsed = createJobInputSchema.safeParse(toPayload(draft));
  if (parsed.success) return { data: parsed.data };

  const errors: DraftErrors = { stops: {} };
  for (const issue of parsed.error.issues) {
    const [first, index, field] = issue.path;
    if (first === 'stops' && typeof index === 'number') {
      const name = String(field ?? 'kind');
      const friendly =
        name === 'location'
          ? 'Marcá el lugar en el mapa'
          : name === 'cashToCollect' || name === 'maxSpend'
            ? 'Monto inválido'
            : issue.message;
      errors.stops[index] = { ...errors.stops[index], [name]: errors.stops[index]?.[name] ?? friendly };
    } else {
      errors.form ??= issue.message;
    }
  }
  return { errors };
}

/** True when every stop has enough data to ask the API for a price. */
export function isQuotable(draft: JobDraft): boolean {
  return draft.stops.length > 0 && draft.stops.every((s) => s.location && s.address.trim().length >= 3);
}

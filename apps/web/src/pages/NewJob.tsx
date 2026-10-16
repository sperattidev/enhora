import { MAX_STOPS, type Quote, type StopKind } from '@enhora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { MapPicker } from '../components/MapPicker';
import { Alert, Button, Card, Field, Input, PageTitle, Select, Spinner, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAccount } from '../lib/auth';
import { formatMoney, STOP_KIND_LABEL } from '../lib/format';
import type { JobDetail } from '../lib/types';
import {
  emptyStop,
  isQuotable,
  toPayload,
  validate,
  type DraftErrors,
  type JobDraft,
  type StopDraft,
} from './new-job-form';

const KINDS: StopKind[] = ['PICKUP', 'DROPOFF', 'ERRAND', 'PURCHASE'];

/** Debounced copy of a value, so the price is not requested on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function NewJobPage() {
  const account = useAccount();
  const merchant = account.merchant!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // One key per form: a double tap or a retry after a network error never creates two envíos.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<JobDraft>(() => ({
    stops: [emptyStop('PICKUP', merchant.address, merchant.location), emptyStop('DROPOFF')],
    scheduled: false,
    scheduledFor: '',
    notes: '',
  }));
  const [errors, setErrors] = useState<DraftErrors>({ stops: {} });
  const [openMap, setOpenMap] = useState<string | null>(draft.stops[1]!.key);

  const quotePayload = useDebounced(isQuotable(draft) ? JSON.stringify(toPayload(draft)) : null, 600);
  const quote = useQuery({
    queryKey: ['quote', quotePayload],
    enabled: quotePayload !== null,
    retry: false,
    queryFn: ({ signal }) => api<Quote>('/jobs/quote', { method: 'POST', body: JSON.parse(quotePayload!), signal }),
  });
  const uncovered = new Set<number>(
    quote.error instanceof ApiError && Array.isArray(quote.error.body.stopIndexes)
      ? (quote.error.body.stopIndexes as number[])
      : [],
  );

  const create = useMutation({
    mutationFn: (body: unknown) =>
      api<JobDetail>('/jobs', { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate(`/envios/${job.id}`, { replace: true });
    },
  });

  const updateStop = (key: string, patch: Partial<StopDraft>) =>
    setDraft((d) => ({ ...d, stops: d.stops.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));

  function addStop() {
    const stop = emptyStop('DROPOFF');
    setDraft((d) => ({ ...d, stops: [...d.stops, stop] }));
    setOpenMap(stop.key);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = validate(draft);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({ stops: {} });
    create.mutate(result.data);
  }

  return (
    <>
      <PageTitle title="Pedir cadete" />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {draft.stops.map((stop, index) => (
          <StopCard
            key={stop.key}
            stop={stop}
            index={index}
            errors={errors.stops[index] ?? {}}
            uncovered={uncovered.has(index)}
            mapOpen={openMap === stop.key}
            onToggleMap={() => setOpenMap((k) => (k === stop.key ? null : stop.key))}
            onChange={(patch) => updateStop(stop.key, patch)}
            onRemove={
              draft.stops.length > 1
                ? () => setDraft((d) => ({ ...d, stops: d.stops.filter((s) => s.key !== stop.key) }))
                : undefined
            }
          />
        ))}

        {draft.stops.length < MAX_STOPS && (
          <Button variant="secondary" onClick={addStop}>
            + Agregar parada
          </Button>
        )}

        <Card>
          <label className="flex items-center gap-3 font-medium">
            <input
              type="checkbox"
              className="size-5 accent-brand-700"
              checked={draft.scheduled}
              onChange={(e) => setDraft((d) => ({ ...d, scheduled: e.target.checked }))}
            />
            Programar para más tarde
          </label>
          {draft.scheduled && (
            <div className="mt-3">
              <Field label="Fecha y hora" hint="Empezamos a buscar cadete 15 minutos antes">
                {(p) => (
                  <Input
                    {...p}
                    type="datetime-local"
                    value={draft.scheduledFor}
                    onChange={(e) => setDraft((d) => ({ ...d, scheduledFor: e.target.value }))}
                  />
                )}
              </Field>
            </div>
          )}
          <div className="mt-3">
            <Field label="Notas para el cadete (opcional)">
              {(p) => (
                <Textarea
                  {...p}
                  value={draft.notes}
                  maxLength={500}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              )}
            </Field>
          </div>
        </Card>

        <Card className="sticky bottom-3 z-10">
          <div className="flex items-center justify-between gap-3">
            <div aria-live="polite">
              {quotePayload === null && (
                <p className="text-sm text-slate-600">Completá las direcciones para ver el precio.</p>
              )}
              {quote.isFetching && <Spinner className="size-5 text-brand-700" />}
              {quote.data && !quote.isFetching && (
                <>
                  <p className="text-2xl font-bold">{formatMoney(quote.data.total)}</p>
                  <p className="text-xs text-slate-500">
                    Zona {formatMoney(quote.data.base)}
                    {quote.data.extraStops > 0 && ` · paradas extra ${formatMoney(quote.data.extraStops)}`}
                    {quote.data.errands > 0 && ` · trámites ${formatMoney(quote.data.errands)}`}
                    {quote.data.surcharge > 0 && ` · recargo ${formatMoney(quote.data.surcharge)}`}
                  </p>
                </>
              )}
              {quote.isError && !quote.isFetching && <p className="text-sm text-red-700">{quote.error.message}</p>}
            </div>
            <Button type="submit" loading={create.isPending} disabled={merchant.status !== 'ACTIVE'}>
              {draft.scheduled ? 'Programar' : 'Pedir cadete'}
            </Button>
          </div>
          {errors.form && <p className="mt-2 text-sm text-red-700">{errors.form}</p>}
          {create.isError && (
            <div className="mt-3">
              <Alert tone="danger">{create.error.message}</Alert>
            </div>
          )}
        </Card>
      </form>
    </>
  );
}

interface StopCardProps {
  stop: StopDraft;
  index: number;
  errors: Partial<Record<string, string>>;
  uncovered: boolean;
  mapOpen: boolean;
  onToggleMap: () => void;
  onChange: (patch: Partial<StopDraft>) => void;
  onRemove?: () => void;
}

function StopCard({ stop, index, errors, uncovered, mapOpen, onToggleMap, onChange, onRemove }: StopCardProps) {
  // The pickup is usually the merchant's own counter: keep its optional fields out of the way.
  const [expanded, setDetailsOpen] = useState(stop.kind !== 'PICKUP');
  const detailsOpen = expanded || Boolean(errors.contactName || errors.contactPhone || errors.instructions);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">
          <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">
            {index + 1}
          </span>
          {STOP_KIND_LABEL[stop.kind]}
        </h2>
        {onRemove && (
          <Button
            variant="ghost"
            className="min-h-9 px-2 text-red-700"
            onClick={onRemove}
            aria-label={`Quitar parada ${index + 1}`}
          >
            Quitar
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tipo" error={errors.kind}>
          {(p) => (
            <Select {...p} value={stop.kind} onChange={(e) => onChange({ kind: e.target.value as StopKind })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {STOP_KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Dirección" error={errors.address}>
          {(p) => (
            <Input
              {...p}
              value={stop.address}
              placeholder="Calle y número"
              onChange={(e) => onChange({ address: e.target.value })}
            />
          )}
        </Field>
      </div>

      <div className="mt-3">
        {uncovered && (
          <div className="mb-2">
            <Alert tone="warning">Esta dirección está fuera de la zona de cobertura.</Alert>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p
            className={`text-sm ${stop.location ? 'text-brand-800' : errors.location ? 'text-red-700' : 'text-slate-600'}`}
          >
            {stop.location ? 'Ubicación marcada' : (errors.location ?? 'Falta marcar en el mapa')}
          </p>
          <Button variant="secondary" className="min-h-9" onClick={onToggleMap} aria-expanded={mapOpen}>
            {mapOpen ? 'Ocultar mapa' : 'Marcar en el mapa'}
          </Button>
        </div>
        {mapOpen && (
          <div className="mt-3">
            <MapPicker
              value={stop.location}
              onChange={(location) => onChange({ location })}
              label={`Mapa de la parada ${index + 1}`}
            />
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {stop.kind === 'DROPOFF' && (
          <Field label="Cobrar al entregar (opcional)" hint="En pesos" error={errors.cashToCollect}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                placeholder="$ 0"
                value={stop.cash}
                onChange={(e) => onChange({ cash: e.target.value })}
              />
            )}
          </Field>
        )}
        {stop.kind === 'PURCHASE' && (
          <Field label="Gastar como máximo" hint="En pesos" error={errors.maxSpend}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                placeholder="$ 0"
                value={stop.maxSpend}
                onChange={(e) => onChange({ maxSpend: e.target.value })}
              />
            )}
          </Field>
        )}
      </div>

      {detailsOpen ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Contacto (opcional)" error={errors.contactName}>
            {(p) => (
              <Input {...p} value={stop.contactName} onChange={(e) => onChange({ contactName: e.target.value })} />
            )}
          </Field>
          <Field label="Celular (opcional)" hint="Para avisarle por WhatsApp" error={errors.contactPhone}>
            {(p) => (
              <Input
                {...p}
                type="tel"
                value={stop.contactPhone}
                onChange={(e) => onChange({ contactPhone: e.target.value })}
              />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Indicaciones (opcional)" error={errors.instructions}>
              {(p) => (
                <Textarea
                  {...p}
                  value={stop.instructions}
                  maxLength={500}
                  placeholder="Timbre, piso, qué retirar o comprar…"
                  onChange={(e) => onChange({ instructions: e.target.value })}
                />
              )}
            </Field>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="mt-3 text-sm font-medium text-brand-700 hover:underline"
        >
          + Contacto e indicaciones
        </button>
      )}
    </Card>
  );
}

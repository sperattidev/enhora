import { STOP_FAILURE_REASONS, type StopFailureReason } from '@enhora/shared';
import {
  Alert,
  api,
  Badge,
  Button,
  Card,
  Field,
  formatMoney,
  Input,
  Select,
  STOP_KIND_LABEL,
  STOP_STATUS_LABEL,
  whatsappLink,
  type CourierJob,
  type CourierJobStop,
} from '@enhora/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { canRelease, currentStopIndex, directionsLink, nextAction } from '../logic';

const FAILURE_LABEL: Record<StopFailureReason, string> = {
  CUSTOMER_ABSENT: 'No había nadie',
  WRONG_ADDRESS: 'La dirección está mal',
  REJECTED: 'No lo quisieron recibir',
  OTHER: 'Otro motivo',
};

type Advance = { to: string; deliveryCode?: string; failureReason?: StopFailureReason; note?: string };

export function ActiveJob({ job, onChanged }: { job: CourierJob; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const index = currentStopIndex(job.stops);
  const stop = index >= 0 ? job.stops[index] : undefined;

  const advance = useMutation({
    mutationFn: (body: Advance) =>
      api<CourierJob>(`/courier/jobs/${job.id}/stops/${index}/advance`, { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['courier-jobs'] });
      onChanged();
    },
  });
  const release = useMutation({
    mutationFn: () => api(`/courier/jobs/${job.id}/release`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['courier-jobs'] }),
  });

  return (
    <Card className="p-0 sm:p-0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <p className="font-semibold">{job.merchantName}</p>
          <p className="text-sm text-slate-600">Ganás {formatMoney(job.earningsCents)}</p>
        </div>
        <a
          href={`tel:${job.merchantPhone}`}
          className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-200"
        >
          Llamar al local
        </a>
      </div>

      <ol className="flex gap-1 px-4 pt-3" aria-label="Paradas">
        {job.stops.map((s, i) => (
          <li
            key={s.position}
            title={`${STOP_KIND_LABEL[s.kind]}: ${STOP_STATUS_LABEL[s.status]}`}
            className={`h-1.5 flex-1 rounded-full ${
              s.status === 'DONE'
                ? 'bg-brand-600'
                : s.status === 'FAILED'
                  ? 'bg-red-400'
                  : i === index
                    ? 'bg-amber-400'
                    : 'bg-slate-200'
            }`}
          />
        ))}
      </ol>

      {job.notes && <p className="px-4 pt-3 text-sm text-slate-600">Nota del comercio: {job.notes}</p>}

      {stop && (
        <CurrentStop
          key={`${stop.position}-${stop.status}`}
          stop={stop}
          number={index + 1}
          total={job.stops.length}
          loading={advance.isPending}
          error={advance.error?.message}
          onAdvance={(body) => advance.mutate(body)}
        />
      )}

      {canRelease(job.stops) && (
        <div className="border-t border-slate-100 p-4">
          {release.isError && <Alert tone="danger">{release.error.message}</Alert>}
          <Button
            variant="ghost"
            className="w-full text-slate-500"
            loading={release.isPending}
            onClick={() => release.mutate()}
          >
            No puedo hacer este envío
          </Button>
        </div>
      )}
    </Card>
  );
}

interface CurrentStopProps {
  stop: CourierJobStop;
  number: number;
  total: number;
  loading: boolean;
  error?: string;
  onAdvance: (body: Advance) => void;
}

function CurrentStop({ stop, number, total, loading, error, onAdvance }: CurrentStopProps) {
  const action = nextAction(stop);
  const [mode, setMode] = useState<'main' | 'code' | 'fail'>('main');
  const [code, setCode] = useState('');
  const [reason, setReason] = useState<StopFailureReason>('CUSTOMER_ABSENT');
  const [note, setNote] = useState('');

  function primary() {
    if (!action) return;
    if (action.needsCode) setMode('code');
    else onAdvance({ to: action.to });
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (/^\d{4}$/.test(code)) onAdvance({ to: 'DONE', deliveryCode: code });
  }

  function submitFail(e: FormEvent) {
    e.preventDefault();
    onAdvance({ to: 'FAILED', failureReason: reason, note: note.trim() || undefined });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge tone="progress">
          Parada {number} de {total} · {STOP_KIND_LABEL[stop.kind]}
        </Badge>
        <span className="text-xs text-slate-500">{STOP_STATUS_LABEL[stop.status]}</span>
      </div>
      <p className="text-xl leading-tight font-bold">{stop.address}</p>

      <div className="grid grid-cols-2 gap-2">
        <a
          href={directionsLink(stop.location)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white"
        >
          Cómo llegar
        </a>
        {stop.contactPhone ? (
          <a
            href={whatsappLink(
              `Hola${stop.contactName ? ` ${stop.contactName}` : ''}, soy el cadete de EnHora.`,
              stop.contactPhone,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-white"
          >
            WhatsApp{stop.contactName ? ` a ${stop.contactName}` : ''}
          </a>
        ) : (
          <span className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-3 text-center text-xs text-slate-500">
            Sin teléfono de contacto
          </span>
        )}
      </div>

      {stop.instructions && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{stop.instructions}</p>}
      {stop.cashToCollectCents ? (
        <p className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900 ring-1 ring-amber-200">
          Cobrar {formatMoney(stop.cashToCollectCents)} en efectivo
        </p>
      ) : null}
      {stop.maxSpendCents ? (
        <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
          Gastar como máximo {formatMoney(stop.maxSpendCents)}
        </p>
      ) : null}

      {error && <Alert tone="danger">{error}</Alert>}

      {mode === 'main' && action && (
        <>
          <Button onClick={primary} loading={loading} className="min-h-14 text-base">
            {action.label}
          </Button>
          {stop.status === 'ARRIVED' && (
            <Button variant="ghost" className="text-red-700" onClick={() => setMode('fail')}>
              No se pudo
            </Button>
          )}
        </>
      )}

      {mode === 'code' && (
        <form onSubmit={submitCode} className="flex flex-col gap-3">
          <Field label="Código de entrega" hint="Pedíselo a quien recibe: son 4 números">
            {(p) => (
              <Input
                {...p}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="text-center font-mono text-3xl tracking-[0.5em]"
              />
            )}
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => setMode('main')}>
              Volver
            </Button>
            <Button type="submit" loading={loading} disabled={code.length !== 4} className="col-span-2">
              Confirmar entrega
            </Button>
          </div>
        </form>
      )}

      {mode === 'fail' && (
        <form onSubmit={submitFail} className="flex flex-col gap-3">
          <Field label="¿Qué pasó?">
            {(p) => (
              <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as StopFailureReason)}>
                {STOP_FAILURE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {FAILURE_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Detalle (opcional)">
            {(p) => <Input {...p} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setMode('main')}>
              Volver
            </Button>
            <Button type="submit" variant="danger" loading={loading}>
              Confirmar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

import type { JobStatus } from '@enhora/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Alert, Badge, Button, Card, Field, Input, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useAccount } from '../lib/auth';
import {
  ACTIVE_JOB_STATUSES,
  CANCELLABLE_JOB_STATUSES,
  formatDateTime,
  formatMoney,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  STOP_KIND_LABEL,
  STOP_STATUS_LABEL,
} from '../lib/format';
import { whatsappLink } from '../lib/phone';
import type { JobDetail, JobEvent, JobStop } from '../lib/types';

export function trackingUrl(token: string): string {
  return `${window.location.origin}/seguimiento/${token}`;
}

export function deliveryMessage(merchantName: string, token: string, stop: JobStop): string {
  const code = stop.deliveryCode ? ` Cuando llegue el cadete, decile este código: ${stop.deliveryCode}.` : '';
  const cash = stop.cashToCollectCents ? ` Tenés que abonar ${formatMoney(stop.cashToCollectCents)}.` : '';
  return `Hola! Tu pedido de ${merchantName} va en camino. Seguilo acá: ${trackingUrl(token)}.${code}${cash}`;
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const account = useAccount();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['job', id],
    queryFn: ({ signal }) => api<JobDetail>(`/jobs/${id}`, { signal }),
    refetchInterval: (q) => (q.state.data && ACTIVE_JOB_STATUSES.includes(q.state.data.status) ? 8_000 : false),
  });

  const onChanged = (job: JobDetail) => {
    queryClient.setQueryData(['job', id], job);
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
  };
  const cancel = useMutation({
    mutationFn: (reason: string) => api<JobDetail>(`/jobs/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: onChanged,
  });
  const relaunch = useMutation({
    mutationFn: () => api<JobDetail>(`/jobs/${id}/relaunch`, { method: 'POST' }),
    onSuccess: onChanged,
  });

  if (query.isPending) {
    return (
      <div className="flex justify-center py-10 text-brand-700">
        <Spinner />
      </div>
    );
  }
  if (query.isError) return <Alert tone="danger">{query.error.message}</Alert>;
  const job = query.data;
  const merchantName = account.merchant!.displayName;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/envios" className="text-sm font-medium text-brand-700 hover:underline">
        ← Envíos
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
            <p className="mt-2 text-sm text-slate-600">
              {job.scheduledFor
                ? `Programado para ${formatDateTime(job.scheduledFor)}`
                : `Pedido ${formatDateTime(job.createdAt)}`}
            </p>
            {job.courierName && (
              <p className="mt-1 font-medium">
                Cadete: <span className="text-brand-800">{job.courierName}</span>
              </p>
            )}
          </div>
          <p className="text-2xl font-bold">{formatMoney(job.priceCents)}</p>
        </div>
        <StatusHint status={job.status} />
        {job.cancelReason && <p className="mt-2 text-sm text-slate-600">Motivo: {job.cancelReason}</p>}
      </Card>

      {ACTIVE_JOB_STATUSES.includes(job.status) && <ShareCard job={job} merchantName={merchantName} />}

      <Card>
        <h2 className="mb-3 font-semibold">Paradas</h2>
        <ol className="flex flex-col gap-4">
          {job.stops.map((stop) => (
            <StopRow key={stop.id} stop={stop} />
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Historial</h2>
        <ol className="flex flex-col gap-2 text-sm">
          {job.events.map((event, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{describeEvent(event)}</span>
              <time className="shrink-0 text-slate-500" dateTime={event.createdAt}>
                {formatDateTime(event.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      </Card>

      {job.status === 'EXPIRED' && (
        <Button loading={relaunch.isPending} onClick={() => relaunch.mutate()} block>
          Volver a buscar cadete
        </Button>
      )}
      {relaunch.isError && <Alert tone="danger">{relaunch.error.message}</Alert>}
      {CANCELLABLE_JOB_STATUSES.includes(job.status) && (
        <CancelForm
          loading={cancel.isPending}
          error={cancel.error?.message}
          onCancel={(reason) => cancel.mutate(reason)}
        />
      )}
    </div>
  );
}

function StatusHint({ status }: { status: JobStatus }) {
  const hints: Partial<Record<JobStatus, string>> = {
    SEARCHING: 'Estamos ofreciendo tu envío a los cadetes más cercanos.',
    ASSIGNED: 'El cadete va camino a retirar.',
    IN_PROGRESS: 'El cadete ya retiró y está entregando.',
    EXPIRED: 'Ningún cadete aceptó a tiempo. Podés volver a buscar.',
  };
  return hints[status] ? <p className="mt-3 text-sm text-slate-700">{hints[status]}</p> : null;
}

function ShareCard({ job, merchantName }: { job: JobDetail; merchantName: string }) {
  const [copied, setCopied] = useState(false);
  const dropoffs = job.stops.filter((s) => s.kind === 'DROPOFF');
  async function copy() {
    await navigator.clipboard.writeText(trackingUrl(job.trackingToken));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Card>
      <h2 className="font-semibold">Avisale al cliente</h2>
      <p className="mt-1 text-sm text-slate-600">
        Le mandamos el link de seguimiento y el código que tiene que darle al cadete.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {dropoffs.map((stop) => (
          <a
            key={stop.id}
            href={whatsappLink(deliveryMessage(merchantName, job.trackingToken, stop), stop.contactPhone)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-white hover:brightness-95"
          >
            WhatsApp {stop.contactName ? `a ${stop.contactName}` : `· ${stop.address}`}
          </a>
        ))}
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? 'Link copiado' : 'Copiar link de seguimiento'}
        </Button>
      </div>
    </Card>
  );
}

function StopRow({ stop }: { stop: JobStop }) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-1 size-3 shrink-0 rounded-full ${
          stop.status === 'DONE'
            ? 'bg-brand-600'
            : stop.status === 'FAILED'
              ? 'bg-red-500'
              : stop.status === 'PENDING'
                ? 'bg-slate-300'
                : 'bg-amber-400'
        }`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {STOP_KIND_LABEL[stop.kind]} · {stop.address}
        </p>
        <p className="text-sm text-slate-600">
          {STOP_STATUS_LABEL[stop.status]}
          {stop.contactName && ` · ${stop.contactName}`}
          {stop.cashToCollectCents ? ` · Cobrar ${formatMoney(stop.cashToCollectCents)}` : ''}
          {stop.maxSpendCents ? ` · Hasta ${formatMoney(stop.maxSpendCents)}` : ''}
        </p>
        {stop.deliveryCode && stop.status !== 'DONE' && (
          <p className="mt-1 inline-flex items-center gap-2 rounded-lg bg-brand-50 px-2 py-1 text-sm text-brand-900">
            Código de entrega <strong className="font-mono text-base tracking-widest">{stop.deliveryCode}</strong>
          </p>
        )}
      </div>
    </li>
  );
}

const EVENT_LABEL: Record<string, string> = {
  SCHEDULED: 'Envío programado',
  SEARCHING: 'Buscando cadete',
  ASSIGNED: 'Cadete asignado',
  IN_PROGRESS: 'Pedido retirado',
  COMPLETED: 'Envío terminado',
  CANCELLED: 'Envío cancelado',
  EXPIRED: 'Nadie aceptó a tiempo',
};

function describeEvent(event: JobEvent): string {
  if (event.metadata?.type === 'CODE_MISMATCH') return `Parada ${event.stopPosition! + 1}: código incorrecto`;
  if (event.stopPosition !== null) {
    const status = STOP_STATUS_LABEL[event.toStatus as keyof typeof STOP_STATUS_LABEL] ?? event.toStatus;
    return `Parada ${event.stopPosition + 1}: ${status.toLowerCase()}`;
  }
  return EVENT_LABEL[event.toStatus] ?? event.toStatus;
}

function CancelForm({
  loading,
  error,
  onCancel,
}: {
  loading: boolean;
  error?: string;
  onCancel: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <Button variant="danger" onClick={() => setOpen(true)} block>
        Cancelar envío
      </Button>
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length >= 3) onCancel(reason.trim());
  }
  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="¿Por qué lo cancelás?" error={error}>
          {(p) => <Input {...p} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}
        </Field>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">
            Volver
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={loading}
            disabled={reason.trim().length < 3}
            className="flex-1"
          >
            Confirmar cancelación
          </Button>
        </div>
      </form>
    </Card>
  );
}

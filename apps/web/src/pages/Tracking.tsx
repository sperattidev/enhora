import type { JobStatus } from '@enhora/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import {
  Brand,
  Card,
  Spinner,
  api,
  ApiError,
  formatDateTime,
  STOP_KIND_LABEL,
  STOP_STATUS_LABEL,
  type TrackingView,
} from '@enhora/ui';

const STEPS: { status: JobStatus[]; label: string }[] = [
  { status: ['SCHEDULED', 'SEARCHING', 'EXPIRED'], label: 'Pedido recibido' },
  { status: ['ASSIGNED'], label: 'Cadete en camino al local' },
  { status: ['IN_PROGRESS'], label: 'Tu pedido va en camino' },
  { status: ['COMPLETED'], label: 'Entregado' },
];

const HEADLINE: Record<JobStatus, string> = {
  SCHEDULED: 'Tu envío está programado',
  SEARCHING: 'Estamos buscando un cadete',
  EXPIRED: 'Estamos buscando un cadete',
  ASSIGNED: 'Un cadete va a retirar tu pedido',
  IN_PROGRESS: 'Tu pedido va en camino',
  COMPLETED: '¡Entregado!',
  CANCELLED: 'El envío fue cancelado',
};

/** Public page the customer opens from WhatsApp. No login, no personal data. */
export function TrackingPage() {
  const { token } = useParams<{ token: string }>();
  const query = useQuery({
    queryKey: ['tracking', token],
    queryFn: ({ signal }) => api<TrackingView>(`/t/${token}`, { auth: false, signal }),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
    refetchInterval: (q) =>
      q.state.data && !['COMPLETED', 'CANCELLED'].includes(q.state.data.status) ? 15_000 : false,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-8">
      <Brand className="text-xl" />
      {query.isPending && (
        <div className="flex justify-center py-16 text-brand-700" role="status" aria-label="Cargando">
          <Spinner className="size-8" />
        </div>
      )}
      {query.isError && (
        <Card>
          <h1 className="text-lg font-bold">No encontramos este seguimiento</h1>
          <p className="mt-1 text-slate-600">El link puede estar mal copiado o ya venció.</p>
        </Card>
      )}
      {query.data && <TrackingCard view={query.data} />}
      <p className="mt-auto text-center text-xs text-slate-500">Seguimiento de envíos por EnHora · Firmat</p>
    </main>
  );
}

function TrackingCard({ view }: { view: TrackingView }) {
  const current = STEPS.findIndex((s) => s.status.includes(view.status));
  const cancelled = view.status === 'CANCELLED';
  return (
    <>
      <Card>
        <p className="text-sm text-slate-500">{view.merchantName}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{HEADLINE[view.status]}</h1>
        {view.courierName && !cancelled && (
          <p className="mt-2 text-slate-700">
            Te lo lleva <strong>{view.courierName}</strong>.
          </p>
        )}
        {view.scheduledFor && view.status === 'SCHEDULED' && (
          <p className="mt-2 text-slate-700">Programado para {formatDateTime(view.scheduledFor)}.</p>
        )}
        {view.status === 'IN_PROGRESS' && (
          <p className="mt-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
            Tené a mano el código de entrega que te pasó el comercio: el cadete te lo va a pedir.
          </p>
        )}
      </Card>

      {!cancelled && (
        <Card>
          <ol className="flex flex-col gap-4" aria-label="Estado del envío">
            {STEPS.map((step, i) => {
              const done = i < current || view.status === 'COMPLETED';
              const active = i === current && view.status !== 'COMPLETED';
              return (
                <li key={step.label} className="flex items-center gap-3" aria-current={active ? 'step' : undefined}>
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? 'bg-brand-700 text-white'
                        : active
                          ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-600'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {done ? '✓' : i + 1}
                  </span>
                  <span className={done || active ? 'font-medium' : 'text-slate-500'}>{step.label}</span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {view.stops.length > 2 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Recorrido</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {view.stops.map((s, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {i + 1}. {STOP_KIND_LABEL[s.kind]}
                </span>
                <span className="text-slate-600">{STOP_STATUS_LABEL[s.status]}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

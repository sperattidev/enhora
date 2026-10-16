import {
  Alert,
  api,
  Badge,
  Card,
  formatDateTime,
  formatMoney,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  PageTitle,
  Spinner,
} from '@enhora/ui';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { AdminJob, Overview } from './types';

/** A search older than this deserves attention: probably no courier nearby. */
const SLOW_SEARCH_MS = 3 * 60_000;

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: ({ signal }) => api<Overview>('/admin/overview', { signal }),
    refetchInterval: 10_000,
  });
  const jobs = useQuery({
    queryKey: ['admin', 'jobs', 'active'],
    queryFn: ({ signal }) => api<AdminJob[]>('/admin/jobs?scope=active&limit=100', { signal }),
    refetchInterval: 10_000,
  });

  const o = overview.data;
  // "Now" is when the list was fetched: render stays pure and the warning refreshes with the data.
  const now = jobs.dataUpdatedAt;

  return (
    <>
      <PageTitle title="Operaciones" />
      {overview.isError && <Alert tone="danger">{overview.error.message}</Alert>}
      {o && (
        <>
          {(o.pendingCouriers > 0 || o.pendingMerchants > 0) && (
            <div className="mb-4">
              <Alert tone="warning">
                Hay {o.pendingCouriers} cadetes y {o.pendingMerchants} comercios esperando aprobación.{' '}
                <Link to="/panel/aprobaciones" className="font-semibold underline">
                  Revisarlos
                </Link>
              </Alert>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Buscando cadete" value={o.searching} tone={o.searching > 0 ? 'info' : undefined} />
            <Stat label="En curso" value={o.assigned + o.inProgress} />
            <Stat label="Sin cadete" value={o.expired} tone={o.expired > 0 ? 'warning' : undefined} />
            <Stat label="Programados" value={o.scheduled} />
            <Stat label="Entregados hoy" value={o.completedToday} hint={formatMoney(o.deliveredValueToday)} />
            <Stat label="Cancelados hoy" value={o.cancelledToday} />
            <Stat label="Cadetes en línea" value={o.couriersOnline} hint={`de ${o.couriersApproved} aprobados`} />
            <Stat label="Efectivo en manos de cadetes" value={formatMoney(o.cashInHands)} />
          </div>
        </>
      )}
      {overview.isPending && (
        <div className="flex justify-center py-10 text-brand-700">
          <Spinner />
        </div>
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold">Envíos activos</h2>
      {jobs.isError && <Alert tone="danger">{jobs.error.message}</Alert>}
      {jobs.data?.length === 0 && (
        <Card>
          <p className="text-center text-slate-600">No hay envíos activos.</p>
        </Card>
      )}
      {jobs.data && jobs.data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold">Comercio</th>
                <th className="px-4 py-3 font-semibold">Destino</th>
                <th className="px-4 py-3 font-semibold">Cadete</th>
                <th className="px-4 py-3 font-semibold">Pedido</th>
                <th className="px-4 py-3 text-right font-semibold">Precio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.data.map((job) => {
                const slow =
                  job.status === 'SEARCHING' &&
                  job.searchingSince !== null &&
                  now - Date.parse(job.searchingSince) > SLOW_SEARCH_MS;
                return (
                  <tr key={job.id} className={slow ? 'bg-amber-50' : undefined}>
                    <td className="px-4 py-3">
                      <Badge tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
                      {slow && <span className="ml-2 text-xs font-medium text-amber-800">hace más de 3 min</span>}
                    </td>
                    <td className="px-4 py-3 font-medium">{job.merchantName}</td>
                    <td className="px-4 py-3">{job.destination}</td>
                    <td className="px-4 py-3">{job.courierName ?? <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {job.scheduledFor ? `para ${formatDateTime(job.scheduledFor)}` : formatDateTime(job.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      <a
                        href={`/seguimiento/${job.trackingToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        title="Ver seguimiento"
                      >
                        {formatMoney(job.priceCents)}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'info' | 'warning';
}) {
  const ring = tone === 'warning' ? 'ring-amber-300' : tone === 'info' ? 'ring-sky-300' : 'ring-slate-200';
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${ring}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

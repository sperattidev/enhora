import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  Alert,
  Badge,
  Button,
  Card,
  PageTitle,
  Spinner,
  api,
  useAccount,
  ACTIVE_JOB_STATUSES,
  formatDateTime,
  formatMoney,
  JOB_STATUS_LABEL,
  JOB_STATUS_TONE,
  STOP_STATUS_LABEL,
  type JobSummary,
} from '@enhora/ui';

type Filter = 'active' | 'all';

export function JobsPage() {
  const account = useAccount();
  const [filter, setFilter] = useState<Filter>('active');
  const query = useInfiniteQuery({
    queryKey: ['jobs'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<{ items: JobSummary[]; nextBefore: string | null }>(
        `/jobs?limit=20${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    getNextPageParam: (last) => last.nextBefore,
    refetchInterval: 15_000,
  });

  const all = query.data?.pages.flatMap((p) => p.items) ?? [];
  const items = filter === 'active' ? all.filter((j) => ACTIVE_JOB_STATUSES.includes(j.status)) : all;
  const canCreate = account.merchant?.status === 'ACTIVE';

  return (
    <>
      <PageTitle
        title="Envíos"
        action={
          canCreate && (
            <Link
              to="/envios/nuevo"
              className="inline-flex min-h-11 items-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              Pedir cadete
            </Link>
          )
        }
      />

      <div role="tablist" aria-label="Filtrar envíos" className="mb-4 inline-flex rounded-xl bg-slate-200/70 p-1">
        {(
          [
            ['active', 'En curso'],
            ['all', 'Todos'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${filter === key ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isPending && (
        <div className="flex justify-center py-10 text-brand-700">
          <Spinner />
        </div>
      )}
      {query.isError && <Alert tone="danger">No pudimos cargar los envíos. {query.error.message}</Alert>}

      {query.isSuccess && items.length === 0 && (
        <Card className="text-center">
          <p className="font-medium">
            {filter === 'active' ? 'No tenés envíos en curso.' : 'Todavía no hiciste envíos.'}
          </p>
          {canCreate && <p className="mt-1 text-sm text-slate-600">Pedí un cadete y aparece acá al instante.</p>}
        </Card>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((job) => (
          <li key={job.id}>
            <Link
              to={`/envios/${job.id}`}
              className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-500"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{job.destination ?? 'Envío'}</p>
                  <p className="text-sm text-slate-500">
                    {job.scheduledFor
                      ? `Programado para ${formatDateTime(job.scheduledFor)}`
                      : formatDateTime(job.createdAt)}
                    {' · '}
                    {job.stopCount} {job.stopCount === 1 ? 'parada' : 'paradas'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={JOB_STATUS_TONE[job.status]}>{JOB_STATUS_LABEL[job.status]}</Badge>
                  <span className="text-sm font-semibold">{formatMoney(job.priceCents)}</span>
                </div>
              </div>
              {ACTIVE_JOB_STATUSES.includes(job.status) && (
                <ol className="mt-3 flex gap-1" aria-label="Avance de las paradas">
                  {job.stops.map((s, i) => (
                    <li
                      key={i}
                      title={STOP_STATUS_LABEL[s.status]}
                      className={`h-1.5 flex-1 rounded-full ${
                        s.status === 'DONE'
                          ? 'bg-brand-600'
                          : s.status === 'FAILED'
                            ? 'bg-red-400'
                            : s.status === 'PENDING'
                              ? 'bg-slate-200'
                              : 'bg-brand-300'
                      }`}
                    />
                  ))}
                </ol>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            Ver más
          </Button>
        </div>
      )}
    </>
  );
}

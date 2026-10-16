import { Alert, api, Button, Card, formatDateTime, formatMoney, PageTitle, Spinner } from '@enhora/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { AuditEntry } from './types';

const ACTION: Record<string, (d: Record<string, unknown>) => string> = {
  'courier.kyc': (d) =>
    ({ APPROVED: 'Aprobó a un cadete', REJECTED: 'Rechazó a un cadete', SUSPENDED: 'Suspendió a un cadete' })[
      String(d.kycStatus)
    ] ?? 'Cambió un cadete',
  'merchant.status': (d) => (d.status === 'ACTIVE' ? 'Activó un comercio' : 'Suspendió un comercio'),
  'user.status': (d) => (d.status === 'ACTIVE' ? 'Reactivó un usuario' : 'Suspendió un usuario'),
  'zone.create': (d) => `Creó la zona ${String(d.name)} (${formatMoney(Number(d.feeCents))})`,
  'zone.update': (d) =>
    d.active === false
      ? 'Desactivó una zona'
      : d.active === true
        ? 'Activó una zona'
        : d.feeCents
          ? `Cambió la tarifa de una zona a ${formatMoney(Number(d.feeCents))}`
          : 'Editó una zona',
  'pricing.update': () => 'Cambió las tarifas de la ciudad',
};

export function describeAudit(entry: Pick<AuditEntry, 'action' | 'details'>): string {
  return ACTION[entry.action]?.(entry.details ?? {}) ?? entry.action;
}

export function AuditPage() {
  const query = useInfiniteQuery({
    queryKey: ['admin', 'audit'],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) =>
      api<AuditEntry[]>(`/admin/audit?limit=50${pageParam ? `&before=${pageParam}` : ''}`, { signal }),
    getNextPageParam: (last) => (last.length === 50 ? last.at(-1)!.id : null),
  });
  const entries = query.data?.pages.flat() ?? [];

  return (
    <>
      <PageTitle title="Auditoría" />
      <p className="mb-4 text-sm text-slate-600">
        Todo cambio hecho desde este panel queda registrado con quién lo hizo y cuándo. No se puede borrar.
      </p>
      {query.isPending && (
        <div className="flex justify-center py-10 text-brand-700">
          <Spinner />
        </div>
      )}
      {query.isError && <Alert tone="danger">{query.error.message}</Alert>}
      {query.isSuccess && entries.length === 0 && (
        <Card>
          <p className="text-center text-slate-600">Todavía no hay cambios registrados.</p>
        </Card>
      )}
      {entries.length > 0 && (
        <Card className="p-0 sm:p-0">
          <ol className="divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span>
                  <span className="font-medium">{describeAudit(e)}</span>
                  <span className="text-sm text-slate-500"> · {e.adminEmail}</span>
                </span>
                <time className="text-sm text-slate-500" dateTime={e.createdAt}>
                  {formatDateTime(e.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </Card>
      )}
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

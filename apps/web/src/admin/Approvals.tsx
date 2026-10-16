import { Alert, api, Badge, Button, Card, formatDateTime, PageTitle, Spinner } from '@enhora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AdminCourier, AdminMerchant, KycStatus, MerchantStatus } from './types';

const VEHICLE: Record<string, string> = { MOTORCYCLE: 'Moto', BICYCLE: 'Bicicleta', CAR: 'Auto', ON_FOOT: 'A pie' };
const KYC_LABEL: Record<KycStatus, string> = {
  PENDING: 'Pendientes',
  APPROVED: 'Aprobados',
  REJECTED: 'Rechazados',
  SUSPENDED: 'Suspendidos',
};
const MERCHANT_LABEL: Record<MerchantStatus, string> = {
  PENDING: 'Pendientes',
  ACTIVE: 'Activos',
  SUSPENDED: 'Suspendidos',
};

type Tab = 'couriers' | 'merchants';

export function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('couriers');
  return (
    <>
      <PageTitle title="Aprobaciones" />
      <div role="tablist" className="mb-4 inline-flex rounded-xl bg-slate-200/70 p-1">
        {(
          [
            ['couriers', 'Cadetes'],
            ['merchants', 'Comercios'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${tab === key ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'couriers' ? <Couriers /> : <Merchants />}
    </>
  );
}

function StatusFilter<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {(Object.keys(options) as T[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`rounded-full px-3 py-1 text-sm ${value === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}
        >
          {options[key]}
        </button>
      ))}
    </div>
  );
}

function Couriers() {
  const [status, setStatus] = useState<KycStatus>('PENDING');
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['admin', 'couriers', status],
    queryFn: ({ signal }) => api<AdminCourier[]>(`/admin/couriers?kycStatus=${status}`, { signal }),
  });
  const decide = useMutation({
    mutationFn: ({ id, kycStatus }: { id: string; kycStatus: KycStatus }) =>
      api(`/admin/couriers/${id}/kyc`, { method: 'PATCH', body: { kycStatus } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <>
      <StatusFilter value={status} options={KYC_LABEL} onChange={setStatus} />
      {decide.isError && <Alert tone="danger">{decide.error.message}</Alert>}
      <List loading={list.isPending} error={list.error?.message} empty={list.data?.length === 0}>
        {list.data?.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{c.fullName}</p>
                <p className="text-sm text-slate-600">
                  DNI {c.dni} · {VEHICLE[c.vehicle] ?? c.vehicle} · {c.phone ?? 'sin teléfono'} · {c.email}
                </p>
                <p className="text-xs text-slate-500">Registrado {formatDateTime(c.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                {c.kycStatus !== 'APPROVED' && (
                  <Button
                    onClick={() => decide.mutate({ id: c.id, kycStatus: 'APPROVED' })}
                    loading={decide.isPending && decide.variables?.id === c.id}
                  >
                    Aprobar
                  </Button>
                )}
                {c.kycStatus === 'PENDING' && (
                  <Button variant="danger" onClick={() => decide.mutate({ id: c.id, kycStatus: 'REJECTED' })}>
                    Rechazar
                  </Button>
                )}
                {c.kycStatus === 'APPROVED' && (
                  <Button variant="danger" onClick={() => decide.mutate({ id: c.id, kycStatus: 'SUSPENDED' })}>
                    Suspender
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </List>
      {status === 'PENDING' && (
        <p className="mt-4 text-sm text-slate-500">
          Antes de aprobar, pedile por WhatsApp foto del DNI, licencia, seguro y constancia de monotributo. La carga de
          documentos dentro de la app llega en una próxima versión.
        </p>
      )}
    </>
  );
}

function Merchants() {
  const [status, setStatus] = useState<MerchantStatus>('PENDING');
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['admin', 'merchants', status],
    queryFn: ({ signal }) => api<AdminMerchant[]>(`/admin/merchants?status=${status}`, { signal }),
  });
  const decide = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'ACTIVE' | 'SUSPENDED' }) =>
      api(`/admin/merchants/${id}/status`, { method: 'PATCH', body: { status: next } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  return (
    <>
      <StatusFilter value={status} options={MERCHANT_LABEL} onChange={setStatus} />
      {decide.isError && <Alert tone="danger">{decide.error.message}</Alert>}
      <List loading={list.isPending} error={list.error?.message} empty={list.data?.length === 0}>
        {list.data?.map((m) => (
          <Card key={m.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  {m.displayName}
                  {m.status === 'SUSPENDED' && <Badge tone="danger">Suspendido</Badge>}
                </p>
                <p className="text-sm text-slate-600">
                  {m.legalName} · CUIT {formatCuit(m.cuit)} · {m.phone}
                </p>
                <p className="text-sm text-slate-600">{m.address}</p>
                <p className="text-xs text-slate-500">Registrado {formatDateTime(m.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                {m.status !== 'ACTIVE' && (
                  <Button
                    onClick={() => decide.mutate({ id: m.id, next: 'ACTIVE' })}
                    loading={decide.isPending && decide.variables?.id === m.id}
                  >
                    Activar
                  </Button>
                )}
                {m.status === 'ACTIVE' && (
                  <Button variant="danger" onClick={() => decide.mutate({ id: m.id, next: 'SUSPENDED' })}>
                    Suspender
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </List>
    </>
  );
}

function formatCuit(cuit: string): string {
  return cuit.length === 11 ? `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}` : cuit;
}

function List({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error?: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-10 text-brand-700">
        <Spinner />
      </div>
    );
  }
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (empty) {
    return (
      <Card>
        <p className="text-center text-slate-600">No hay nada en esta lista.</p>
      </Card>
    );
  }
  return <div className="flex flex-col gap-3">{children}</div>;
}

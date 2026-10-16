import {
  Alert,
  api,
  Button,
  Card,
  formatMoney,
  Spinner,
  useAccount,
  useAuth,
  type CourierJob,
  type CourierOffer,
} from '@enhora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ActiveJob } from '../components/ActiveJob';
import { OfferCard } from '../components/OfferCard';
import { useLocationReporter, useWakeLock, type GpsStatus } from '../hooks';

const GPS_HINT: Record<GpsStatus, string | null> = {
  off: null,
  waiting: 'Buscando tu ubicación…',
  ok: null,
  denied: 'Activá el permiso de ubicación para recibir envíos cerca tuyo.',
  unavailable: 'No pudimos leer tu ubicación. Revisá que el GPS esté prendido.',
};

export function HomePage() {
  const account = useAccount();
  const courier = account.courier!;
  if (courier.kycStatus !== 'APPROVED') return <PendingApproval status={courier.kycStatus} />;
  return <Dashboard />;
}

function PendingApproval({ status }: { status: string }) {
  return (
    <Card>
      <h1 className="text-xl font-bold">
        {status === 'PENDING' ? 'Estamos revisando tu cuenta' : 'Tu cuenta no está habilitada'}
      </h1>
      <p className="mt-2 text-slate-700">
        {status === 'PENDING'
          ? 'Para cuidar a los comercios y a sus clientes verificamos la identidad de cada cadete. Te avisamos apenas esté lista.'
          : 'Escribinos para revisar tu situación.'}
      </p>
    </Card>
  );
}

function Dashboard() {
  const { reload } = useAuth();
  const courier = useAccount().courier!;
  const queryClient = useQueryClient();
  const online = courier.online;

  const gps = useLocationReporter(online);
  useWakeLock(online);

  const jobs = useQuery({
    queryKey: ['courier-jobs'],
    queryFn: ({ signal }) => api<CourierJob[]>('/courier/jobs', { signal }),
    refetchInterval: 10_000,
  });

  // Offers are polled every 3 s while online, until real-time push lands.
  const offer = useQuery({
    queryKey: ['courier-offer'],
    queryFn: ({ signal }) => api<CourierOffer | null>('/courier/offer', { signal }),
    enabled: online,
    refetchInterval: online ? 3_000 : false,
  });
  const currentOffer = online ? (offer.data ?? null) : null;

  // Buzz once per new offer so it is noticed with the phone in a pocket.
  const lastOfferId = useRef<string | null>(null);
  useEffect(() => {
    if (currentOffer && currentOffer.id !== lastOfferId.current) navigator.vibrate?.([250, 120, 250]);
    lastOfferId.current = currentOffer?.id ?? null;
  }, [currentOffer]);

  const availability = useMutation({
    mutationFn: (next: boolean) => api('/courier/availability', { method: 'PUT', body: { online: next } }),
    onSuccess: () => reload(),
  });
  const accept = useMutation({
    mutationFn: (id: string) => api<CourierJob>(`/courier/offers/${id}/accept`, { method: 'POST' }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['courier-offer'] });
      void queryClient.invalidateQueries({ queryKey: ['courier-jobs'] });
    },
  });
  const reject = useMutation({
    mutationFn: (id: string) => api(`/courier/offers/${id}/reject`, { method: 'POST' }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['courier-offer'] }),
  });

  const activeJobs = jobs.data ?? [];

  return (
    <>
      {currentOffer && (
        <OfferCard
          key={currentOffer.id}
          offer={currentOffer}
          accepting={accept.isPending}
          rejecting={reject.isPending}
          onAccept={() => accept.mutate(currentOffer.id)}
          onReject={() => reject.mutate(currentOffer.id)}
        />
      )}
      {accept.isError && <Alert tone="warning">{accept.error.message}</Alert>}

      {activeJobs.map((job) => (
        <ActiveJob key={job.id} job={job} onChanged={() => void reload()} />
      ))}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Hola, {courier.fullName.split(' ')[0]}</p>
            <p className="flex items-center gap-2 text-lg font-bold">
              <span
                className={`size-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`}
                aria-hidden="true"
              />
              {online ? 'Conectado' : 'Desconectado'}
            </p>
          </div>
          <Button
            variant={online ? 'secondary' : 'primary'}
            loading={availability.isPending}
            onClick={() => availability.mutate(!online)}
            className="min-h-12 px-5"
          >
            {online ? 'Desconectarme' : 'Conectarme'}
          </Button>
        </div>
        {availability.isError && (
          <div className="mt-3">
            <Alert tone="danger">{availability.error.message}</Alert>
          </div>
        )}
        {GPS_HINT[gps] && (
          <div className="mt-3">
            <Alert tone={gps === 'waiting' ? 'info' : 'warning'}>{GPS_HINT[gps]}</Alert>
          </div>
        )}
        {online && !currentOffer && activeJobs.length === 0 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-600">
            <Spinner className="size-4 text-brand-700" /> Esperando envíos cerca tuyo. Dejá la app abierta.
          </p>
        )}
      </Card>

      <Card>
        <p className="text-sm text-slate-500">Efectivo en mano</p>
        <p className="text-2xl font-bold">{formatMoney(courier.cashInHandCents)}</p>
        <p className="mt-1 text-xs text-slate-500">Lo cobrado a clientes. Rendíselo al comercio al terminar.</p>
      </Card>
    </>
  );
}

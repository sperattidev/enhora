import type { CourierJob, CourierOffer } from '@enhora/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveJob } from './ActiveJob';
import { OfferCard } from './OfferCard';

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const offer: CourierOffer = {
  id: 'o1',
  expiresAt: new Date(Date.now() + 25_000).toISOString(),
  jobId: 'j1',
  earningsCents: 350_000,
  merchantName: 'La Esquina',
  stops: [
    { kind: 'PICKUP', address: 'Belgrano 1200', location: { lat: 0, lng: 0 }, cashToCollectCents: null },
    { kind: 'DROPOFF', address: 'San Martín 850', location: { lat: 0, lng: 0 }, cashToCollectCents: 1_850_000 },
  ],
};

describe('OfferCard', () => {
  it('shows earnings, time left, route and cash to collect', () => {
    wrap(<OfferCard offer={offer} accepting={false} rejecting={false} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText(/3\.500/)).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('San Martín 850')).toBeInTheDocument();
    expect(screen.getByText(/Cobrás .*18\.500/)).toBeInTheDocument();
  });

  it('accepts with one tap', async () => {
    const onAccept = vi.fn();
    wrap(<OfferCard offer={offer} accepting={false} rejecting={false} onAccept={onAccept} onReject={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('cannot accept an expired offer', () => {
    const expired = { ...offer, expiresAt: new Date(Date.now() - 1_000).toISOString() };
    wrap(<OfferCard offer={expired} accepting={false} rejecting={false} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeDisabled();
  });
});

const job: CourierJob = {
  id: 'j1',
  status: 'IN_PROGRESS',
  earningsCents: 350_000,
  notes: null,
  assignedAt: null,
  merchantName: 'La Esquina',
  merchantPhone: '+5493465111111',
  stops: [
    {
      position: 0,
      kind: 'PICKUP',
      status: 'DONE',
      address: 'Belgrano 1200',
      location: { lat: 0, lng: 0 },
      contactName: null,
      contactPhone: null,
      instructions: null,
      cashToCollectCents: null,
      maxSpendCents: null,
    },
    {
      position: 1,
      kind: 'DROPOFF',
      status: 'ARRIVED',
      address: 'San Martín 850',
      location: { lat: -33.45, lng: -61.48 },
      contactName: 'Laura',
      contactPhone: '+5493465123456',
      instructions: 'Portero eléctrico',
      cashToCollectCents: 1_850_000,
      maxSpendCents: null,
    },
  ],
};

describe('ActiveJob', () => {
  it('works on the current stop and shows what to collect', () => {
    wrap(<ActiveJob job={job} onChanged={() => {}} />);
    expect(screen.getByText('San Martín 850')).toBeInTheDocument();
    expect(screen.getByText(/Cobrar .*18\.500 en efectivo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute(
      'href',
      expect.stringContaining('destination=-33.45,-61.48'),
    );
    // Already picked up: the job can no longer be handed back.
    expect(screen.queryByRole('button', { name: 'No puedo hacer este envío' })).not.toBeInTheDocument();
  });

  it('closes a delivery only with the 4-digit code', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ...job, status: 'COMPLETED' }), { status: 200 }));
    wrap(<ActiveJob job={job} onChanged={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: 'Entregué' }));
    const input = screen.getByLabelText('Código de entrega');
    const confirm = screen.getByRole('button', { name: 'Confirmar entrega' });
    await userEvent.type(input, '04a2');
    expect(confirm).toBeDisabled();
    await userEvent.type(input, '0');
    await userEvent.click(confirm);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/courier/jobs/j1/stops/1/advance');
    expect(JSON.parse(String(init?.body))).toEqual({ to: 'DONE', deliveryCode: '0420' });
  });

  it('reports a failed stop with a reason', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(job), { status: 200 }));
    wrap(<ActiveJob job={job} onChanged={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'No se pudo' }));
    await userEvent.selectOptions(screen.getByLabelText('¿Qué pasó?'), 'WRONG_ADDRESS');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      to: 'FAILED',
      failureReason: 'WRONG_ADDRESS',
    });
  });
});

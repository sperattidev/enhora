import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { JobStop, TrackingView } from '@enhora/ui';
import { deliveryMessage } from './JobDetail';
import { TrackingPage } from './Tracking';

function renderTracking(response: Response) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  const router = createMemoryRouter([{ path: '/seguimiento/:token', element: <TrackingPage /> }], {
    initialEntries: ['/seguimiento/abc'],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const view: TrackingView = {
  status: 'IN_PROGRESS',
  merchantName: 'La Esquina',
  courierName: 'Juan',
  scheduledFor: null,
  createdAt: '2026-10-15T20:00:00Z',
  finishedAt: null,
  stops: [
    { kind: 'PICKUP', status: 'DONE' },
    { kind: 'DROPOFF', status: 'EN_ROUTE' },
  ],
};

describe('TrackingPage', () => {
  it('shows status, merchant and courier first name', async () => {
    renderTracking(new Response(JSON.stringify(view), { status: 200 }));
    expect(await screen.findByRole('heading', { name: 'Tu pedido va en camino' })).toBeInTheDocument();
    expect(screen.getByText('La Esquina')).toBeInTheDocument();
    expect(screen.getByText('Juan')).toBeInTheDocument();
    expect(screen.getByText(/código de entrega/)).toBeInTheDocument();
    expect(screen.getByText('Tu pedido va en camino', { selector: 'span' }).closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('calls the public endpoint without credentials headers', async () => {
    renderTracking(new Response(JSON.stringify(view), { status: 200 }));
    await screen.findByRole('heading', { name: 'Tu pedido va en camino' });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/t/abc');
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('explains an unknown or expired link', async () => {
    renderTracking(new Response(JSON.stringify({ message: 'Seguimiento inexistente o vencido' }), { status: 404 }));
    expect(await screen.findByRole('heading', { name: 'No encontramos este seguimiento' })).toBeInTheDocument();
  });
});

describe('deliveryMessage', () => {
  const stop = { deliveryCode: '0420', cashToCollectCents: 125_000 } as JobStop;

  it('includes the tracking link, the code and the amount to pay', () => {
    const text = deliveryMessage('La Esquina', 'tok', stop);
    expect(text).toContain('La Esquina');
    expect(text).toContain('/seguimiento/tok');
    expect(text).toContain('0420');
    expect(text.replace(/\s/g, ' ')).toContain('$ 1.250');
  });
});

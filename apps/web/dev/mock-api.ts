import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * In-memory stand-in for the API, for design reviews and demos without a database:
 * `pnpm --filter @enhora/web dev:mock`. Any email and password log in as an active merchant.
 * It is never part of a production build.
 */
export function mockApi(): Plugin {
  const FIRMAT = { lat: -33.4594, lng: -61.4832 };
  const merchant = {
    id: 'm1',
    displayName: 'Rotisería La Esquina',
    status: 'ACTIVE',
    address: 'Belgrano 1200',
    location: FIRMAT,
  };
  const now = Date.now();
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();
  let seq = 3;

  type Stop = Record<string, unknown> & { kind: string; status: string };
  type Job = Record<string, unknown> & { id: string; status: string; trackingToken: string; stops: Stop[] };

  const stop = (
    position: number,
    kind: string,
    status: string,
    address: string,
    extra: Record<string, unknown> = {},
  ): Stop => ({
    id: `s${Math.random()}`,
    position,
    kind,
    status,
    address,
    location: FIRMAT,
    contactName: null,
    contactPhone: null,
    instructions: null,
    cashToCollectCents: null,
    maxSpendCents: null,
    deliveryCode: kind === 'DROPOFF' ? String(1000 + Math.floor(Math.random() * 9000)) : null,
    failureReason: null,
    finishedAt: null,
    ...extra,
  });

  const quote = (stops: { kind: string }[]) => {
    const extraStops = Math.max(0, stops.length - 2) * 150_000;
    const errands = stops.filter((s) => s.kind === 'ERRAND' || s.kind === 'PURCHASE').length * 200_000;
    const total = 300_000 + extraStops + errands;
    return { base: 300_000, extraStops, errands, surcharge: 0, rounding: 0, total };
  };

  const jobs: Job[] = [
    {
      id: 'j1',
      status: 'IN_PROGRESS',
      priceCents: 300_000,
      quote: quote([{ kind: 'PICKUP' }, { kind: 'DROPOFF' }]),
      scheduledFor: null,
      notes: null,
      trackingToken: 'demo-en-camino-aaaaaaaaaaaaaaaaaa'.slice(0, 32),
      courierName: 'Juan Pérez',
      cancelReason: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: iso(-25),
      stops: [
        stop(0, 'PICKUP', 'DONE', 'Belgrano 1200'),
        stop(1, 'DROPOFF', 'EN_ROUTE', 'San Martín 850', {
          contactName: 'Laura',
          contactPhone: '+5493465123456',
          cashToCollectCents: 1_850_000,
        }),
      ],
      events: [
        {
          actor: 'MERCHANT',
          fromStatus: null,
          toStatus: 'SEARCHING',
          stopPosition: null,
          metadata: null,
          createdAt: iso(-25),
        },
        {
          actor: 'SYSTEM',
          fromStatus: 'SEARCHING',
          toStatus: 'ASSIGNED',
          stopPosition: null,
          metadata: null,
          createdAt: iso(-23),
        },
        {
          actor: 'COURIER',
          fromStatus: 'ARRIVED',
          toStatus: 'DONE',
          stopPosition: 0,
          metadata: null,
          createdAt: iso(-12),
        },
        {
          actor: 'COURIER',
          fromStatus: 'ASSIGNED',
          toStatus: 'IN_PROGRESS',
          stopPosition: null,
          metadata: null,
          createdAt: iso(-12),
        },
      ],
    },
    {
      id: 'j2',
      status: 'SEARCHING',
      priceCents: 450_000,
      quote: quote([{ kind: 'PICKUP' }, { kind: 'DROPOFF' }, { kind: 'DROPOFF' }]),
      scheduledFor: null,
      notes: null,
      trackingToken: 'demo-buscando-bbbbbbbbbbbbbbbbbbbb'.slice(0, 32),
      courierName: null,
      cancelReason: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: iso(-2),
      stops: [
        stop(0, 'PICKUP', 'PENDING', 'Belgrano 1200'),
        stop(1, 'DROPOFF', 'PENDING', 'Rivadavia 1450'),
        stop(2, 'DROPOFF', 'PENDING', 'Bv. Solís 300'),
      ],
      events: [
        {
          actor: 'MERCHANT',
          fromStatus: null,
          toStatus: 'SEARCHING',
          stopPosition: null,
          metadata: null,
          createdAt: iso(-2),
        },
      ],
    },
    {
      id: 'j3',
      status: 'COMPLETED',
      priceCents: 300_000,
      quote: quote([{ kind: 'PICKUP' }, { kind: 'DROPOFF' }]),
      scheduledFor: null,
      notes: null,
      trackingToken: 'demo-entregado-ccccccccccccccccccc'.slice(0, 32),
      courierName: 'Ana Gómez',
      cancelReason: null,
      completedAt: iso(-60),
      cancelledAt: null,
      createdAt: iso(-90),
      stops: [stop(0, 'PICKUP', 'DONE', 'Belgrano 1200'), stop(1, 'DROPOFF', 'DONE', 'Mitre 640')],
      events: [
        {
          actor: 'MERCHANT',
          fromStatus: null,
          toStatus: 'SEARCHING',
          stopPosition: null,
          metadata: null,
          createdAt: iso(-90),
        },
      ],
    },
  ];

  const summary = (j: Job) => ({
    id: j.id,
    status: j.status,
    priceCents: j.priceCents,
    scheduledFor: j.scheduledFor,
    createdAt: j.createdAt,
    trackingToken: j.trackingToken,
    stopCount: j.stops.length,
    destination: j.stops.at(-1)?.address ?? null,
    stops: j.stops.map((s) => ({ kind: s.kind, status: s.status })),
  });

  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }

  function send(res: ServerResponse, status: number, data?: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  }

  const loggedIn = (req: IncomingMessage) => /enhora_rt=mock/.test(req.headers.cookie ?? '');
  const authed = (req: IncomingMessage) => req.headers.authorization === 'Bearer mock-token';

  return {
    name: 'enhora-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname;
        const method = req.method ?? 'GET';
        await new Promise((r) => setTimeout(r, 250)); // feel a bit like a real network

        if (path === '/auth/login' && method === 'POST') {
          return send(
            res,
            200,
            { accessToken: 'mock-token', expiresIn: 900 },
            { 'Set-Cookie': 'enhora_rt=mock; Path=/auth; HttpOnly; SameSite=Strict' },
          );
        }
        if (path === '/auth/refresh' && method === 'POST') {
          return loggedIn(req)
            ? send(res, 200, { accessToken: 'mock-token' })
            : send(res, 401, { message: 'Sesión inválida o vencida' });
        }
        if (path === '/auth/logout')
          return send(res, 204, undefined, { 'Set-Cookie': 'enhora_rt=; Path=/auth; Max-Age=0' });
        if (path === '/auth/register/merchant') return send(res, 201, { userId: 'u-new' });
        if (path === '/auth/me') {
          return authed(req)
            ? send(res, 200, { id: 'u1', email: 'demo@enhora.net.ar', role: 'MERCHANT', merchant, courier: null })
            : send(res, 401, {});
        }

        const tracking = path.match(/^\/t\/([\w-]+)$/);
        if (tracking) {
          const job = jobs.find((j) => j.trackingToken === tracking[1]);
          if (!job) return send(res, 404, { message: 'Seguimiento inexistente o vencido' });
          return send(res, 200, {
            status: job.status,
            merchantName: merchant.displayName,
            courierName: (job.courierName as string | null)?.split(' ')[0] ?? null,
            scheduledFor: job.scheduledFor,
            createdAt: job.createdAt,
            finishedAt: job.completedAt ?? job.cancelledAt,
            stops: job.stops.map((s) => ({ kind: s.kind, status: s.status })),
          });
        }

        if (!path.startsWith('/jobs')) return next();
        if (!authed(req)) return send(res, 401, { message: 'Necesitás iniciar sesión' });

        if (path === '/jobs' && method === 'GET') return send(res, 200, { items: jobs.map(summary), nextBefore: null });
        if (path === '/jobs/quote') {
          const input = await body(req);
          return send(res, 200, quote(input.stops as { kind: string }[]));
        }
        if (path === '/jobs' && method === 'POST') {
          const input = (await body(req)) as {
            stops: Record<string, unknown>[];
            scheduledFor?: string;
            notes?: string;
          };
          const id = `j${++seq}`;
          const job: Job = {
            id,
            status: input.scheduledFor ? 'SCHEDULED' : 'SEARCHING',
            priceCents: quote(input.stops as { kind: string }[]).total,
            quote: quote(input.stops as { kind: string }[]),
            scheduledFor: input.scheduledFor ?? null,
            notes: input.notes ?? null,
            trackingToken: `demo-${id}-${'x'.repeat(32)}`.slice(0, 32),
            courierName: null,
            cancelReason: null,
            completedAt: null,
            cancelledAt: null,
            createdAt: new Date().toISOString(),
            stops: input.stops.map((s, i) =>
              stop(i, s.kind as string, 'PENDING', s.address as string, {
                contactName: s.contactName ?? null,
                contactPhone: s.contactPhone ?? null,
                cashToCollectCents: s.cashToCollect ?? null,
                maxSpendCents: s.maxSpend ?? null,
              }),
            ),
            events: [
              {
                actor: 'MERCHANT',
                fromStatus: null,
                toStatus: input.scheduledFor ? 'SCHEDULED' : 'SEARCHING',
                stopPosition: null,
                metadata: null,
                createdAt: new Date().toISOString(),
              },
            ],
          };
          jobs.unshift(job);
          return send(res, 201, job);
        }
        const match = path.match(/^\/jobs\/(\w+)(?:\/(cancel|relaunch))?$/);
        const job = match && jobs.find((j) => j.id === match[1]);
        if (!job) return send(res, 404, { message: 'Envío inexistente' });
        if (match[2] === 'cancel') {
          const { reason } = await body(req);
          Object.assign(job, { status: 'CANCELLED', cancelReason: reason, cancelledAt: new Date().toISOString() });
        }
        if (match[2] === 'relaunch') job.status = 'SEARCHING';
        return send(res, 200, job);
      });
    },
  };
}

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

  // ---- Admin panel (log in with an email that contains "admin") ----
  const square = (lng: number, lat: number, half: number) => ({
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [lng - half, lat - half],
          [lng + half, lat - half],
          [lng + half, lat + half],
          [lng - half, lat + half],
          [lng - half, lat - half],
        ],
      ],
    ],
  });
  const zones = [
    { id: 'z1', name: 'Centro', feeCents: 250_000, active: true, area: square(FIRMAT.lng, FIRMAT.lat, 0.012) },
    { id: 'z2', name: 'Este', feeCents: 350_000, active: true, area: square(FIRMAT.lng + 0.03, FIRMAT.lat, 0.012) },
  ];
  let pricing = {
    extraStopFeeCents: 150_000,
    errandFeeCents: 200_000,
    surchargeBps: 0,
    roundToCents: 5_000,
    freeWaitMinutes: 5,
    waitFeePerMinuteCents: 10_000,
  };
  const pendingCouriers = [
    {
      id: 'c1',
      userId: 'u10',
      fullName: 'Martín Acosta',
      dni: '38123456',
      vehicle: 'MOTORCYCLE',
      kycStatus: 'PENDING',
      email: 'martin@example.com',
      phone: '+5493465555111',
      createdAt: iso(-300),
    },
    {
      id: 'c2',
      userId: 'u11',
      fullName: 'Sofía Ríos',
      dni: '40987654',
      vehicle: 'BICYCLE',
      kycStatus: 'PENDING',
      email: 'sofia@example.com',
      phone: '+5493465555222',
      createdAt: iso(-90),
    },
  ];
  const adminMerchants = [
    {
      id: 'm2',
      legalName: 'Farmacia Central SRL',
      displayName: 'Farmacia Central',
      cuit: '30712345671',
      phone: '+5493465444111',
      address: 'Bv. Solís 1020',
      status: 'PENDING',
      createdAt: iso(-120),
    },
    {
      id: 'm1',
      legalName: 'La Esquina SRL',
      displayName: merchant.displayName,
      cuit: '20123456786',
      phone: '+5493465111111',
      address: merchant.address,
      status: 'ACTIVE',
      createdAt: iso(-5000),
    },
  ];
  const audit: Record<string, unknown>[] = [];
  const record = (action: string, targetType: string, targetId: string, details: Record<string, unknown>) =>
    audit.unshift({
      id: audit.length + 1,
      action,
      targetType,
      targetId,
      details,
      adminEmail: 'admin@enhora.net.ar',
      createdAt: new Date().toISOString(),
    });

  async function adminRoutes(path: string, method: string, req: IncomingMessage, res: ServerResponse) {
    const count = (s: string) => jobs.filter((j) => j.status === s).length;
    if (path === '/admin/overview') {
      return send(res, 200, {
        scheduled: count('SCHEDULED'),
        searching: count('SEARCHING'),
        assigned: count('ASSIGNED'),
        inProgress: count('IN_PROGRESS'),
        expired: count('EXPIRED'),
        completedToday: count('COMPLETED'),
        cancelledToday: count('CANCELLED'),
        deliveredValueToday: jobs
          .filter((j) => j.status === 'COMPLETED')
          .reduce((s, j) => s + (j.priceCents as number), 0),
        couriersOnline: 3,
        couriersApproved: 7,
        cashInHands: 4_250_000,
        pendingCouriers: pendingCouriers.filter((c) => c.kycStatus === 'PENDING').length,
        pendingMerchants: adminMerchants.filter((m) => m.status === 'PENDING').length,
        activeMerchants: adminMerchants.filter((m) => m.status === 'ACTIVE').length,
      });
    }
    if (path === '/admin/jobs') {
      return send(
        res,
        200,
        jobs
          .filter((j) => !['COMPLETED', 'CANCELLED'].includes(j.status))
          .map((j) => ({
            ...summary(j),
            merchantName: merchant.displayName,
            courierName: j.courierName,
            searchingSince: j.status === 'SEARCHING' ? iso(-4) : null,
          })),
      );
    }
    if (path === '/admin/audit') return send(res, 200, audit);
    if (path === '/admin/couriers') {
      const status = new URL(req.url ?? '', 'http://x').searchParams.get('kycStatus') ?? 'PENDING';
      return send(
        res,
        200,
        pendingCouriers.filter((c) => c.kycStatus === status),
      );
    }
    const courierKyc = path.match(/^\/admin\/couriers\/(\w+)\/kyc$/);
    if (courierKyc) {
      const body2 = await body(req);
      const c = pendingCouriers.find((x) => x.id === courierKyc[1]);
      if (!c) return send(res, 404, { message: 'No encontrado' });
      c.kycStatus = String(body2.kycStatus);
      record('courier.kyc', 'courier', c.id, body2);
      return send(res, 204);
    }
    if (path === '/admin/merchants') {
      const status = new URL(req.url ?? '', 'http://x').searchParams.get('status') ?? 'PENDING';
      return send(
        res,
        200,
        adminMerchants.filter((m) => m.status === status),
      );
    }
    const merchantStatus = path.match(/^\/admin\/merchants\/(\w+)\/status$/);
    if (merchantStatus) {
      const body2 = await body(req);
      const m = adminMerchants.find((x) => x.id === merchantStatus[1]);
      if (!m) return send(res, 404, { message: 'No encontrado' });
      m.status = String(body2.status);
      record('merchant.status', 'merchant', m.id, body2);
      return send(res, 204);
    }
    if (path === '/admin/cities/firmat/zones') return send(res, 200, zones);
    if (path === '/admin/zones' && method === 'POST') {
      const input = await body(req);
      const area = input.area as { coordinates: number[][][] };
      const zone = {
        id: `z${zones.length + 1}`,
        name: String(input.name),
        feeCents: Number(input.feeCents),
        active: true,
        area: { type: 'MultiPolygon', coordinates: [area.coordinates] },
      };
      zones.push(zone);
      record('zone.create', 'zone', zone.id, { name: zone.name, feeCents: zone.feeCents });
      return send(res, 201, { id: zone.id });
    }
    const zonePatch = path.match(/^\/admin\/zones\/(\w+)$/);
    if (zonePatch) {
      const input = await body(req);
      const zone = zones.find((z) => z.id === zonePatch[1]);
      if (!zone) return send(res, 404, { message: 'Zona inexistente' });
      Object.assign(zone, input);
      record('zone.update', 'zone', zone.id, input);
      return send(res, 204);
    }
    if (path === '/admin/cities/firmat/pricing' && method === 'GET') return send(res, 200, pricing);
    if (path === '/admin/cities/firmat/pricing' && method === 'PUT') {
      pricing = (await body(req)) as typeof pricing;
      record('pricing.update', 'city', 'firmat', pricing);
      return send(res, 204);
    }
    return send(res, 404, { message: 'No encontrado' });
  }
  const loggedIn = (req: IncomingMessage) => /enhora_rt=mock/.test(req.headers.cookie ?? '');
  const isAdmin = (req: IncomingMessage) =>
    /enhora_rt=mock-admin/.test(req.headers.cookie ?? '') || req.headers.authorization === 'Bearer mock-admin-token';
  const authed = (req: IncomingMessage) => /^Bearer mock(-admin)?-token$/.test(req.headers.authorization ?? '');

  return {
    name: 'enhora-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname;
        const method = req.method ?? 'GET';
        await new Promise((r) => setTimeout(r, 250)); // feel a bit like a real network

        if (path === '/auth/login' && method === 'POST') {
          const { email } = await body(req);
          const admin = String(email).includes('admin');
          return send(
            res,
            200,
            { accessToken: admin ? 'mock-admin-token' : 'mock-token', expiresIn: 900 },
            { 'Set-Cookie': `enhora_rt=${admin ? 'mock-admin' : 'mock'}; Path=/auth; HttpOnly; SameSite=Strict` },
          );
        }
        if (path === '/auth/refresh' && method === 'POST') {
          return loggedIn(req)
            ? send(res, 200, { accessToken: isAdmin(req) ? 'mock-admin-token' : 'mock-token' })
            : send(res, 401, { message: 'Sesión inválida o vencida' });
        }
        if (path === '/auth/logout')
          return send(res, 204, undefined, { 'Set-Cookie': 'enhora_rt=; Path=/auth; Max-Age=0' });
        if (path === '/auth/register/merchant') return send(res, 201, { userId: 'u-new' });
        if (path === '/auth/me') {
          if (authed(req) && isAdmin(req)) {
            return send(res, 200, {
              id: 'u0',
              email: 'admin@enhora.net.ar',
              role: 'ADMIN',
              merchant: null,
              courier: null,
            });
          }
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

        if (path.startsWith('/admin')) {
          if (!authed(req) || !isAdmin(req)) return send(res, 403, { message: 'No tenés permiso para esto' });
          return adminRoutes(path, method, req, res);
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

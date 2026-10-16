import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * In-memory stand-in for the courier API, for design reviews without a database:
 * `pnpm --filter @enhora/rider dev:mock`. Any email and password log in as an approved courier.
 * Going online produces an offer a few seconds later; delivery code is always 1234.
 * It is never part of a production build.
 */
export function mockApi(): Plugin {
  const FIRMAT = { lat: -33.4594, lng: -61.4832 };
  const courier = {
    id: 'c1',
    fullName: 'Juan Pérez',
    kycStatus: 'APPROVED',
    vehicle: 'MOTORCYCLE',
    online: false,
    cashInHandCents: 0,
  };
  let onlineSince = 0;
  let offer: Record<string, unknown> | null = null;
  let offerTaken = false;
  let job: { id: string; status: string; stops: Record<string, unknown>[] } & Record<string, unknown> = newJob();

  function newJob() {
    return {
      id: 'j1',
      status: 'SEARCHING',
      earningsCents: 350_000,
      notes: 'Tocar timbre del local',
      assignedAt: null as string | null,
      merchantName: 'Rotisería La Esquina',
      merchantPhone: '+5493465111111',
      stops: [
        {
          position: 0,
          kind: 'PICKUP',
          status: 'PENDING',
          address: 'Belgrano 1200',
          location: FIRMAT,
          contactName: null,
          contactPhone: null,
          instructions: 'Pedir el pedido #482 en mostrador',
          cashToCollectCents: null,
          maxSpendCents: null,
        },
        {
          position: 1,
          kind: 'DROPOFF',
          status: 'PENDING',
          address: 'San Martín 850, 2° B',
          location: { lat: -33.4561, lng: -61.4789 },
          contactName: 'Laura',
          contactPhone: '+5493465123456',
          instructions: 'Portero eléctrico',
          cashToCollectCents: 1_850_000,
          maxSpendCents: null,
        },
      ],
    };
  }

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
    name: 'enhora-rider-mock-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        const method = req.method ?? 'GET';
        if (!path.startsWith('/auth') && !path.startsWith('/courier')) return next();
        await new Promise((r) => setTimeout(r, 200));

        if (path === '/auth/login') {
          return send(
            res,
            200,
            { accessToken: 'mock-token', expiresIn: 900 },
            {
              'Set-Cookie': 'enhora_rt=mock; Path=/auth; HttpOnly; SameSite=Strict',
            },
          );
        }
        if (path === '/auth/refresh') {
          return loggedIn(req) ? send(res, 200, { accessToken: 'mock-token' }) : send(res, 401, {});
        }
        if (path === '/auth/logout')
          return send(res, 204, undefined, { 'Set-Cookie': 'enhora_rt=; Path=/auth; Max-Age=0' });
        if (path === '/auth/register/courier') return send(res, 201, { userId: 'u-new' });
        if (!authed(req)) return send(res, 401, { message: 'Necesitás iniciar sesión' });
        if (path === '/auth/me') {
          return send(res, 200, { id: 'u1', email: 'cadete@enhora.test', role: 'COURIER', merchant: null, courier });
        }

        if (path === '/courier/availability') {
          const { online } = (await body(req)) as { online: boolean };
          courier.online = online;
          onlineSince = Date.now();
          if (!online) offer = null;
          return send(res, 200, { online });
        }
        if (path === '/courier/location') return send(res, 204);
        if (path === '/courier/offer') {
          // A fresh offer shows up 4 s after connecting, until one is accepted.
          if (courier.online && !offer && !offerTaken && Date.now() - onlineSince > 4_000) {
            offer = {
              id: 'o1',
              expiresAt: new Date(Date.now() + 30_000).toISOString(),
              jobId: job.id,
              earningsCents: job.earningsCents,
              merchantName: job.merchantName,
              stops: job.stops.map((s) => ({
                kind: s.kind,
                address: s.address,
                location: s.location,
                cashToCollectCents: s.cashToCollectCents,
              })),
            };
          }
          if (offer && Date.parse(offer.expiresAt as string) < Date.now()) offer = null;
          return send(res, 200, offer);
        }
        if (path === '/courier/offers/o1/accept' && offer) {
          offer = null;
          offerTaken = true;
          Object.assign(job, { status: 'ASSIGNED', assignedAt: new Date().toISOString() });
          return send(res, 200, job);
        }
        if (path === '/courier/offers/o1/reject') {
          offer = null;
          onlineSince = Date.now();
          return send(res, 204);
        }
        if (path === '/courier/jobs') return send(res, 200, offerTaken && job.status !== 'COMPLETED' ? [job] : []);
        if (path === '/courier/jobs/j1/release') {
          offerTaken = false;
          job = newJob();
          return send(res, 204);
        }
        const advance = path.match(/^\/courier\/jobs\/j1\/stops\/(\d+)\/advance$/);
        if (advance && method === 'POST') {
          const input = (await body(req)) as { to: string; deliveryCode?: string };
          const stop = job.stops[Number(advance[1])]!;
          if (input.to === 'DONE' && stop.kind === 'DROPOFF' && input.deliveryCode !== '1234') {
            return send(res, 409, { message: 'El código de entrega no coincide' });
          }
          stop.status = input.to;
          if (input.to === 'DONE' && stop.cashToCollectCents)
            courier.cashInHandCents += stop.cashToCollectCents as number;
          if (Number(advance[1]) === 0 && (input.to === 'DONE' || input.to === 'FAILED')) job.status = 'IN_PROGRESS';
          if (job.stops.every((s) => s.status === 'DONE' || s.status === 'FAILED')) {
            job.status = 'COMPLETED';
            offerTaken = false;
            job = { ...newJob(), id: 'j1' };
            return send(res, 200, { ...job, status: 'COMPLETED' });
          }
          return send(res, 200, job);
        }
        return send(res, 404, { message: 'No encontrado' });
      });
    },
  };
}

# EnHora

**Cadetes cuando los necesitás.** Plataforma B2B de cadetería para comercios y profesionales, nacida en Firmat, Santa Fe.

- Los comercios piden un cadete en 30 segundos: envíos, cobros, multi-entrega, trámites y compras por encargo.
- Cadetes verificados reciben ofertas automáticas, cobran el 100 % de la tarifa y liquidan cada semana.
- El cliente final sigue su envío con un link por WhatsApp, sin instalar nada.

## Estructura

| Carpeta                              | Contenido                                                         |
| ------------------------------------ | ----------------------------------------------------------------- |
| [`apps/api`](apps/api)               | API REST + WebSocket (NestJS, Fastify, Drizzle, PostGIS)          |
| [`packages/shared`](packages/shared) | Dominio: esquemas, estados, precios y asignación                  |
| [`infra`](infra)                     | Docker Compose y despliegue                                       |
| [`docs`](docs)                       | [Arquitectura](docs/ARQUITECTURA.md) y [dominio](docs/DOMINIO.md) |

## Empezar

```bash
pnpm install
docker compose -f infra/docker/compose.dev.yml up -d
cp apps/api/.env.example apps/api/.env
pnpm --filter @enhora/api db:migrate
pnpm dev
```

La API queda en `http://localhost:3000` (`GET /health`).

Para crear el primer administrador (las credenciales van por variables de entorno, nunca como argumentos):

```bash
pnpm --filter @enhora/api build
ADMIN_EMAIL=vos@enhora.net.ar ADMIN_PASSWORD='una-clave-larga' pnpm --filter @enhora/api admin:create
```

## API de identidad

| Método    | Ruta                                                               | Acceso  | Qué hace                                                          |
| --------- | ------------------------------------------------------------------ | ------- | ----------------------------------------------------------------- |
| POST      | `/auth/register/merchant`                                          | público | Alta de comercio (queda `PENDING` hasta aprobación)               |
| POST      | `/auth/register/courier`                                           | público | Alta de cadete (KYC `PENDING` hasta aprobación)                   |
| POST      | `/auth/login`                                                      | público | Devuelve access token; el refresh va en cookie `HttpOnly`         |
| POST      | `/auth/refresh`                                                    | cookie  | Rota el refresh token; reusar uno viejo cierra todas las sesiones |
| POST      | `/auth/logout`                                                     | cookie  | Cierra la sesión del dispositivo                                  |
| GET       | `/auth/me`                                                         | token   | Cuenta, comercio o cadete asociado y su estado                    |
| GET/PATCH | `/admin/couriers…`, `/admin/merchants…`, `/admin/users/:id/status` | admin   | Aprobar, rechazar o suspender                                     |

## API de envíos

| Método         | Ruta                                        | Acceso          | Qué hace                                                                                                 |
| -------------- | ------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| POST           | `/jobs/quote`                               | comercio        | Cotiza sin guardar; `422` con `stopIndexes` si alguna dirección está fuera de cobertura                  |
| POST           | `/jobs`                                     | comercio activo | Crea el envío. Header opcional `Idempotency-Key`: repetir la misma clave devuelve el mismo envío (`200`) |
| GET            | `/jobs?status=&before=&limit=`              | comercio        | Lista paginada, más nuevos primero                                                                       |
| GET            | `/jobs/:id`                                 | comercio        | Detalle con paradas, códigos de entrega y auditoría                                                      |
| POST           | `/jobs/:id/cancel`                          | comercio        | Cancela con motivo, solo antes del retiro                                                                |
| POST           | `/jobs/:id/relaunch`                        | comercio activo | Vuelve a buscar cadete si nadie aceptó                                                                   |
| GET            | `/t/:token`                                 | público         | Seguimiento para el cliente: estado, comercio y nombre del cadete; vence 24 h después del cierre         |
| POST/PATCH/GET | `/admin/zones`, `/admin/cities/:slug/zones` | admin           | Zonas como polígonos GeoJSON; no se permiten superposiciones                                             |
| GET/PUT        | `/admin/cities/:slug/pricing`               | admin           | Paradas extra, trámites, recargo, redondeo y espera                                                      |

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md): ramas, commits y pull requests.

## Licencia

Software propietario. Todos los derechos reservados. Ver [LICENSE](LICENSE).

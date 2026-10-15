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

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md): ramas, commits y pull requests.

## Licencia

Software propietario. Todos los derechos reservados. Ver [LICENSE](LICENSE).

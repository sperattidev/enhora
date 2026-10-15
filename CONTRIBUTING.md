# Cómo trabajamos

## Ramas

| Rama                          | Uso                                                                                   | Protección                                   |
| ----------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `main`                        | Lo que está en producción. Solo recibe merges desde `develop` (release) o `hotfix/*`. | PR obligatorio + CI verde. Sin push directo. |
| `develop`                     | Integración. Lo que va a salir en la próxima versión.                                 | PR obligatorio + CI verde.                   |
| `feat/<tema>`                 | Funcionalidad nueva. Sale de `develop`, vuelve a `develop`.                           | —                                            |
| `fix/<tema>`                  | Corrección no urgente. Sale de `develop`.                                             | —                                            |
| `hotfix/<tema>`               | Corrección urgente en producción. Sale de `main`, vuelve a `main` y `develop`.        | —                                            |
| `chore/<tema>`, `docs/<tema>` | Mantenimiento y documentación.                                                        | —                                            |

## Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/es/):

```
feat(api): cotizar envíos por zona
fix(shared): impedir pasar de ENTREGADO a CANCELADO
docs: explicar la rendición de efectivo
chore(deps): actualizar drizzle-orm
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`.
Ámbitos: `api`, `web`, `rider`, `shared`, `infra`, `deps`.

## Pull requests

1. Una PR = un cambio coherente. Chica es mejor.
2. El CI (lint, tipos, tests, build) tiene que pasar.
3. Completar la plantilla: qué cambia, por qué, cómo se probó.
4. Merge con **squash** a `develop`; el título de la PR es el mensaje final (formato Conventional Commits).
5. Releases: PR de `develop` a `main` con **merge commit** y tag `vX.Y.Z`.

## Desarrollo local

Requisitos: Node 24 (ver `.nvmrc`), pnpm 10, Docker.

```bash
pnpm install
docker compose -f infra/docker/compose.dev.yml up -d
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Antes de abrir una PR:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Reglas de código

- Código, nombres y comentarios técnicos en **inglés**; textos de interfaz y documentación de producto en **español**.
- Dinero siempre en **centavos enteros** (`number` entero), nunca decimales.
- La lógica de negocio va en `packages/shared` como funciones puras con tests.
- Nada de secretos en el repo. Variables nuevas: agregarlas a `.env.example` y al esquema de configuración.

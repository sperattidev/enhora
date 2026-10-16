# Arquitectura de EnHora

> Plataforma B2B de cadetería abierta. Los comercios piden cadetes; cadetes verificados toman los trabajos.
> Firmat (Santa Fe) es la ciudad base; el sistema es multi-ciudad desde el primer día.

## 1. Principios

1. **Simple para el comercio.** Pedir un cadete en menos de 30 segundos.
2. **Justo para el cadete.** Asignación transparente, tarifa clara, liquidación semanal.
3. **La plataforma no toca el dinero de terceros.** El efectivo cobrado al cliente se rinde al comercio; la plataforma solo registra y concilia.
4. **Seguro por defecto.** Verificación de identidad, mínimo privilegio, auditoría de todo cambio de estado.
5. **Barato de operar.** Un solo VPS, una sola persona puede mantenerlo.

## 2. Modelo de negocio (reglas del sistema)

| Concepto                    | Regla                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Ingreso de la plataforma    | Abono mensual del comercio según plan.                                                             |
| Precio de cada envío        | Tarifa por zona de destino (+ adicionales por parada extra, espera, trámite). Lo paga el comercio. |
| Cadete                      | Recibe el 100 % de la tarifa del envío. Liquidación semanal.                                       |
| Efectivo cobrado al cliente | El cadete lo rinde al comercio. Ambos confirman en la app (conciliación de doble firma).           |
| Asignación                  | Automática: oferta secuencial al mejor cadete disponible, 30 s para aceptar, luego el siguiente.   |

## 3. Servicios que cubre ("todo lo que necesita de un cadete")

Un **Envío** (`Job`) es una secuencia ordenada de **Paradas** (`Stop`). Con eso se modelan todos los casos:

| Servicio            | Paradas                                                           |
| ------------------- | ----------------------------------------------------------------- |
| Envío simple        | RETIRO (comercio) → ENTREGA (cliente)                             |
| Envío con cobro     | RETIRO → ENTREGA con `cashToCollect`                              |
| Multi-entrega       | RETIRO → ENTREGA → ENTREGA → …                                    |
| Retiro en proveedor | RETIRO (proveedor) → ENTREGA (comercio)                           |
| Trámite             | TRAMITE (banco, oficina) con instrucciones y comprobante foto     |
| Compra por encargo  | COMPRA (con monto máximo) → ENTREGA                               |
| Ida y vuelta        | RETIRO → ENTREGA → RETIRO (devolución/firma) → ENTREGA (comercio) |
| Programado          | Cualquiera de los anteriores con `scheduledFor`                   |

## 4. Componentes

```
                    Cloudflare (DNS, WAF, TLS, Tunnel)
                                 │
                       ┌─────────┴─────────┐
                       │  Caddy (VPS)      │
                       └──┬──────┬──────┬──┘
           app.enhora.net.ar  cadete.…  api.enhora.net.ar
                 │              │              │
          apps/web (PWA)   apps/rider (PWA)    apps/api (NestJS + Fastify)
          comercio, admin   cadete               │  REST + WebSocket
          seguimiento /t/:code                   │
                                    ┌────────────┼─────────────┐
                               PostgreSQL     Redis          Cloudflare R2
                               + PostGIS   (avisos en vivo,  (documentos KYC,
                                           posiciones,       fotos de entrega,
                                           rate limit)       backups)
```

| Pieza                    | Tecnología                                                                                                  | Por qué                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Lenguaje                 | TypeScript en todo                                                                                          | Un solo lenguaje, tipos compartidos entre API y apps.                                         |
| Monorepo                 | pnpm workspaces + Turborepo                                                                                 | Builds incrementales, un solo CI.                                                             |
| API                      | NestJS 12 sobre Fastify                                                                                     | Módulos claros, inyección de dependencias, rendimiento.                                       |
| Base de datos            | PostgreSQL 17 + PostGIS                                                                                     | Zonas como polígonos, cadetes cercanos con índices espaciales.                                |
| ORM                      | Drizzle                                                                                                     | SQL explícito, soporte real de tipos PostGIS, migraciones versionadas.                        |
| Asignación y tiempo real | Despachador sobre PostgreSQL (`SKIP LOCKED`); Redis + WebSockets para avisos y posiciones en vivo (próximo) | Sin infraestructura extra mientras haya una sola API; escala a varias instancias sin cambios. |
| Validación               | Zod (en `packages/shared`)                                                                                  | El mismo esquema valida en el navegador y en la API.                                          |
| Frontends                | React + Vite, PWA                                                                                           | Instalables sin tiendas; el cadete puede pasar a Capacitor para GPS en segundo plano.         |
| Mapas                    | MapLibre + OpenStreetMap; Google Places para autocompletar direcciones                                      | Costo bajo, buena calidad de direcciones.                                                     |
| Pagos                    | Mercado Pago (suscripciones)                                                                                | Lo que usa todo el mundo en Argentina.                                                        |
| Infra                    | Docker Compose, Caddy, Cloudflare Tunnel                                                                    | Sin puertos expuestos, TLS automático.                                                        |
| Observabilidad           | Logs estructurados (pino), Sentry, Uptime Kuma                                                              | Saber qué falló antes que el cliente.                                                         |

## 5. Estructura del repositorio

```
apps/
  api/        API NestJS (REST + WebSocket)
  web/        PWA de comercios, panel admin y página pública de seguimiento   (próximo)
  rider/      PWA del cadete                                                   (próximo)
packages/
  shared/     Dominio puro: esquemas Zod, máquinas de estado, precios, asignación
infra/
  docker/     Compose de desarrollo y producción
docs/         Arquitectura, dominio, decisiones (ADR)
```

La lógica de negocio crítica (estados, precios, puntaje de asignación) vive en `packages/shared` como **funciones puras con tests**. La API la orquesta; las apps la reutilizan para validar y mostrar.

## 6. Seguridad

- **Identidad de cadetes (KYC):** DNI frente/dorso, selfie, licencia, seguro, constancia de monotributo. Aprobación manual del admin. Documentos en R2 privado con URLs firmadas de corta duración.
- **Comercios:** CUIT validado, responsable identificado.
- **Autenticación:** contraseña con Argon2id; access token corto (15 min) + refresh token rotativo en cookie `HttpOnly; Secure; SameSite=Strict`; detección de reuso de refresh token; el mismo mensaje de error para email inexistente y contraseña incorrecta, con tiempo de respuesta constante. Rate limit de 5 intentos por minuto por IP en login y registro. Suspender a un usuario revoca todas sus sesiones al instante; el access token vigente expira solo en ≤ 15 min. 2FA obligatorio para administradores (pendiente).
- **Autorización:** roles (`ADMIN`, `MERCHANT_OWNER`, `MERCHANT_STAFF`, `COURIER`) + chequeo de pertenencia en cada recurso (un comercio solo ve sus envíos; un cadete solo ve lo que tiene asignado).
- **Entrada:** toda entrada validada con Zod; límites de tamaño; rate limit por IP y por usuario en Redis.
- **Prueba de entrega:** código de 4 dígitos que el cliente le dicta al cadete y/o foto.
- **Seguimiento público:** URL con token aleatorio no adivinable, expira 24 h después de la entrega; nunca expone teléfono ni datos del cadete más allá del nombre.
- **Efectivo:** límite de efectivo en mano por cadete; si lo supera, no recibe ofertas con cobro hasta rendir.
- **Auditoría:** cada transición de estado se guarda en `job_events`, y cada cambio de un administrador (aprobaciones, suspensiones, zonas, tarifas) en `admin_audit` con quién, cuándo y desde qué IP. Ninguna de las dos tablas se modifica ni se borra desde la aplicación.
- **Datos personales:** Ley 25.326 — mínimos datos necesarios, retención acotada, borrado a pedido.
- **Infra:** secretos solo por variables de entorno, nunca en el repo; base no expuesta a internet; backups cifrados diarios a R2.

## 7. Diferenciales frente a la competencia local

|                                   | DeliveryVA                           | DaleYA / PedidosYa                  | **EnHora**                                          |
| --------------------------------- | ------------------------------------ | ----------------------------------- | --------------------------------------------------- |
| Foco                              | Cadetería                            | Marketplace de comida al consumidor | Logística para **cualquier** comercio o profesional |
| Pedir cadete                      | Teléfono / WhatsApp / sistema propio | No aplica                           | 30 s desde la web, o integración por API            |
| Trámites, compras, multi-parada   | Manual                               | No                                  | Sí, modelados como paradas                          |
| Seguimiento para el cliente final | —                                    | Sí (solo dentro de su app)          | Link por WhatsApp, sin instalar nada                |
| Rendición de efectivo             | Informal                             | —                                   | Conciliación con doble confirmación                 |
| Comisión al comercio por venta    | —                                    | Sí                                  | **No**: abono fijo + tarifa por zona                |
| Multi-ciudad                      | No                                   | Sí                                  | Sí                                                  |

## 8. Hoja de ruta

1. ✅ **Fundaciones:** monorepo, CI, dominio, esqueleto de API, base de datos.
2. ✅ **Identidad:** registro, login, sesiones rotativas, roles, aprobación de comercios y cadetes. Falta: carga de documentos KYC a R2 y 2FA de admin.
3. ✅ **Envíos:** zonas y tarifas por ciudad, cotización, creación idempotente, cancelación y relanzamiento con auditoría, seguimiento público. Falta: avance de paradas por el cadete (llega con la asignación).
4. ✅ **Asignación:** despachador con ofertas secuenciales, vencimientos, programados, liberación y cierre con código. Falta: aviso en tiempo real por WebSocket (hoy la app del cadete consulta cada pocos segundos).
5. ✅ **Apps:** app web del comercio, app del cadete, seguimiento público y panel de administración (operaciones, aprobaciones, zonas dibujadas en el mapa, tarifas y auditoría). Falta: empaquetar la app del cadete con Capacitor para GPS en segundo plano.
6. **Dinero:** abonos Mercado Pago, liquidación semanal de cadetes, rendición de efectivo.
7. **Producción:** despliegue en VPS, backups, monitoreo.
8. **Piloto** con 5–10 comercios de Firmat.

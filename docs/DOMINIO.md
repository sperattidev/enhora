# Dominio

Glosario: el código usa inglés; la interfaz, español.

| Código         | Interfaz  | Descripción                                                             |
| -------------- | --------- | ----------------------------------------------------------------------- |
| `City`         | Ciudad    | Unidad operativa (Firmat, Venado Tuerto…). Todo pertenece a una ciudad. |
| `Zone`         | Zona      | Polígono de una ciudad con su tarifa.                                   |
| `Merchant`     | Comercio  | Cliente de la plataforma; paga abono mensual.                           |
| `Courier`      | Cadete    | Trabajador independiente verificado.                                    |
| `Job`          | Envío     | Trabajo pedido por un comercio.                                         |
| `Stop`         | Parada    | Paso de un envío: retiro, entrega, trámite o compra.                    |
| `Offer`        | Oferta    | Propuesta de un envío a un cadete, con vencimiento.                     |
| `CashHandover` | Rendición | Entrega de efectivo cobrado del cadete al comercio.                     |

## Estados de un envío (`JobStatus`)

```
                ┌──────────── CANCELLED ◄─────────────┐
                │                ▲                     │
 SCHEDULED ──► SEARCHING ──► ASSIGNED ──► IN_PROGRESS ──► COMPLETED
                ▲    │          │
                │    ▼          │ (el cadete libera)
                │  EXPIRED      │
                └───────────────┘
```

| Desde                                           | Hacia         | Quién           | Cuándo                                            |
| ----------------------------------------------- | ------------- | --------------- | ------------------------------------------------- |
| `SCHEDULED`                                     | `SEARCHING`   | sistema         | Llega la hora programada (menos la anticipación). |
| `SEARCHING`                                     | `ASSIGNED`    | sistema         | Un cadete acepta la oferta.                       |
| `SEARCHING`                                     | `EXPIRED`     | sistema         | Nadie aceptó en el tiempo máximo.                 |
| `EXPIRED`                                       | `SEARCHING`   | comercio, admin | Se relanza la búsqueda.                           |
| `ASSIGNED`                                      | `IN_PROGRESS` | cadete          | Completa la primera parada (retiró).              |
| `ASSIGNED`                                      | `SEARCHING`   | cadete, admin   | El cadete no puede; vuelve a buscarse.            |
| `IN_PROGRESS`                                   | `COMPLETED`   | sistema         | Todas las paradas terminaron.                     |
| `SCHEDULED`, `SEARCHING`, `ASSIGNED`, `EXPIRED` | `CANCELLED`   | comercio, admin | Antes de retirar.                                 |

Una vez retirado (`IN_PROGRESS`) el envío **no se cancela**: se completa o se registra la parada como fallida. El admin puede forzar cualquier transición válida y queda auditado.

## Estados de una parada (`StopStatus`)

`PENDING → EN_ROUTE → ARRIVED → DONE | FAILED`

- Las paradas se hacen **en orden**: solo la primera parada no terminada puede avanzar.
- `DONE` en una entrega exige el código de 4 dígitos del cliente o una foto.
- `FAILED` exige motivo (`CUSTOMER_ABSENT`, `WRONG_ADDRESS`, `REJECTED`, `OTHER`).

## Reglas de armado de un envío

- Entre 1 y 10 paradas.
- Una `DROPOFF` (entrega) necesita antes un `PICKUP` (retiro) o `PURCHASE` (compra).
- Solo las entregas pueden cobrar efectivo (`cashToCollect`).
- Una compra exige monto máximo (`maxSpend`).

## Precio

Todo en centavos.

1. **Base:** la tarifa de la zona más cara entre las paradas.
2. **Paradas extra:** desde la tercera parada, `extraStopFee` por cada una.
3. **Trámite o compra:** `errandFee` por cada parada de ese tipo.
4. **Recargo** (lluvia, nocturno): porcentaje en puntos básicos sobre el subtotal.
5. **Redondeo** hacia arriba al múltiplo configurado (por ejemplo, $50).
6. **Espera:** al cerrar, `waitFeePerMinute` por cada minuto que supere `freeWaitMinutes` en una parada.

## Asignación

1. Candidatos: cadetes aprobados, en línea, de la ciudad, sin superar envíos simultáneos.
2. Si el envío cobra efectivo, se excluye a quien superaría su límite de efectivo en mano.
3. Puntaje (0 a 1, mayor es mejor): 50 % cercanía, 25 % calificación, 15 % tasa de aceptación, 10 % carga actual.
4. Oferta al primero con 30 s para aceptar; si rechaza o vence, al siguiente. Si se acaban, `EXPIRED`.

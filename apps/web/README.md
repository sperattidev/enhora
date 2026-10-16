# @enhora/web

App web de los comercios (PWA instalable) y página pública de seguimiento.

| Ruta                     | Quién           | Qué hace                                                                    |
| ------------------------ | --------------- | --------------------------------------------------------------------------- |
| `/ingresar`, `/registro` | público         | Ingreso y alta del comercio (con su ubicación en el mapa)                   |
| `/envios`                | comercio        | Envíos en curso y anteriores, con avance de las paradas                     |
| `/envios/nuevo`          | comercio activo | Pedir cadete: paradas, mapa, cobro, programación y precio en vivo           |
| `/envios/:id`            | comercio        | Detalle, códigos de entrega, aviso por WhatsApp, cancelar o relanzar        |
| `/seguimiento/:token`    | cliente final   | Estado del envío sin datos personales; es el link que se manda por WhatsApp |

## Desarrollo

```bash
pnpm --filter @enhora/web dev        # contra la API local en :3000 (proxy, misma cookie)
pnpm --filter @enhora/web dev:mock   # sin backend: API simulada en memoria para revisar diseño
```

En `dev:mock` cualquier email y contraseña ingresan como un comercio activo con envíos de ejemplo.
Ese modo no forma parte del build de producción.

## Decisiones

- **Sesión:** el access token vive solo en memoria; la cookie `HttpOnly` de refresh lo renueva al abrir la app y ante un 401. Las renovaciones simultáneas se agrupan en una sola, porque la API rota el token y una segunda renovación en paralelo parecería un robo.
- **Validación:** los mismos esquemas Zod de `@enhora/shared` que usa la API, así los errores aparecen antes de enviar.
- **Peso:** el seguimiento y el ingreso cargan de inmediato; las pantallas del comercio y MapLibre se descargan a demanda.
- **Mapas:** MapLibre con mosaicos de OpenFreeMap, sin clave. El worker de MapLibre lo empaqueta Vite (`?worker&url`).
- **Producción:** `VITE_API_URL=https://api.enhora.net.ar`. App y API comparten el sitio `enhora.net.ar`, así que la cookie `SameSite=Strict` funciona.

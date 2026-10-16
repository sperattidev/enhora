# @enhora/rider

App del cadete (PWA instalable), pensada para usar con una mano y el celular en el soporte de la moto.

- **Conexión:** solo los cadetes aprobados se conectan. Con la app abierta envía la ubicación cada 10 s y mantiene la pantalla encendida.
- **Ofertas:** aparecen con ganancia, recorrido, efectivo a cobrar y cuenta regresiva; vibran al llegar. Aceptar es un toque.
- **Envío activo:** un solo botón grande con la próxima acción (_Voy en camino → Llegué → Retiré / Entregué_), "Cómo llegar" en Google Maps, WhatsApp al cliente, instrucciones y monto a cobrar.
- **Cierre de entrega:** con el código de 4 dígitos que dicta el cliente. "No se pudo" pide motivo.
- **Efectivo en mano:** lo cobrado y pendiente de rendir al comercio.

## Desarrollo

```bash
pnpm --filter @enhora/rider dev        # contra la API local en :3000
pnpm --filter @enhora/rider dev:mock   # sin backend: al conectarte llega una oferta; el código es 1234
```

## Limitaciones conocidas

- En una PWA, el GPS solo funciona con la app abierta. Para seguir la ubicación en segundo plano hay que empaquetarla con Capacitor (está en la hoja de ruta).
- Las ofertas se consultan cada 3 s; el aviso en tiempo real por WebSocket llega en una próxima etapa.

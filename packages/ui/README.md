# @enhora/ui

Lo que comparten las apps web de EnHora. Se consume como código fuente (sin build) desde Vite.

| Import                  | Contenido                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `@enhora/ui`            | Cliente API con renovación de sesión, `AuthProvider`, formatos (pesos, fechas, estados), teléfonos, tipos y componentes |
| `@enhora/ui/map`        | `MapPicker` (MapLibre a demanda); separado para que las pantallas sin mapa no lo carguen                                |
| `@enhora/ui/theme.css`  | Colores de marca y estilos base; importar después de `tailwindcss`                                                      |
| `@enhora/ui/test-setup` | Matchers de Testing Library y mock de MapLibre para Vitest                                                              |

Cada app agrega `@source '../../../packages/ui/src';` en su CSS para que Tailwind vea las clases de estos componentes.

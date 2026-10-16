# Despliegue en producción

```
Internet ──► Cloudflare (DNS, TLS, WAF) ══ túnel saliente ══► VPS
                                                               │ red "edge"
                                         cloudflared ──► web (Caddy :80) ──► api :3000
                                                                               │ red "db" (sin internet)
                                                                    postgres ◄─┴─ migrate, backup
```

- El VPS **no abre puertos web**: el único puerto entrante es SSH. El tráfico entra por un túnel que `cloudflared` abre hacia Cloudflare.
- `web` es Caddy: sirve `app` (comercios, panel y seguimiento) y `cadete`, y hace de proxy a la API. Reemplaza el encabezado `X-Forwarded-For` por la IP real del visitante que informa Cloudflare.
- La base vive en una red interna sin salida a internet. Hay un backup comprimido por día en `/opt/enhora/backups`, y se guardan 14 días.
- Cada versión es una imagen de GitHub Container Registry etiquetada con el commit. Volver atrás es reinstalar una etiqueta anterior.

| Dominio                | Qué es                                                   |
| ---------------------- | -------------------------------------------------------- |
| `app.enhora.net.ar`    | Comercios, `/panel` de administración y `/seguimiento/…` |
| `cadete.enhora.net.ar` | App de los cadetes                                       |
| `api.enhora.net.ar`    | API                                                      |
| `enhora.net.ar`, `www` | Redirigen a `app`                                        |

## Primera vez (unos 30 minutos)

### 1. Túnel en Cloudflare

1. En Cloudflare entrá a **Zero Trust → Networks → Tunnels → Create a tunnel**, elegí **Cloudflared** y ponele de nombre `enhora-vps`.
2. Copiá el **token** que aparece en el comando de instalación (lo que va después de `--token`). No instales nada todavía: el conector corre en Docker.
3. En **Public Hostnames** agregá estos cinco, todos apuntando al servicio `HTTP` → `web:80`:
   `app.enhora.net.ar`, `cadete.enhora.net.ar`, `api.enhora.net.ar`, `enhora.net.ar`, `www.enhora.net.ar`.
   Cloudflare crea solo los registros DNS. Si ya tenías registros con esos nombres, borralos antes.
4. En **SSL/TLS → Edge Certificates** activá **Always Use HTTPS** y poné **Minimum TLS Version 1.2**.

### 2. Clave de despliegue (en tu PC)

```bash
ssh-keygen -t ed25519 -f enhora_deploy -C github-actions-deploy -N ""
```

Te deja dos archivos: `enhora_deploy` (privada, va a GitHub) y `enhora_deploy.pub` (pública, va al VPS). No subas ninguno al repositorio.

### 3. Preparar el VPS

Conectado al VPS como root (o con `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/sperattidev/enhora/develop/infra/scripts/bootstrap-vps.sh -o bootstrap.sh
less bootstrap.sh
sudo bash bootstrap.sh "PEGÁ ACÁ EL CONTENIDO DE enhora_deploy.pub"
```

El script:

- actualiza el sistema y deja activos los parches de seguridad automáticos;
- instala Docker;
- crea el usuario `deploy`, que solo entra con clave;
- activa el firewall, que deja entrar solo SSH, y `fail2ban`;
- crea `/opt/enhora/.env` con secretos nuevos.

Después pegá el token del túnel:

```bash
sudo nano /opt/enhora/.env      # TUNNEL_TOKEN=...
```

### 4. Secretos en GitHub

En el repositorio: **Settings → Environments → production → Environment secrets**:

| Secreto           | Valor                                                  |
| ----------------- | ------------------------------------------------------ |
| `VPS_HOST`        | IP o nombre del VPS                                    |
| `VPS_SSH_KEY`     | Contenido completo de `enhora_deploy` (la **privada**) |
| `VPS_KNOWN_HOSTS` | Salida de `ssh-keyscan -t ed25519 IP_DEL_VPS`          |
| `VPS_SSH_PORT`    | Solo si SSH no está en el puerto 22                    |

Verificá que la huella de `VPS_KNOWN_HOSTS` sea la de tu VPS: en el VPS, `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` tiene que mostrar el mismo valor que `ssh-keygen -lf -` con la salida de `ssh-keyscan`. Así nadie puede hacerse pasar por tu servidor.

El environment `production` pide **tu aprobación** antes de cada despliegue.

### 5. Publicar

Abrí una PR de `develop` a `main` titulada `chore: release v0.1.0` y mergeala con **merge commit**. El workflow **Despliegue**:

1. construye y publica las imágenes;
2. espera tu aprobación (Actions → Despliegue → _Review deployments_);
3. copia `compose.prod.yml`, corre las migraciones, levanta todo y espera a que la API esté sana;
4. comprueba `https://api.enhora.net.ar/health/ready` desde internet.

### 6. Primer administrador

En el VPS:

```bash
cd /opt/enhora
read -rp 'Email: ' ADMIN_EMAIL; read -rsp 'Contraseña (10+ caracteres): ' ADMIN_PASSWORD; echo
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose -f compose.prod.yml run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD api node dist/scripts/create-admin.js
unset ADMIN_PASSWORD
```

La contraseña no queda en el historial de la terminal. Después entrá a `https://app.enhora.net.ar/panel`, dibujá las zonas de Firmat y revisá las tarifas.

## Día a día

| Tarea                         | Cómo                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Publicar una versión          | PR `develop → main`, merge y aprobar el despliegue                             |
| Volver a una versión anterior | Actions → **Despliegue** → _Run workflow_ con el SHA del commit que funcionaba |
| Ver logs                      | `cd /opt/enhora && docker compose -f compose.prod.yml logs -f api`             |
| Estado                        | `docker compose -f compose.prod.yml ps`                                        |
| Backups                       | `ls -lh /opt/enhora/backups`                                                   |

### Restaurar un backup

```bash
cd /opt/enhora
docker compose -f compose.prod.yml stop api
docker compose -f compose.prod.yml exec -T postgres pg_restore -U enhora -d enhora --clean --if-exists < backups/enhora-AAAAMMDD-HHMM.dump
docker compose -f compose.prod.yml start api
```

Probalo una vez antes de necesitarlo. Además, copiá los backups fuera del VPS (por ejemplo, a Cloudflare R2): si el disco se pierde, se pierden con él.

## Seguridad: qué protege qué

- **Sin puertos web abiertos:** no se puede atacar la IP del VPS ni saltear Cloudflare.
- **Cloudflare:** TLS, protección DDoS y WAF. Conviene sumar una regla de rate limiting para `api.enhora.net.ar/auth/*`.
- **Caddy:** HSTS, CSP estricta por app, anti-iframe y caché correcta (los archivos con hash duran un año; el HTML y el service worker siempre se revalidan).
- **Contenedores:** la API corre como usuario sin privilegios, con sistema de archivos de solo lectura y `no-new-privileges`. La base no tiene salida a internet.
- **Secretos:** viven solo en `/opt/enhora/.env` (permisos 600) y en los secretos de GitHub, nunca en el repositorio. El token del registro de imágenes dura lo que dura el despliegue.

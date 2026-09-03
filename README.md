# Bayeux

Embeds de X/Twitter que cosen las imágenes de un post en **una sola tira horizontal**,
en orden, con unos pocos píxeles de separación.

El nombre viene del [tapiz de Bayeux](https://es.wikipedia.org/wiki/Tapiz_de_Bayeux):
una narración pintada continua que se lee desplazándose en horizontal, que es
exactamente lo que el servicio reconstruye.

## El problema

Cuando pegas un enlace de X en Discord, el embed solo muestra la primera imagen.
FxTwitter y FixupX lo arreglan, pero cuando el post trae 3 o 4 imágenes las
combinan en cuadrícula:

```
  post con 4 paneles de un dibujo partido

  embed normal (cuadrícula)        Bayeux (tira)
  ┌─────────┬─────────┐            ┌───┬───┬───┬───┐
  │    1    │    2    │            │ 1 │ 2 │ 3 │ 4 │
  ├─────────┼─────────┤            │   │   │   │   │
  │    3    │    4    │            │   │   │   │   │
  └─────────┴─────────┘            └───┴───┴───┴───┘
  el dibujo se rompe               el dibujo se lee entero
```

Mucha gente que dibuja parte una ilustración alta o ancha en varias imágenes
para saltarse los límites de X. La cuadrícula destruye esa lectura. Bayeux
detecta ese caso y las cose en fila.

## Cómo se usa

Cambia `x.com` por el host donde tengas Bayeux:

```
https://x.com/usuario/status/1234567890
https://tu-host.example.net/usuario/status/1234567890
```

- Un **crawler de previews** (Discord, Telegram, Slack, WhatsApp, Mastodon…)
  recibe un HTML mínimo con las meta etiquetas OpenGraph.
- Un **humano** con navegador se va al post original con un `302`. Los sufijos
  del enlace copiado (`/photo/1`) se conservan.

### Saltarse la detección automática

```
?layout=row     fuerza la tira aunque la heurística diga que no
?layout=grid    fuerza la cuadrícula
?layout=auto    por defecto
```

La heurística falla a veces; el query param es la salida de emergencia.

## Cómo decide el layout

Se cose en fila cuando se cumple todo esto:

1. El post tiene entre **2 y 4 fotos** (`MAX_PHOTOS`).
2. **No hay vídeo ni GIF** mezclado.
3. Las **alturas coinciden** dentro de la tolerancia (`ROW_HEIGHT_TOLERANCE`, 2% por defecto).

Si no, cae al comportamiento normal: cuadrícula para varias fotos, imagen única
para una sola.

**Por qué la altura y no el aspecto.** Quien corta una ilustración en tiras
conserva la altura y deja que los anchos bailen unos píxeles. Es medible en
posts reales: un caso verificado tiene 4 fotos de `410×1206`, `409×1206`,
`407×1206` y `406×1206` — altura idéntica, anchos distintos. Exigir uniformidad
de aspecto rechazaría cortes desiguales que son perfectamente legítimos.

**Dónde falla.** Dos fotos normales sin ninguna relación, disparadas en la misma
orientación, también tienen la misma altura y saldrán en fila. No hay ninguna
señal en los metadatos que las distinga de un dibujo partido. Para eso está
`?layout=grid`.

## Rutas

| Ruta | Qué hace |
|---|---|
| `GET /:handle/status/:id` | HTML con meta etiquetas para bots, `302` a x.com para humanos |
| `GET /:handle/status/:id/*` | Igual, tragándose sufijos como `/photo/1` |
| `GET /strip/:id.webp` | La imagen cosida. Acepta `?layout=row\|grid\|auto`. También `.jpg` |
| `GET /oembed?id=` | Respuesta oEmbed: línea de autor y pie del embed |
| `GET /health` | Comprobación de vida, sin dependencias externas |
| `GET /` | Landing breve |

## Quickstart con pm2

```bash
git clone <este-repo> bayeux && cd bayeux
npm ci
cp .env.example .env && $EDITOR .env    # como mínimo: ALLOWED_HOSTS y PUBLIC_BASE_URL
npm run build

pm2 start ecosystem.config.cjs
pm2 save                                 # congela la lista de procesos actual
pm2 startup                              # imprime un comando: ejecútalo con sudo
```

`pm2 save` + `pm2 startup` es lo que hace que el servicio vuelva solo tras
reiniciar el servidor. Si te saltas `pm2 save`, el arranque automático levantará
una lista vacía.

Instala también la rotación de logs, o crecerán sin freno hasta llenar el disco:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

Operación del día a día:

```bash
pm2 logs bayeux          # seguir los logs
pm2 restart bayeux       # tras un npm run build
pm2 reload bayeux        # recargar sin cortar peticiones
pm2 monit                # CPU y memoria
```

`restart` **no relee `ecosystem.config.cjs`**. Si cambias ese fichero (el puerto,
los `node_args`, la ruta del script), hace falta recrear la app:

```bash
pm2 delete bayeux && pm2 start ecosystem.config.cjs && pm2 save
```

### Comprobación manual

```bash
curl -sH "User-Agent: Discordbot/2.0" http://localhost:3000/usuario/status/ID | grep -i "og:"
```

Debes ver un `og:url` apuntando a **x.com** (no a tu servicio), un `og:image`
apuntando a tu `/strip/ID.jpg`, y `og:image:width`/`height` con las medidas
reales de la imagen generada.

## Despliegue detrás de un reverse proxy

El proceso **no escucha nunca en `0.0.0.0`**. Quien expone al exterior es el
proxy, que además resuelve TLS.

El proxy tiene que pasar dos cabeceras, porque de ellas sale la URL absoluta del
`og:image`:

- `X-Forwarded-Host` — el host por el que entró la petición
- `X-Forwarded-Proto` — `https`

Sin ellas, Bayeux cae a `PUBLIC_BASE_URL` y el crawler descargará la imagen de
un host distinto del que se pegó en el chat.

### Varios hostnames sobre el mismo proceso

Bayeux está pensado para responder en varios subdominios a la vez, todos
apuntando al mismo proceso. La URL base se deriva de **cada petición**, no de una
constante, así que el `og:image` sale siempre por el subdominio que se pegó.

Dos cosas que hay que configurar bien:

- **`ALLOWED_HOSTS`**: todos los hostnames que sirvas. El host entrante se compara
  contra esta lista y lo que se emite en el HTML es *la entrada de la lista*, no
  la cabecera recibida. Un `Host` manipulado no puede acabar dentro del HTML.
- **`TRUST_PROXY`**: la IP o el CIDR del proxy. **No lo pongas a `true`**: si lo
  haces, cualquiera puede falsear `X-Forwarded-For`, el rate limit verá todas las
  peticiones como si vinieran de una IP distinta y dejará de servir para nada.

### Si tu proxy corre dentro de un contenedor

Es fácil pasarlo por alto, y falla de una forma poco obvia: el proxy responde
`502` y no hay ni una línea en los logs de Bayeux, porque la conexión nunca llega.

Dentro de un contenedor, `127.0.0.1` es **el propio contenedor**. Si Bayeux se
ata a loopback del host, el proxy no puede alcanzarlo. Hay que atarlo a la puerta
de enlace del puente Docker, que es el host visto desde los contenedores:

```bash
HOST=172.17.0.1            # no 127.0.0.1
TRUST_PROXY=172.17.0.0/16  # la red del contenedor que hace de proxy
```

Sigue sin ser `0.0.0.0`: escucha solo en la interfaz del puente, no en tu red
local. Para saber si tu proxy está en un contenedor y en qué red:

```bash
cat /proc/$(pgrep -x caddy)/cgroup     # …/docker-<id>.scope si es un contenedor
ip -4 addr show docker0 | grep inet    # la IP de la puerta de enlace
```

`ps aux` **no** sirve para esto: el host lista también los procesos de dentro de
los contenedores, así que un proxy en Docker parece un proceso nativo.

### Ejemplo con Caddy

Caddy manda `X-Forwarded-Host` y `X-Forwarded-Proto` por defecto en
`reverse_proxy`, así que no hay que declararlas:

```caddyfile
bayeux.example.net, tirax.example.net, panox.example.net {
    reverse_proxy 127.0.0.1:3000
    # Con Caddy en un contenedor: reverse_proxy 172.17.0.1:3000
}
```

Los certificados de Let's Encrypt los resuelve Caddy solo, y como los hostnames
están escritos explícitamente los pide al recargar, no en la primera visita. Con
nginx o Apache tendrás que añadir las cabeceras a mano.

## Variables de entorno

Todas tienen un valor por defecto sensato. Ver [`.env.example`](.env.example)
para el fichero completo comentado.

### Servidor

| Variable | Por defecto | Qué hace |
|---|---|---|
| `PORT` | `3000` | Puerto de escucha |
| `HOST` | `127.0.0.1` | Interfaz. Déjalo en localhost si hay proxy delante |
| `TRUST_PROXY` | `127.0.0.1` | IP o CIDR del proxy de confianza. Nunca `true` |
| `LOG_LEVEL` | `info` | Nivel de los logs (pino) |

### Hostnames

| Variable | Por defecto | Qué hace |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Fallback cuando el host entrante no vale |
| `ALLOWED_HOSTS` | `localhost:3000,127.0.0.1:3000` | Lista blanca de hosts reflejables |
| `HOST_LAYOUTS` | *(vacío)* | Layout por defecto por host: `tirax.example.net=row` |

### API upstream

| Variable | Por defecto | Qué hace |
|---|---|---|
| `FX_API_BASE` | `https://api.fxtwitter.com` | Base de la API |
| `FETCH_TIMEOUT_MS` | `6000` | Timeout de cada petición saliente |
| `OUTBOUND_USER_AGENT` | `Bayeux/0.1 (…)` | UA con el que sale Bayeux |

### Composición

| Variable | Por defecto | Qué hace |
|---|---|---|
| `MAX_PHOTOS` | `4` | Tope de paneles |
| `MAX_HEIGHT` | `1200` | Altura común a la que se normaliza. Acota la memoria |
| `MAX_PIXELS` | `12000000` | Presupuesto del lienzo. Si se pasa, la altura baja sola |
| `MAX_DOWNLOAD_BYTES` | `12582912` | Tope por imagen descargada |
| `GAP` | `6` | Separación entre paneles, en píxeles |
| `BG_COLOR` | `transparent` | Color del hueco. `transparent` lo deja del color del chat |
| `WEBP_QUALITY` | `82` | Calidad del WebP que se anuncia en el `og:image` |
| `JPEG_QUALITY` | `88` | Calidad del JPEG, que se sigue sirviendo en `/strip/:id.jpg` |
| `ROW_HEIGHT_TOLERANCE` | `0.02` | Dispersión de alturas tolerada: `(max-min)/max` |
| `ROW_ASPECT_TOLERANCE` | *(desactivada)* | Lo mismo sobre `w/h`. Ver nota abajo |

> **`ROW_ASPECT_TOLERANCE`** viene desactivada porque en cortes verticales
> legítimos los anchos varían y las alturas no. Sirve para un caso concreto:
> filtrar posts que casan la altura por casualidad con anchos desproporcionados
> (un panel de 400px junto a un banner de 3000px). Un valor generoso como `0.5`
> descarta esas rarezas sin tocar los cortes reales; uno estricto como `0.05`
> rompe la detección.

### Caché y límites

| Variable | Por defecto | Qué hace |
|---|---|---|
| `CACHE_DIR` | `./cache` | Directorio de los JPEG compuestos |
| `CACHE_MAX_BYTES` | `536870912` | Tamaño total antes de podar (512 MB) |
| `CACHE_MAX_AGE_DAYS` | `30` | Antigüedad antes de podar |
| `RATE_LIMIT_MAX` | `60` | Peticiones por IP y ventana |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Ventana del rate limit |

### Branding

| Variable | Por defecto | Qué hace |
|---|---|---|
| `SITE_NAME` | `Bayeux` | `og:site_name` y título de la landing |
| `THEME_COLOR` | `#1d1f23` | `theme-color` del embed |
| `REPO_URL` | *(vacío)* | Enlace al código en la landing |

## Cómo funciona por dentro

```
crawler ─→ /:handle/status/:id
             ├─ api.fxtwitter.com/2/status/:id   (metadatos: URLs, ancho, alto)
             ├─ decide el layout                  (fila / cuadrícula / única)
             └─ HTML con og:image → /strip/:id.jpg?layout=row

crawler ─→ /strip/:id.jpg?layout=row
             ├─ ¿está en caché? → se sirve, sin tocar la API
             └─ si no: descarga las fotos, cose con sharp, guarda, sirve
```

Detalles que igual no son obvios:

- **Las medidas se calculan sin descargar nada.** La API devuelve `width`/`height`
  reales, así que el HTML puede declarar `og:image:width`/`height` exactos antes
  de que exista la imagen. El mismo plan de layout alimenta el HTML y la
  composición, así que no pueden desviarse.
- **El `og:image` lleva el layout fijado** (`?layout=row`). Eso hace que la clave
  de caché se conozca desde la URL: un acierto se sirve sin llamar a la API.
- **Una sola foto no se compone.** El `og:image` apunta directamente a
  `pbs.twimg.com` a resolución original. Cero ancho de banda, cero pérdida.
- **Deduplicación en vuelo:** dos peticiones simultáneas al mismo id componen
  una sola vez y comparten el resultado.
- **Nunca un 500 desnudo.** Si la API falla o el post no existe, se devuelve un
  HTML de error con `200` y el enlace original intacto: en Discord un 4xx/5xx se
  ve como enlace roto y sin explicación.

Sin base de datos. La caché es en disco y se poda por tamaño y antigüedad.

## Limitaciones

Sin vender humo:

- **Discord escala la imagen del embed a una caja de unos 400×300.** Una tira de
  4 paneles verticales entra ahí como una franja fina: se intuye la continuidad,
  pero el detalle real solo se ve al hacer clic y abrir la imagen. Esto no tiene
  arreglo desde el servicio; es cómo renderiza Discord.
- **La tira ocupa menos alto que una galería nativa, y es inevitable.** Como la
  tira es ancha, agota los ~400px de ancho de la caja antes que los 300 de alto,
  y acaba en torno a 200px. Una cuadrícula, al ser más cuadrada, llega a los 300.
  Ningún formato de imagen ni relleno lo cambia: escalar es proporcional.

  Hay una alternativa, y conviene entender por qué no se usa. Si un servicio
  **no** declara `og:image`, Discord monta su propia galería con las imágenes
  originales, que sale más grande y con los huecos del color del chat. Es lo que
  hace FxEmbed con Discord: le cede la ranura de la imagen. Pero esa galería es
  precisamente la cuadrícula que rompe los dibujos partidos, que es el motivo de
  existir de Bayeux. **O tira propia, o galería nativa: es la misma ranura.**
- **La heurística no lee las imágenes**, solo sus dimensiones. Dos fotos sin
  relación con la misma altura saldrán en fila. `?layout=grid` lo corrige.
- **Máximo 4 fotos**, que es el tope de X de todos modos.
- **Depende de la API pública de FxTwitter.** Si se cae o cambia, Bayeux se cae
  con ella. No hay scraping propio de respaldo.
- **Sin soporte de vídeo ni GIF.** Un post con vídeo cae a cuadrícula o a la
  imagen única; no se genera ninguna miniatura especial.
- **Los posts protegidos o borrados** devuelven el embed de error, no el
  contenido.

## Desarrollo

```bash
npm run dev      # tsx watch
npm test         # vitest, sin red
npm run lint     # tsc --noEmit
npm run build    # compila a dist/
```

Los tests no tocan la red: las respuestas de la API se sustituyen por fixtures
con dimensiones tomadas de posts reales, y las imágenes de prueba se generan con
sharp sobre la marcha.

## Sobre Docker

No se incluye Dockerfile a propósito. `sharp` trae binarios nativos de libvips
que hacen que una imagen bien hecha (multi-stage, la variante correcta de la
plataforma, sin romperse en Alpine) sea bastante más trabajo que el resto del
despliegue junto. Con pm2 esto son tres comandos. Si lo necesitas en contenedor,
la base `node:22-slim` funciona sin tocar nada.

## Créditos

- [FxEmbed](https://github.com/FxEmbed/FxEmbed) (MIT) — Bayeux consume su API
  pública `api.fxtwitter.com`, y la idea de coser las imágenes viene de su
  componente *mosaic*. Sin ese proyecto esto no existiría.
- Node, Fastify, [sharp](https://github.com/lovell/sharp), undici.

## Licencia

MIT. Ver [LICENSE](LICENSE).

---

Bayeux no está afiliado, asociado, autorizado ni respaldado por X Corp. Los
nombres «X» y «Twitter» y sus marcas pertenecen a sus respectivos dueños.

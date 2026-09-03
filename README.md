<p align="center">
  <img src="assets/icon.png" width="120" alt="Bayeux">
</p>

# 🧵 Bayeux

Servicio de embeds para enlaces de X/Twitter que cose las imágenes de un post en **una sola tira horizontal**, en orden y con unos pocos píxeles de separación.

El nombre viene del [tapiz de Bayeux](https://es.wikipedia.org/wiki/Tapiz_de_Bayeux): una narración pintada continua que se lee desplazándose en horizontal, que es exactamente lo que hace el servicio.

---

## 🤔 El problema

Cuando pegas un enlace de X en Discord, el embed solo enseña la primera imagen. FxTwitter y FixupX arreglan eso, pero cuando el post trae 3 o 4 fotos las montan en cuadrícula:

```
            embed normal              Bayeux
          ┌─────────┬─────────┐   ┌───┬───┬───┬───┐
          │    1    │    2    │   │ 1 │ 2 │ 3 │ 4 │
          ├─────────┼─────────┤   │   │   │   │   │
          │    3    │    4    │   │   │   │   │   │
          └─────────┴─────────┘   └───┴───┴───┴───┘
           el dibujo se rompe      se lee entero
```

Mucha gente que dibuja parte una ilustración alta en varias imágenes, ya sea por estilo o porque X limita el tamaño. La cuadrícula destroza esa lectura. Bayeux detecta ese caso concreto y las cose en fila.

---

## 🚀 Cómo se usa

Cambia `x.com` por el host donde tengas Bayeux:

```
https://x.com/usuario/status/1234567890
https://tu-host.example.net/usuario/status/1234567890
```

- Si quien entra es un **bot de previews** (Discord, Telegram, Slack, WhatsApp, Mastodon...), recibe un HTML mínimo con las meta etiquetas.
- Si es una **persona con navegador**, se le redirige al post original con un `302`. Los sufijos del enlace copiado (`/photo/1`) se conservan.

Si la detección automática se equivoca, puedes forzarla desde la URL:

| Parámetro | Qué hace |
|---|---|
| `?layout=row` | Fuerza la tira |
| `?layout=grid` | Fuerza la cuadrícula |
| `?layout=auto` | Por defecto |
| `?gap=N` | Fuerza la separación entre paneles, en píxeles |
| `?gap=auto` | Por defecto |
| `?zoom=100` | Calcula el hueco como el layout ancho de X (escritorio al 100%) |
| `?zoom=300` | Como el layout estrecho (móvil, o zoom al 300%). Por defecto |
| `?q=N` | Calidad de compresión, 40 a 100. Sólo en `/strip/`, porque no cambia las dimensiones |

---

## 🧠 Cómo decide si coser en fila

Se cose en fila cuando se cumple **todo** esto:

1. El post tiene entre **2 y 4 fotos**.
2. **No hay vídeo ni GIF** mezclado (si lo hay, no tiene sentido coser nada).
3. Las **alturas coinciden** dentro de una tolerancia, un 2% por defecto.

Si no se cumple, cae al comportamiento de siempre: cuadrícula para varias fotos, imagen única para una sola.

La señal buena es la **altura**, no el aspecto. Quien corta una ilustración en tiras conserva la altura y deja que los anchos bailen unos píxeles. Se ve en posts reales: cuatro fotos de `410×1206`, `409×1206`, `407×1206` y `406×1206`. Altura idéntica, anchos distintos. Si exigiéramos también uniformidad de aspecto, se rechazarían cortes desiguales que son perfectamente válidos.

⚠️ **Nota**: la heurística no mira las imágenes, solo sus dimensiones. Dos fotos sin ninguna relación disparadas en la misma orientación también tienen la misma altura y saldrán en fila. Para eso está `?layout=grid`.

---

## 🖼️ Cómo se construye el embed

Esta parte tiene su gracia, porque no es obvia.

Un enlace normal solo puede llenar título, descripción e imagen (las meta etiquetas de OpenGraph). Eso da un embed plano. Lo que hace Bayeux es declarar además esto:

```html
<link rel="alternate" type="application/activity+json" href="...">
```

Discord tiene **soporte nativo de Mastodon**, así que al ver esa línea se descarga `/api/v1/statuses/:id` y pinta el embed desde ahí: avatar del autor, texto en grande, estadísticas en negrita y pie con la fecha del post. Es la única vía para conseguirlo, con OpenGraph a secas no se llega.

La diferencia con otros servicios está en el campo `media_attachments` de ese documento. Ellos declaran **las fotos sueltas**, y por eso Discord las monta en su cuadrícula. Bayeux declara **un solo adjunto**, la tira ya cosida. Mismo embed bonito, sin que nadie despiece el dibujo.

Al resto de clientes (Telegram, WhatsApp) se les sigue sirviendo OpenGraph normal.

⚠️ **Nota**: por este camino **no hay query string que valga**. Discord toma el id del
enlace y construye él mismo la URL de `/api/v1/statuses/:id`, así que cualquier `?layout=`
o `?gap=` se pierde por el camino. Por eso el layout y el hueco ya resueltos viajan
**codificados dentro del id**, que Discord exige que sea numérico:

```
sin parámetros:   2095001889784164697
con parámetros:   9 1 016 2095001889784164697
                  │ │ │   └ el id de siempre
                  │ │ └ hueco en píxeles, a tres cifras
                  │ └ layout: 1 fila, 2 cuadrícula
                  └ marca de versión
```

Un id pelado se sigue entendiendo, para no romper los embeds que Discord ya tenga
cacheados.

---

## 📏 Cuánta separación dejar

Los trozos de un post **no siempre son contiguos**. Se puede medir: comparando la
diferencia entre columnas pegadas dentro de un panel con la que hay al cruzar el
corte, sale cuánto contenido falta. En dos posts reales daba esto:

| Post | Paneles | Falta | % del ancho |
|---|---|---|---|
| 4 fotos de 410×1206 | 4 | ~19px | 4,63% |
| 3 fotos de 841×1277 | 3 | ~1px | 0,12% |

O sea que **no hay un número universal**, porque depende de cómo cortase cada
persona su dibujo. Unos compensan el hueco que va a meter X y otros cortan al
ras.

Por eso Bayeux no intenta adivinar lo que falta, sino **reproducir lo que se ve
en X**, que es la referencia con la que trabaja quien dibuja.

X separa siempre **6 píxeles CSS**: 4 entre bordes más 1 de borde por lado. Eso
es idéntico en escritorio y en móvil. Lo que cambia es a qué tamaño pinta los
trozos, así que la **proporción** no es la misma:

| Layout | Alto del trozo | Hueco / alto |
|---|---|---|
| Ancho (escritorio al 100%) | 700 px CSS | 0,857 % |
| Estrecho (móvil, o zoom al 300%) | 464 px CSS | 1,292 % |

Se calibra sobre el **estrecho**, que con la altura de 1200px por defecto son
**16px**. `?zoom=100` cambia al ancho (10px) y `?zoom=300` es el valor por
defecto.

#### Por qué el estrecho por defecto

Cuatro motivos, y el último es el que más pesa:

1. **Es donde encajan los cortes.** Midiendo sobre la propia imagen cuánto
   contenido falta entre trozos salen 15 a 25 px de origen. El layout estrecho
   da 15,6 y el ancho 10,3, que se queda fuera del rango.
2. **Es la vista donde se revisa el post.** Quien dibuja mira cómo ha quedado en
   el móvil, así que es razonable que cortara pensando en esa separación.
3. **Se ve mejor**, y no es solo cuestión de gusto: por debajo de cierto ancho,
   una discontinuidad se lee como un defecto (una línea de compresión, un fallo
   de escalado) y no como una decisión. Por encima, se lee como el canalón de
   una viñeta: separa sin romper la unidad. Todo el sentido de este servicio es
   que se note lo segundo.
4. **El error no cuesta lo mismo en las dos direcciones.** Pasarse deja un hueco
   algo generoso pero claramente intencionado; quedarse corto hace que las
   líneas parezcan ruido. Ante la duda, conviene errar por arriba.

Los dos valores son medidas reales, no una curva. X cambia de layout en un punto
de corte que no hemos localizado, así que un `?zoom=` intermedio se acerca al más
próximo de los dos en vez de interpolar, porque interpolar sería inventarse un
dato.

Que el hueco sea una proporción de la **altura** y no del ancho no es casual:
cuando la fila no cabe, X **no la encoge**, la deja desbordar con scroll
horizontal. El ancho del contenedor no entra en la cuenta, y por eso todo esto
se calcula con los metadatos, sin descargar ninguna imagen. Si un post concreto pide otra
cosa, `?gap=N` lo fuerza.

---

## 🗺️ Rutas

| Ruta | Qué hace |
|---|---|
| `GET /:handle/status/:id` | HTML con meta etiquetas para bots, `302` a x.com para personas |
| `GET /:handle/status/:id/*` | Igual, tragándose sufijos tipo `/photo/1` |
| `GET /strip/:id.webp` | La imagen cosida. Acepta `?layout=`. También responde a `.jpg` |
| `GET /api/v1/statuses/:id` | El documento estilo Mastodon que consulta Discord |
| `GET /users/:handle/statuses/:id` | Sólo existe para que el enlace anterior no sea un 404 |
| `GET /oembed?id=` | Respuesta oEmbed |
| `GET /icon.png` | El logo, si hay uno configurado |
| `GET /health` | Comprobación de vida, sin dependencias externas |
| `GET /` | Landing breve (ver abajo si prefieres servirla con el proxy) |

---

## 🚀 Instalación con pm2

```bash
git clone <este-repo> bayeux && cd bayeux
npm ci
cp .env.example .env && $EDITOR .env    # mínimo: ALLOWED_HOSTS y PUBLIC_BASE_URL
npm run build

pm2 start ecosystem.config.cjs
pm2 save          # congela la lista de procesos actual
pm2 startup       # imprime un comando, ejecútalo con sudo
```

`pm2 save` más `pm2 startup` es lo que hace que el servicio vuelva solo después de reiniciar el servidor. Si te saltas el `save`, el arranque automático levantará una lista vacía.

Instala también la rotación de logs, porque si no crecen hasta llenarte el disco:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

⚠️ **Nota**: `pm2 restart bayeux` (por nombre) **no relee** `ecosystem.config.cjs`. pm2 se
queda con la configuración que registró la primera vez. Para que la relea hay que pasarle
el fichero:

```bash
pm2 restart ecosystem.config.cjs        # relee puerto, node_args, memoria, rutas...
```

Con una excepción: el bloque `env` **no** se aplica ni así, ni con `--update-env`. Para
cambiar variables por esa vía hay que recrear la app:

```bash
pm2 delete bayeux && pm2 start ecosystem.config.cjs && pm2 save
```

(En este proyecto da igual, porque las variables no vienen de `env` sino del `.env` que
carga Node con `--env-file-if-exists`.)

### Vigilancia

pm2 reinicia el proceso si se muere, pero no cubre el caso de que siga vivo y deje de
responder. `scripts/vigilar.sh` comprueba `/health` desde fuera y reinicia si hace falta:

```bash
*/5 * * * * HEALTH_URL=http://127.0.0.1:3000/health /ruta/a/bayeux/scripts/vigilar.sh >/dev/null 2>&1
```

Hace tres intentos antes de dar nada por caído (un corte de un segundo no es una caída),
anota lo que pasa en `~/bayeux-vigilante.log` y, si defines `WEBHOOK_URL`, avisa por
Discord. Con `DRY_RUN=1` detecta pero no reinicia, que es como se prueba sin tocar nada.

### Comprobación rápida

```bash
curl -sH "User-Agent: Discordbot/2.0" http://localhost:3000/usuario/status/ID | grep -i "og:"
```

Tienes que ver un `og:url` apuntando a **x.com** (no a tu servicio) y un `og:image` apuntando a tu `/strip/`.

---

## 🌐 Detrás de un reverse proxy

El proceso escucha **solo en local**, nunca en `0.0.0.0`. Quien expone al exterior es el proxy, que además resuelve el TLS.

El proxy tiene que pasar dos cabeceras, porque de ellas sale la URL absoluta del `og:image`:

- `X-Forwarded-Host`, el host por el que entró la petición.
- `X-Forwarded-Proto`, o sea `https`.

Sin ellas, Bayeux cae a `PUBLIC_BASE_URL` y el bot se descargará la imagen de un host distinto del que se pegó en el chat.

### Varios hostnames a la vez

Bayeux está pensado para responder en **varios subdominios apuntando al mismo proceso**. La URL base se saca de cada petición, no de una constante, así que el `og:image` sale siempre por el subdominio que se pegó.

Dos cosas que hay que configurar bien:

- **`ALLOWED_HOSTS`**: todos los hostnames que sirvas. El host entrante se compara contra esa lista, y lo que se escribe en el HTML es *la entrada de la lista*, no la cabecera recibida. Así un `Host` manipulado no puede colarse dentro del HTML.
- **`TRUST_PROXY`**: la IP o el CIDR del proxy. **No lo pongas a `true`**, porque entonces cualquiera puede falsear `X-Forwarded-For` y el límite de peticiones por IP deja de servir para nada.

### Ejemplo con Caddy

Caddy manda `X-Forwarded-Host` y `X-Forwarded-Proto` por defecto en `reverse_proxy`, así que no hay que declararlas:

```caddyfile
bayeux.example.net, tirax.example.net, panox.example.net {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

### Portada estática

En `landing/` hay una portada de una sola página, sin dependencias ni compilación,
que se puede servir directamente desde el proxy en vez de por el proceso. Trae un
conversor de enlaces y una comparativa generada **por el propio servicio**, así que
las imágenes salen de `/strip/` y hay que dejar esa ruta apuntando al backend:

```caddyfile
bayeux.example.net, tirax.example.net {
	handle / {
		root * /ruta/a/bayeux/landing
		file_server
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
```

⚠️ **Nota**: tienen que ser bloques `handle`, no un `reverse_proxy` suelto. Con
`handle /` solo se captura la raíz exacta, y todo lo demás (`/strip/`, `/icon.png`,
`/api/v1/statuses/`) sigue llegando al proceso, que es justo lo que hace falta.

⚠️ **Nota**: si tu Caddy corre **dentro de un contenedor**, `127.0.0.1` es el propio contenedor y no llegará a nada. En ese caso apunta a la puerta de enlace del puente Docker (`172.17.0.1`), pon ahí también el `HOST` de Bayeux, y usa esa red en `TRUST_PROXY`.

---

## 🔧 Variables de entorno

Todas tienen un valor por defecto razonable. El fichero completo y comentado está en [`.env.example`](.env.example).

### Servidor

| Variable | Por defecto | Qué hace |
|---|---|---|
| `PORT` | `3000` | Puerto de escucha |
| `HOST` | `127.0.0.1` | Interfaz. Déjalo en local si hay proxy delante |
| `TRUST_PROXY` | `127.0.0.1` | IP o CIDR del proxy de confianza. Nunca `true` |
| `LOG_LEVEL` | `info` | Nivel de los logs |

### Hostnames

| Variable | Por defecto | Qué hace |
|---|---|---|
| `PUBLIC_BASE_URL` | `http://localhost:3000` | Fallback si el host entrante no vale |
| `ALLOWED_HOSTS` | `localhost:3000,...` | Lista blanca de hosts que se pueden reflejar |
| `HOST_LAYOUTS` | *(vacío)* | Layout fijo por host, tipo `tirax.example.net=row` |

### API upstream

| Variable | Por defecto | Qué hace |
|---|---|---|
| `FX_API_BASE` | `https://api.fxtwitter.com` | Base de la API |
| `FETCH_TIMEOUT_MS` | `6000` | Timeout de cada petición saliente |
| `OUTBOUND_USER_AGENT` | `Bayeux/0.1 (...)` | UA con el que sale Bayeux |

### Composición

| Variable | Por defecto | Qué hace |
|---|---|---|
| `MAX_PHOTOS` | `4` | Tope de paneles |
| `MAX_HEIGHT` | `2000` | Altura común a la que se normaliza. Alto para no reescalar de más |
| `MAX_PIXELS` | `12000000` | Presupuesto del lienzo. Si se pasa, la altura baja sola |
| `MAX_DOWNLOAD_BYTES` | `12582912` | Tope por imagen descargada |
| `GAP` | `auto` | Separación entre paneles. Ver la sección de abajo |
| `X_DISPLAY_HEIGHT` | `1393` | Alto del trozo en la captura de referencia |
| `X_DISPLAY_GAP` | `18` | Separación en esa misma captura. Solo se usa el cociente |
| `BG_COLOR` | `transparent` | Color del hueco. Con `transparent` se ve el fondo del chat |
| `WEBP_QUALITY` | `82` | Calidad del WebP |
| `JPEG_QUALITY` | `88` | Calidad del JPEG |
| `ROW_HEIGHT_TOLERANCE` | `0.02` | Dispersión de alturas tolerada, `(max-min)/max` |
| `ROW_ASPECT_TOLERANCE` | *(desactivada)* | Lo mismo sobre `w/h`. Ver nota de abajo |

⚠️ **Nota**: `ROW_ASPECT_TOLERANCE` viene desactivada porque en los cortes verticales los anchos varían y las alturas no. Sirve para un caso muy concreto: filtrar posts que casan la altura por casualidad con anchos desproporcionados (un panel de 400px al lado de un banner de 3000px). Un valor generoso tipo `0.5` descarta esas rarezas sin tocar los cortes reales, pero uno estricto como `0.05` rompe la detección.

### Caché y límites

| Variable | Por defecto | Qué hace |
|---|---|---|
| `CACHE_DIR` | `./cache` | Directorio de las imágenes compuestas |
| `CACHE_MAX_BYTES` | `536870912` | Tamaño total antes de podar (512 MB) |
| `CACHE_MAX_AGE_DAYS` | `30` | Antigüedad antes de podar |
| `RATE_LIMIT_MAX` | `60` | Peticiones por IP y ventana |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Ventana del límite |

### Marca

| Variable | Por defecto | Qué hace |
|---|---|---|
| `SITE_NAME` | `Bayeux` | Nombre que sale en el pie del embed |
| `THEME_COLOR` | `#1d1f23` | Color de acento del embed |
| `BRAND_ICON` | `assets/icon.png` | Logo que se sirve en `/icon.png`. Si el fichero no está, no se declara |
| `REPO_URL` | *(vacío)* | Enlace al código en la landing |

---

## 🧩 Cómo funciona por dentro

```
bot ──> /:handle/status/:id
          ├─ api.fxtwitter.com   (metadatos: URLs, ancho, alto)
          ├─ decide el layout    (fila / cuadrícula / única)
          └─ HTML con las meta etiquetas y el enlace al documento Mastodon

bot ──> /strip/:id.webp?layout=row
          ├─ ¿está en caché? se sirve tal cual, sin tocar la API
          └─ si no: descarga las fotos, cose con sharp, guarda y sirve
```

Cosas que igual no se ven a primera vista:

- **Las medidas se calculan sin descargar nada.** La API ya devuelve el ancho y el alto reales de cada foto, así que el HTML puede declarar las dimensiones exactas antes de que la imagen exista. El mismo plan alimenta el HTML y la composición, o sea que no pueden descuadrarse.
- **El `og:image` lleva el layout fijado** (`?layout=row`). Gracias a eso la clave de caché se conoce desde la URL, y un acierto se sirve sin llamar a la API.
- **Una sola foto no se compone.** Se enlaza directamente a `pbs.twimg.com` en resolución original. Cero ancho de banda y cero pérdida de calidad.
- **El hueco entre paneles es transparente**, así que se ve del color del chat en vez de una franja negra en tema claro. Por eso la salida es WebP, que conserva el canal alfa y encima pesa la mitad que el JPEG.
- **Dos peticiones a la vez al mismo post componen una sola imagen**, no dos.
- **El tope de tamaño de la caché se comprueba al escribir**, no solo en la poda
  periódica. Como la clave incluye layout, formato y hueco, un mismo post admite muchas
  variantes, y entre poda y poda no habría nada que frenara el crecimiento.
- **Nunca un 500 pelado.** Si la API falla o el post no existe, se devuelve un HTML de error con `200` y el enlace original intacto, porque en Discord un 4xx o un 5xx se ve como enlace roto y sin explicación.

Sin base de datos. La caché es en disco y se poda por tamaño y antigüedad.

---

## ⚠️ Limitaciones

Sin vender humo:

- **Discord escala la imagen del embed a una caja de unos 400×300.** Una tira de 4 paneles verticales entra ahí como una franja fina, se intuye la continuidad pero el detalle de verdad solo se ve al hacer clic. Esto no tiene arreglo desde el servicio, es cómo renderiza Discord.
- **La tira ocupa menos alto que una cuadrícula, y es inevitable.** Como es ancha, agota los 400px de ancho antes que los 300 de alto y se queda en unos 200. Una cuadrícula, al ser más cuadrada, llega a los 300. Ningún formato de imagen ni relleno cambia eso, escalar es proporcional.
- **La heurística no lee las imágenes**, solo sus dimensiones.
- **Máximo 4 fotos**, que de todas formas es el tope de X.
- **Depende de la API pública de FxTwitter.** Si se cae o cambia, Bayeux se cae con ella. No hay scraping propio de respaldo.
- **Sin soporte de vídeo ni GIF.** Un post con vídeo cae a cuadrícula o a imagen única.
- **Los posts protegidos o borrados** devuelven el embed de error, no el contenido.

---

## 🧪 Desarrollo

### Userscript para copiar enlaces

`tools/bayeux.user.js` añade un botón a cada post de X, **en la barra de acciones justo
después de Compartir**, que copia el enlace de Bayeux de ese post. Funciona igual en la
línea de tiempo y en la página de un post concreto.

Se instala con [Tampermonkey](https://www.tampermonkey.net/) o
[Violentmonkey](https://violentmonkey.github.io/): abres el fichero, el gestor lo detecta
por su cabecera `// ==UserScript==` y ofrece instalarlo. Lo único que hay que tocar son
las dos constantes de arriba:

```js
const HOST = 'bayeux.ultrak.dynu.net';   // tu subdominio
const PARAMS = '';                       // p.ej. '?layout=row' si lo quieres siempre
```

El botón **sólo sale donde sirve de algo**: en posts con dos o más fotos propias y sin
vídeo. Un detalle que costó una versión: X pinta la barra de acciones **antes** que las
fotos, así que un post con imágenes parece no tenerlas en la primera pasada. Por eso sólo
se marca un post como visto cuando el botón se ha puesto de verdad, nunca al descartarlo. Un post de sólo texto, o uno que cita a otro con dibujos, no lo enseña, porque ahí
no hay ninguna tira que coser. Las fotos de una cita se distinguen porque van dentro de un
`div[role="link"]` y las del propio post no.

⚠️ **Nota**: X reescribe su interfaz cada poco. El script se apoya sólo en tres cosas que
llevan años estables: el `article` de cada post, los `data-testid` de sus botones y el de
las fotos. Si algún día deja de aparecer el botón, lo más probable es que hayan cambiado
alguna de las tres.

Tampoco fija medidas propias: **mide el icono de un botón vecino y se ajusta a él**, porque
X usa 18,75px en la línea de tiempo y 22,5px en la página de un post. Y se estira a todo el
alto de la barra en vez de llevar altura fija, que es lo que lo descuadraba 6px.

Sobre la posición: los cuatro contadores de X llevan `flex: 1 1 0%` y se comen todo el
espacio libre, así que lo que va detrás queda pegado con los 4px de hueco de la barra. Las
extensiones que añaden botones se despegan con un margen propio (Media Harvest usa 45px en
la página de un post y 12 en la línea de tiempo). El script **copia esa separación de quien
ya esté ahí**, y si no hay nadie usa esos mismos valores, así que el botón cae siempre en
la misma «zona de añadidos» y no pegado al de Compartir.

### Comparar ajustes de compresión

En `tools/comparar.html` hay una página suelta (se abre con doble clic, no se
despliega) que pinta la misma tira con dos juegos de parámetros al lado, con su
peso y su tiempo de descarga. Sirve para decidir ajustes de compresión mirando,
en vez de a ojo.

```bash
npm run dev      # tsx en modo watch
npm test         # vitest, sin red
npm run lint     # tsc --noEmit
npm run build    # compila a dist/
```

Los tests no tocan la red. Las respuestas de la API se sustituyen por fixtures con dimensiones sacadas de posts reales, y las imágenes de prueba se generan con sharp sobre la marcha.

`npm run lint` es `tsc --noEmit` y no un linter de estilo. En un proyecto TypeScript en modo estricto caza más problemas de verdad, y son bastantes dependencias menos.

### Sobre Docker

No hay Dockerfile a propósito. `sharp` trae binarios nativos de libvips que hacen que una imagen bien hecha (multi-stage, la variante correcta de la plataforma, sin romperse en Alpine) dé más trabajo que todo el despliegue junto. Con pm2 esto son tres comandos. Si lo necesitas en contenedor, la base `node:22-slim` funciona sin tocar nada.

---

## 🙏 Créditos

- [FxEmbed](https://github.com/FxEmbed/FxEmbed) (MIT). Bayeux consume su API pública `api.fxtwitter.com`, y la idea de coser las imágenes viene de su componente *mosaic*. Sin ese proyecto esto no existiría.
- El logo lo generé con **Recraft (V4.1 Vector)** y lo retoqué a mano.
- Node, Fastify, [sharp](https://github.com/lovell/sharp) y undici.

---

## 📄 Licencia

MIT. Puedes verla en [LICENSE](LICENSE).

Bayeux no está afiliado, asociado, autorizado ni respaldado por X Corp. Los nombres "X" y "Twitter" y sus marcas pertenecen a sus respectivos dueños.

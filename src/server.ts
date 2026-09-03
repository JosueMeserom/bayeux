import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { mkdir } from 'node:fs/promises';
import { config } from './config.js';
import { FxError, fetchStatus, photosOf } from './fx.js';
import { embedHtml, errorHtml, imageUrl, landingHtml, oembedJson } from './html.js';
import { mastodonStatus } from './mastodon.js';
import { baseUrlFor, hostLayout, isCrawler } from './http.js';
import { isLayoutMode, planLayout, type LayoutMode } from './layout.js';
import { formatFromExt, pruneCache, readCached, renderStrip, type StripFormat } from './strip.js';

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const STATUS_ID = /^[0-9]{1,25}$/;

const xUrl = (handle: string, id: string, rest?: string) =>
  `https://x.com/${handle}/status/${id}${rest ? `/${rest}` : ''}`;

/** Prioridad: query param > layout por defecto del host > auto. */
function resolveMode(query: unknown, headers: Record<string, unknown>): LayoutMode {
  const q = (query as { layout?: unknown })?.layout;
  if (isLayoutMode(q)) return q;
  return hostLayout(headers) ?? 'auto';
}

// Async a propósito: `register` es diferido, así que hay que esperar a que el
// plugin cargue su hook onRequest ANTES de declarar rutas. Si no, las rutas
// quedan fuera del rate limit sin dar ningún error.
export async function build() {
  const app = Fastify({
    // Acotado a la IP del proxy: con `true` cualquiera falsearía X-Forwarded-For
    // y el rate limit por IP dejaría de servir para nada.
    trustProxy: config.trustProxy,
    logger: {
      level: config.logLevel,
      // Nunca se vuelca el texto de los posts; sólo ids y rutas.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    allowList: (req) => req.url === '/health',
  });

  app.get('/health', async () => ({ status: 'ok', uptime: Math.round(process.uptime()) }));

  app.get('/', async (req, reply) => {
    reply.type('text/html; charset=utf-8').header('cache-control', 'public, max-age=3600');
    return landingHtml(baseUrlFor(req.headers, req.protocol));
  });

  // Discord pide esto cuando ve el <link rel="alternate" ... json+oembed>.
  // Es el único canal para la línea de autor con icono y el pie del embed.
  app.get<{ Querystring: { id?: string } }>('/oembed', async (req, reply) => {
    const id = req.query.id;
    if (!id || !STATUS_ID.test(id)) return reply.code(404).send({ error: 'id inválido' });

    const status = await fetchStatus(id).catch(() => null);
    if (!status) return reply.code(404).send({ error: 'post no encontrado' });

    return reply
      .type('application/json; charset=utf-8')
      .header('cache-control', 'public, max-age=300')
      .send(oembedJson(status));
  });

  /*
   * API con forma de Mastodon. Discord la consulta al ver el
   * <link rel="alternate" type="application/activity+json"> y monta el embed
   * desde aquí: avatar, texto en grande, adjunto y pie con la fecha.
   * Declaramos un solo adjunto, la tira, para que no la despiece en cuadrícula.
   */
  app.get<{ Params: { id: string } }>('/api/v1/statuses/:id', async (req, reply) => {
    const { id } = req.params;
    if (!STATUS_ID.test(id)) return reply.code(404).send({ error: 'id inválido' });

    const status = await fetchStatus(id).catch(() => null);
    if (!status) return reply.code(404).send({ error: 'post no encontrado' });

    const base = baseUrlFor(req.headers, req.protocol);
    const plan = planLayout(status, resolveMode(req.query, req.headers));
    return reply
      .type('application/json; charset=utf-8')
      .header('cache-control', 'public, max-age=300')
      .send(mastodonStatus(status, plan, base, imageUrl(status.id, plan, base)));
  });

  // Sólo existe para que el enlace del <link rel="alternate"> no sea un 404:
  // Discord saca de él el id y consulta /api/v1/statuses/:id.
  app.get<{ Params: { handle: string; id: string } }>(
    '/users/:handle/statuses/:id',
    async (req, reply) => {
      const { handle, id } = req.params;
      if (!HANDLE.test(handle) || !STATUS_ID.test(id)) {
        return reply.code(404).send({ error: 'enlace no reconocido' });
      }
      return reply.redirect(xUrl(handle, id), 302);
    },
  );

  app.get<{ Params: { file: string }; Querystring: { layout?: string } }>(
    '/strip/:file',
    async (req, reply) => {
      const [id = '', ext = ''] = req.params.file.split('.');
      const format = formatFromExt(ext);
      if (!STATUS_ID.test(id) || !format) return reply.code(404).send({ error: 'ruta inválida' });

      const send = (mode: 'row' | 'grid', body: Buffer) =>
        reply
          .type(format === 'webp' ? 'image/webp' : 'image/jpeg')
          // Immutable: la clave incluye la versión del algoritmo, así que el
          // contenido de una URL dada no cambia nunca. Discord la cachea y la re-sirve.
          .header('cache-control', 'public, max-age=31536000, immutable')
          .header('x-bayeux-layout', mode)
          .send(body);

      // Con el layout fijado en la URL la clave de caché es conocida: un acierto
      // se sirve sin llamar a la API upstream.
      const pinned = req.query.layout;
      if (pinned === 'row' || pinned === 'grid') {
        const hit = await readCached(id, pinned, format);
        if (hit) return send(pinned, hit);
      }

      const status = await fetchStatus(id).catch(() => null);
      if (!status) return reply.code(404).send({ error: 'post no encontrado' });

      const plan = planLayout(status, resolveMode(req.query, req.headers));
      if (plan.kind === 'none') return reply.code(404).send({ error: 'el post no tiene fotos' });
      // Una sola foto: no hay nada que componer, se manda al original de pbs.twimg.com.
      if (plan.kind === 'passthrough') return reply.redirect(plan.url, 302);

      try {
        return send(plan.kind, await renderStrip(id, plan, format));
      } catch (err) {
        // Degradar antes que reventar: la primera foto sola sigue siendo un embed útil.
        req.log.warn({ id, err: (err as Error).message }, 'composición fallida');
        const first = photosOf(status)[0];
        if (first) return reply.redirect(first.url, 302);
        return reply.code(502).send({ error: 'no se pudo componer la imagen' });
      }
    },
  );

  type StatusRoute = {
    Params: { handle: string; id: string; '*'?: string };
    Querystring: { layout?: string };
  };

  const statusHandler = async (req: FastifyRequest<StatusRoute>, reply: FastifyReply) => {
    const { handle, id } = req.params;
    const rest = req.params['*'];

    if (!HANDLE.test(handle) || !STATUS_ID.test(id)) {
      return reply.code(404).send({ error: 'enlace no reconocido' });
    }

    const original = xUrl(handle, id, rest);
    // Un humano no quiere ver meta etiquetas: va directo al post.
    if (!isCrawler(req.headers['user-agent'])) return reply.redirect(original, 302);

    reply.type('text/html; charset=utf-8');
    try {
      const status = await fetchStatus(id);
      const plan = planLayout(status, resolveMode(req.query, req.headers));
      const isDiscord = (req.headers['user-agent'] ?? '').includes('Discordbot');
      return embedHtml(status, plan, baseUrlFor(req.headers, req.protocol), isDiscord);
    } catch (err) {
      const reason =
        err instanceof FxError && err.code === 404
          ? 'El post no existe, se borró o la cuenta es privada.'
          : 'No se pudo leer el post desde la API upstream.';
      req.log.warn({ id, code: err instanceof FxError ? err.code : undefined }, 'upstream falló');
      // 200 a propósito: con un 4xx/5xx Discord no renderiza las meta etiquetas
      // y el enlace se ve roto y sin explicación.
      return errorHtml(original, reason);
    }
  };

  app.get<StatusRoute>('/:handle/status/:id', statusHandler);
  // Los enlaces copiados de X traen sufijos como /photo/1; hay que tragárselos.
  app.get<StatusRoute>('/:handle/status/:id/*', statusHandler);

  return app;
}

export async function start() {
  await mkdir(config.cacheDir, { recursive: true });
  const app = await build();

  const prune = async () => {
    const { removed, bytes } = await pruneCache();
    if (removed) app.log.info({ removed, bytes }, 'caché podada');
  };
  await prune();
  const timer = setInterval(prune, 6 * 60 * 60 * 1000);
  timer.unref();

  await app.listen({ port: config.port, host: config.host });
  return app;
}

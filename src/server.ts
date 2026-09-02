import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { FxError, fetchStatus, photosOf } from './fx.js';
import { embedHtml, errorHtml, landingHtml } from './html.js';
import { baseUrlFor, hostLayout, isCrawler } from './http.js';
import { isLayoutMode, planLayout, type LayoutMode } from './layout.js';
import { pruneCache, readCached, renderStrip } from './strip.js';

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

  app.get<{ Params: { id: string }; Querystring: { layout?: string } }>(
    '/strip/:id.jpg',
    async (req, reply) => {
      const { id } = req.params;
      if (!STATUS_ID.test(id)) return reply.code(404).send({ error: 'id inválido' });

      const jpeg = (mode: 'row' | 'grid', body: Buffer) =>
        reply
          .type('image/jpeg')
          // Immutable: la clave incluye la versión del algoritmo, así que el
          // contenido de una URL dada no cambia nunca. Discord la cachea y la re-sirve.
          .header('cache-control', 'public, max-age=31536000, immutable')
          .header('x-bayeux-layout', mode)
          .send(body);

      // Con el layout fijado en la URL la clave de caché es conocida: un acierto
      // se sirve sin llamar a la API upstream.
      const pinned = req.query.layout;
      if (pinned === 'row' || pinned === 'grid') {
        const hit = await readCached(id, pinned);
        if (hit) return jpeg(pinned, hit);
      }

      const status = await fetchStatus(id).catch(() => null);
      if (!status) return reply.code(404).send({ error: 'post no encontrado' });

      const plan = planLayout(status, resolveMode(req.query, req.headers));
      if (plan.kind === 'none') return reply.code(404).send({ error: 'el post no tiene fotos' });
      // Una sola foto: no hay nada que componer, se manda al original de pbs.twimg.com.
      if (plan.kind === 'passthrough') return reply.redirect(plan.url, 302);

      try {
        return jpeg(plan.kind, await renderStrip(id, plan));
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
      return embedHtml(status, plan, baseUrlFor(req.headers, req.protocol));
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

// Sólo arranca si se ejecuta directamente, no al importarlo desde los tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

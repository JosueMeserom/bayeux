import { config } from './config.js';
import type { FxStatus } from './fx.js';
import { compact, escapeHtml } from './html.js';
import type { Plan } from './layout.js';

/*
 * Documento con forma de status de Mastodon.
 *
 * Discord tiene soporte nativo de Mastodon: si el HTML declara un
 * `<link rel="alternate" type="application/json+activity">`, se descarga
 * `/api/v1/statuses/:id` y pinta el embed desde ahí — avatar del autor, texto
 * en grande, adjuntos y pie con la fecha. Es la única vía para eso; con
 * OpenGraph a secas no se llega, por muchas etiquetas que se prueben.
 *
 * La diferencia con FxEmbed es deliberada y es todo el proyecto: ellos
 * declaran las fotos sueltas y Discord las monta en cuadrícula. Nosotros
 * declaramos **un solo adjunto**, la tira ya cosida.
 */

/*
 * Discord exige que el id del status de Mastodon sea NUMÉRICO, así que los
 * parámetros de composición no pueden viajar como query string: el enlace
 * `activity+json` sólo transporta un id, y de ahí sale la llamada a
 * /api/v1/statuses/:id. Si no se meten dentro del id, se pierden.
 *
 * (FxEmbed resuelve lo mismo con lo que llama «snowcode»: codifica un JSON
 * entero a dos dígitos por carácter. Aquí basta algo mucho más simple, porque
 * sólo hay dos parámetros que transportar.)
 *
 *   sin parámetros:   2095001889784164697
 *   con parámetros:   9 1 016 2095001889784164697
 *                     │ │ │   └ el id de siempre
 *                     │ │ └ hueco en píxeles, a tres cifras
 *                     │ └ layout: 1 fila, 2 cuadrícula
 *                     └ marca de versión
 */
const MARCA = '9';

export function encodeStatusId(id: string, kind?: 'row' | 'grid', gap?: number): string {
  if (!kind || gap === undefined) return id;
  return `${MARCA}${kind === 'row' ? '1' : '2'}${String(Math.min(999, gap)).padStart(3, '0')}${id}`;
}

export interface StatusIdDecodificado {
  id: string;
  kind?: 'row' | 'grid';
  gap?: number;
}

export function decodeStatusId(token: string): StatusIdDecodificado | null {
  if (!/^[0-9]{1,30}$/.test(token)) return null;
  // Un id de X tiene 19 cifras y crecerá muy despacio; el codificado tiene 24.
  // La marca de versión al principio evita confundirlos.
  if (token.length > 20 && token[0] === MARCA) {
    const kind = token[1] === '1' ? 'row' : token[1] === '2' ? 'grid' : undefined;
    const gap = Number(token.slice(2, 5));
    const id = token.slice(5);
    if (kind && Number.isFinite(gap) && /^[0-9]{1,25}$/.test(id)) return { id, kind, gap };
    return null;
  }
  return token.length <= 25 ? { id: token } : null;
}

interface Attachment {
  id: string;
  type: 'image';
  url: string;
  preview_url: string;
  remote_url: null;
  preview_remote_url: null;
  text_url: null;
  description: string | null;
  meta: { original: { width: number; height: number; size: string; aspect: number } };
}

const attachment = (id: string, url: string, width: number, height: number): Attachment => ({
  id,
  type: 'image',
  url,
  preview_url: url,
  remote_url: null,
  preview_remote_url: null,
  text_url: null,
  description: null,
  meta: { original: { width, height, size: `${width}x${height}`, aspect: width / height } },
});

/**
 * Cuerpo del post en HTML.
 *
 * Las estadísticas van dentro del contenido y en negrita, separadas por
 * `&ensp;`. Ese es el motivo de que en otros servicios se vean más compactas
 * y en negrita: no es la fuente, es que forman parte del HTML del cuerpo.
 */
function contentHtml(status: FxStatus): string {
  const text = escapeHtml(status.text.trim()).replace(/\n/g, '<br>');

  const stats: string[] = [];
  if (status.replies) stats.push(`💬 ${compact(status.replies)}`);
  if (status.reposts) stats.push(`🔁 ${compact(status.reposts)}`);
  if (status.likes) stats.push(`❤️ ${compact(status.likes)}`);
  if (status.views) stats.push(`👁️ ${compact(status.views)}`);

  if (stats.length === 0) return text;
  const line = `<b>${stats.join('&ensp;')}</b>`;
  return text ? `${text}<br><br>${line}` : line;
}

/** El adjunto único: la tira cosida, o la foto original si no hubo que coser. */
function attachmentsFor(status: FxStatus, plan: Plan, baseUrl: string, imageUrl?: string): Attachment[] {
  if (plan.kind === 'none') return [];
  if (plan.kind === 'passthrough') {
    return [attachment(`${status.id}-0`, plan.url, plan.width, plan.height)];
  }
  return [attachment(`${status.id}-strip`, imageUrl ?? baseUrl, plan.width, plan.height)];
}

export function mastodonStatus(
  status: FxStatus,
  plan: Plan,
  baseUrl: string,
  imageUrl?: string,
): Record<string, unknown> {
  const created = new Date((status.created_timestamp ?? 0) * 1000).toISOString();
  const profile = `https://x.com/${status.author.screen_name}`;

  return {
    id: status.id,
    url: status.url,
    uri: status.url,
    created_at: created,
    edited_at: null,
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    language: null,
    content: contentHtml(status),
    spoiler_text: '',
    visibility: 'public',
    application: { name: config.siteName, website: config.repoUrl || null },
    media_attachments: attachmentsFor(status, plan, baseUrl, imageUrl),
    account: {
      id: status.author.screen_name,
      display_name: status.author.name,
      username: status.author.screen_name,
      acct: status.author.screen_name,
      url: profile,
      uri: profile,
      created_at: created,
      locked: false,
      bot: false,
      discoverable: true,
      indexable: false,
      group: false,
      avatar: status.author.avatar_url,
      avatar_static: status.author.avatar_url,
      header: undefined,
      header_static: undefined,
      followers_count: undefined,
      following_count: undefined,
      statuses_count: undefined,
      hide_collections: false,
      noindex: false,
      emojis: [],
      roles: [],
      fields: [],
    },
    mentions: [],
    tags: [],
    emojis: [],
    card: null,
    poll: null,
  };
}

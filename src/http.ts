import { config } from './config.js';
import type { LayoutMode } from './layout.js';

/*
 * Crawlers de previews que hay que servir con HTML. El catch-all final cubre
 * el resto de bots; un navegador normal nunca casa con ninguno de estos.
 */
const BOT_UA =
  /(discordbot|telegrambot|slackbot|slack-imgproxy|twitterbot|whatsapp|facebookexternalhit|facebot|linkedinbot|redditbot|skypeuripreview|mastodon|synapse|pleroma|misskey|matrix|iframely|embedly|vkshare|googlebot|bingbot|applebot|yandex|bot\b|crawler|spider|preview|fetch)/i;

export function isCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return true; // sin UA: mejor servir el embed que redirigir a ciegas
  return BOT_UA.test(userAgent);
}

export interface RequestHeaders {
  host?: string | undefined;
  'x-forwarded-host'?: string | string[] | undefined;
  'x-forwarded-proto'?: string | string[] | undefined;
}

const first = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();

/**
 * URL base absoluta a reflejar en el HTML.
 *
 * Varios subdominios apuntan al mismo proceso, así que el og:image tiene que
 * salir por el host que usó el crawler. Se devuelve **la entrada de la lista
 * blanca**, no la cabecera recibida: así un `Host` manipulado no puede acabar
 * nunca dentro del HTML, ni siquiera con caracteres raros.
 */
export function baseUrlFor(headers: RequestHeaders, fallbackProto = 'http'): string {
  const candidate = first(headers['x-forwarded-host']) ?? first(headers.host);
  const match = config.allowedHosts.find((h) => h === candidate?.toLowerCase());
  if (!match) return config.publicBaseUrl;

  const proto = first(headers['x-forwarded-proto']) === 'https' ? 'https' : fallbackProto;
  return `${proto}://${match}`;
}

/** Layout por defecto del host, si se configuró uno en HOST_LAYOUTS. */
export function hostLayout(headers: RequestHeaders): LayoutMode | undefined {
  const candidate = (first(headers['x-forwarded-host']) ?? first(headers.host))?.toLowerCase();
  return candidate ? config.hostLayouts[candidate] : undefined;
}

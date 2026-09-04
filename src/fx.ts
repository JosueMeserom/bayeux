import { request } from 'undici';
import { config } from './config.js';

/*
 * Tipos escritos a partir de respuestas reales de https://api.fxtwitter.com/2/status/:id
 * y confirmados contra /2/openapi.json. Sólo se declara lo que Bayeux usa.
 *
 * Detalles no obvios que confirmó la verificación:
 *  - La raíz es `status`, no `tweet` (eso es la v1).
 *  - Las URLs de pbs.twimg.com ya vienen con `?name=orig`; no hay que reescribirlas.
 *  - `width`/`height` son obligatorios en fotos y vídeos, y coinciden con `orig`.
 *  - `media.photos[].type` es el enum `photo | gif`: un GIF puede aparecer ahí,
 *    así que filtrar por tipo es obligatorio, no defensivo.
 */

export interface FxPhoto {
  type: 'photo' | 'gif';
  id?: string;
  url: string;
  width: number;
  height: number;
  altText?: string;
}

export interface FxVideo {
  type: 'video' | 'gif';
  /** MP4 directo. Comprobado: `content-type: video/mp4` y `accept-ranges`. */
  url: string;
  width: number;
  height: number;
  duration?: number;
  format?: string;
  thumbnail_url?: string;
}

/** Lo que trae cualquier cosa de la que se pueda sacar contenido multimedia. */
export interface ConMedia {
  media?: {
    photos?: FxPhoto[];
    videos?: FxVideo[];
  };
}

/** Sólo lo que se usa de un post citado; el objeto real es un status entero. */
export interface FxQuote extends ConMedia {
  id: string;
  url: string;
  text: string;
  author: { name: string; screen_name: string };
}

export interface FxStatus {
  id: string;
  url: string;
  text: string;
  possibly_sensitive?: boolean;
  /** Segundos desde epoch. Alimenta la fecha del pie del embed. */
  created_timestamp?: number;
  replies?: number;
  reposts?: number;
  likes?: number;
  views?: number;
  author: { name: string; screen_name: string; avatar_url?: string };
  quote?: FxQuote;
  media?: {
    all?: unknown[];
    photos?: FxPhoto[];
    videos?: FxVideo[];
    mosaic?: { formats: { jpeg: string; webp: string } };
  };
}

export interface FxResponse {
  code: number;
  message?: string;
  status: FxStatus | null;
}

export class FxError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
    this.name = 'FxError';
  }
}

/** Fotos reales del post, sin GIFs, respetando el orden del autor. */
export function photosOf(post: ConMedia): FxPhoto[] {
  return (post.media?.photos ?? []).filter((p) => p.type === 'photo' && p.width > 0 && p.height > 0);
}

/** Un vídeo o GIF en el post descarta la tira: no hay nada que coser. */
export function hasMotion(post: ConMedia): boolean {
  return (post.media?.videos ?? []).length > 0;
}

/** El vídeo del post, si lo hay. X permite como mucho uno por post. */
export function videoOf(post: ConMedia): FxVideo | undefined {
  return (post.media?.videos ?? []).find((v) => v.url && v.width > 0 && v.height > 0);
}

/**
 * De dónde salen los medios que enseña el embed.
 *
 * Si el post no trae nada propio pero cita a otro que sí, se enseñan los del
 * citado: es lo que se ve en X y sin ello un «mira esto» quedaría sin imagen.
 * Lo propio manda siempre que exista.
 */
export function mediaSource(status: FxStatus): ConMedia {
  const propio = photosOf(status).length > 0 || hasMotion(status);
  return propio || !status.quote ? status : status.quote;
}

export async function fetchStatus(id: string): Promise<FxStatus> {
  const res = await request(`${config.fxApiBase}/2/status/${id}`, {
    headers: { 'user-agent': config.userAgent, accept: 'application/json' },
    headersTimeout: config.fetchTimeoutMs,
    bodyTimeout: config.fetchTimeoutMs,
  });

  const body = (await res.body.json()) as FxResponse;

  // La API distingue dos formas de error: 404 devuelve `{status:null, code:404}`
  // y 400 devuelve `{code:400, message:"..."}` sin campo `status`.
  if (res.statusCode !== 200 || !body.status) {
    throw new FxError(body.message ?? `upstream ${res.statusCode}`, body.code ?? res.statusCode);
  }
  return body.status;
}

/** Descarga una imagen con timeout y tope de tamaño. */
export async function fetchImage(url: string): Promise<Buffer> {
  const res = await request(url, {
    headers: { 'user-agent': config.userAgent },
    headersTimeout: config.fetchTimeoutMs,
    bodyTimeout: config.fetchTimeoutMs,
  });
  if (res.statusCode !== 200) {
    res.body.destroy();
    throw new FxError(`imagen ${res.statusCode}`, res.statusCode);
  }

  const declared = Number(res.headers['content-length']);
  if (Number.isFinite(declared) && declared > config.maxDownloadBytes) {
    res.body.destroy();
    throw new FxError('imagen demasiado grande', 413);
  }

  // Content-Length puede mentir o faltar, así que se corta también al vuelo.
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > config.maxDownloadBytes) {
      res.body.destroy();
      throw new FxError('imagen demasiado grande', 413);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

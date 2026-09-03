import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ALGO_VERSION, config } from './config.js';
import { fetchImage } from './fx.js';
import type { Plan } from './layout.js';

export type StripFormat = 'jpeg' | 'webp';

export const EXT: Record<StripFormat, string> = { jpeg: 'jpg', webp: 'webp' };

/**
 * Formato que se anuncia en el og:image. WebP porque conserva el canal alfa
 * (el hueco entre paneles queda del color del chat) y pesa un 20-25% menos que
 * el JPEG a calidad equivalente. Discord lo soporta. El .jpg se sigue sirviendo
 * para no romper embeds ya cacheados.
 */
export const STRIP_FORMAT: StripFormat = 'webp';

export function formatFromExt(ext: string): StripFormat | undefined {
  if (ext === 'webp') return 'webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  return undefined;
}

/** Clave de caché: id + layout + formato + versión del algoritmo. */
export function cacheKey(id: string, kind: 'row' | 'grid', format: StripFormat, gap: number): string {
  return `${id}-${kind}-g${gap}-${ALGO_VERSION}.${EXT[format]}`;
}

/** Lienzo transparente si BG_COLOR es `transparent`; si no, el color pedido. */
function canvasBackground() {
  const transparent = config.bgColor.toLowerCase() === 'transparent';
  return {
    channels: (transparent ? 4 : 3) as 3 | 4,
    background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : config.bgColor,
  };
}

/**
 * Lee el JPEG ya compuesto, si está.
 *
 * El og:image siempre lleva el layout fijado, así que con la URL basta para
 * conocer la clave: un acierto de caché no necesita preguntarle nada a la API.
 */
export function readCached(
  id: string,
  kind: 'row' | 'grid',
  format: StripFormat,
  gap: number,
): Promise<Buffer | null> {
  return readFile(join(config.cacheDir, cacheKey(id, kind, format, gap))).catch(() => null);
}

/** Composición pura: mismos buffers dentro, mismo JPEG fuera. Sin red, testeable. */
export async function composePanels(
  plan: Extract<Plan, { kind: 'row' | 'grid' }>,
  buffers: Buffer[],
  format: StripFormat = 'webp',
): Promise<Buffer> {
  const composites = await Promise.all(
    plan.panels.map(async (panel, i) => ({
      input: await sharp(buffers[i]!)
        // `cover` en vez de `fill`: en la fila las medidas ya respetan el aspecto
        // y sólo absorbe el redondeo; en la cuadrícula es el recorte de verdad.
        .resize(panel.width, panel.height, { fit: 'cover', position: 'centre' })
        .toBuffer(),
      left: panel.left,
      top: panel.top,
    })),
  );

  const canvas = sharp({
    create: { width: plan.width, height: plan.height, ...canvasBackground() },
  }).composite(composites);

  // WebP conserva el canal alfa; el JPEG no, así que ahí el hueco se aplana a negro.
  return format === 'webp'
    ? canvas.webp({ quality: config.webpQuality, effort: 4 }).toBuffer()
    : canvas
        .flatten({ background: '#000000' })
        .jpeg({ quality: config.jpegQuality, progressive: true, mozjpeg: true })
        .toBuffer();
}

const compose = async (plan: Extract<Plan, { kind: 'row' | 'grid' }>, format: StripFormat) =>
  composePanels(plan, await Promise.all(plan.panels.map((p) => fetchImage(p.url))), format);

// Deduplicación en vuelo: dos peticiones simultáneas al mismo id componen una vez.
const inFlight = new Map<string, Promise<Buffer>>();

/*
 * Tamaño total de la caché, en bytes. Lo fija la primera poda (que recorre el
 * directorio) y a partir de ahí se va sumando en cada escritura.
 *
 * Existe porque el tope de tamaño no puede comprobarse sólo en la poda
 * periódica: la clave de caché incluye el layout, el formato y el hueco, así
 * que un mismo post admite cientos de variantes y entre poda y poda no habría
 * nada que frenara el crecimiento.
 */
let cacheBytes: number | null = null;
let pruning: Promise<PruneResult> | null = null;

/** Suma lo escrito y poda en cuanto se pasa del tope, sin esperar al reloj. */
async function anotarEscritura(bytes: number): Promise<void> {
  if (cacheBytes === null) return; // aún sin medir; ya lo hará la poda al arrancar
  cacheBytes += bytes;
  if (cacheBytes > config.cacheMaxBytes) await pruneCache();
}

export async function renderStrip(
  id: string,
  plan: Extract<Plan, { kind: 'row' | 'grid' }>,
  format: StripFormat,
  gap: number,
): Promise<Buffer> {
  const key = cacheKey(id, plan.kind, format, gap);
  const path = join(config.cacheDir, key);

  const cached = await readCached(id, plan.kind, format, gap);
  if (cached) return cached;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const buf = await compose(plan, format);
    // Escritura atómica: un rename evita servir un JPEG a medias si el proceso muere.
    const tmp = `${path}.${createHash('sha1').update(key).digest('hex').slice(0, 8)}.tmp`;
    await mkdir(config.cacheDir, { recursive: true });
    await writeFile(tmp, buf);
    await rename(tmp, path);
    await anotarEscritura(buf.length);
    return buf;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, work);
  return work;
}

export interface PruneResult {
  /** Ficheros borrados. */
  removed: number;
  /** Bytes liberados. */
  bytes: number;
  /** Tamaño total que queda en disco. */
  total: number;
}

/**
 * Poda la caché por antigüedad y por tamaño total, borrando lo más viejo
 * primero. Si ya hay una poda en marcha, se devuelve esa misma: no tiene
 * sentido recorrer el directorio dos veces a la vez.
 */
export function pruneCache(): Promise<PruneResult> {
  pruning ??= podar().finally(() => {
    pruning = null;
  });
  return pruning;
}

async function podar(): Promise<PruneResult> {
  const names = await readdir(config.cacheDir).catch(() => [] as string[]);
  const entries = [];
  for (const name of names) {
    const path = join(config.cacheDir, name);
    const s = await stat(path).catch(() => null);
    if (s?.isFile()) entries.push({ path, size: s.size, mtime: s.mtimeMs });
  }

  entries.sort((a, b) => a.mtime - b.mtime);
  const cutoff = Date.now() - config.cacheMaxAgeDays * 86_400_000;
  let total = entries.reduce((a, e) => a + e.size, 0);
  let removed = 0;
  let bytes = 0;

  for (const e of entries) {
    if (e.mtime >= cutoff && total <= config.cacheMaxBytes) break;
    if (await unlink(e.path).then(() => true, () => false)) {
      total -= e.size;
      bytes += e.size;
      removed++;
    }
  }

  cacheBytes = total;
  return { removed, bytes, total };
}

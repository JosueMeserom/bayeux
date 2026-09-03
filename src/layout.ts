import { config } from './config.js';
import { hasMotion, photosOf, type FxPhoto, type FxStatus } from './fx.js';

export type LayoutMode = 'row' | 'grid' | 'auto';

export interface Panel {
  url: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Plan =
  /** Sin fotos: no hay og:image que ofrecer. */
  | { kind: 'none' }
  /** Una sola foto: se enlaza pbs.twimg.com directamente, sin componer nada. */
  | { kind: 'passthrough'; url: string; width: number; height: number }
  /** `gap` es el hueco ya resuelto en píxeles: viaja en la URL de la imagen. */
  | { kind: 'row' | 'grid'; width: number; height: number; gap: number; panels: Panel[] };

export interface LayoutOpts {
  /** Número de píxeles, o `auto` para imitar la separación que enseña X. */
  gap: number | 'auto';
  xDisplayHeight: number;
  xDisplayGap: number;
  maxHeight: number;
  maxPixels: number;
  maxPhotos: number;
  rowHeightTolerance: number;
  rowAspectTolerance: number;
}

export const defaultOpts = (): LayoutOpts => ({
  gap: config.gap,
  xDisplayHeight: config.xDisplayHeight,
  xDisplayGap: config.xDisplayGap,
  maxHeight: config.maxHeight,
  maxPixels: config.maxPixels,
  maxPhotos: config.maxPhotos,
  rowHeightTolerance: config.rowHeightTolerance,
  rowAspectTolerance: config.rowAspectTolerance,
});

export function isLayoutMode(v: unknown): v is LayoutMode {
  return v === 'row' || v === 'grid' || v === 'auto';
}

/** Dispersión relativa de una serie: (max-min)/max. 0 si todos son iguales. */
function spread(values: number[]): number {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max === 0 ? Infinity : (max - min) / max;
}

/**
 * ¿Parece un dibujo partido en paneles?
 *
 * La señal es que las alturas coinciden: quien corta una ilustración en tiras
 * conserva la altura y deja que los anchos bailen unos píxeles. Comprobado en
 * posts reales: 4 fotos de 410/409/407/406 × 1206 — altura idéntica, anchos no.
 * Por eso el aspecto viene desactivado por defecto (tolerancia Infinity);
 * exigirlo rechazaría cortes desiguales legítimos.
 */
export function looksLikeStrip(photos: FxPhoto[], motion: boolean, o: LayoutOpts): boolean {
  if (motion) return false;
  if (photos.length < 2 || photos.length > o.maxPhotos) return false;
  if (spread(photos.map((p) => p.height)) > o.rowHeightTolerance) return false;
  if (spread(photos.map((p) => p.width / p.height)) > o.rowAspectTolerance) return false;
  return true;
}

/** Reduce una altura objetivo hasta que el lienzo entre en el presupuesto de píxeles. */
function fitBudget(height: number, areaAt: (h: number) => number, maxPixels: number): number {
  let h = Math.max(1, Math.round(height));
  for (let i = 0; i < 8 && areaAt(h) > maxPixels; i++) {
    h = Math.max(1, Math.floor(h * Math.sqrt(maxPixels / areaAt(h))));
  }
  return h;
}

/**
 * Hueco entre paneles para una altura de lienzo dada.
 *
 * En `auto` es la misma proporción que usa X: escala la fila a una altura fija
 * y deja unos pocos píxeles entre trozos, así que el hueco es una fracción de
 * la altura y no un número absoluto.
 */
export function gapFor(height: number, o: LayoutOpts): number {
  if (o.gap !== 'auto') return o.gap;
  return Math.max(0, Math.round((height * o.xDisplayGap) / o.xDisplayHeight));
}

function planRow(photos: FxPhoto[], o: LayoutOpts): Plan {
  // Nunca se amplía por encima del original: se normaliza a la altura más baja.
  const source = Math.min(o.maxHeight, ...photos.map((p) => p.height));
  const widthsAt = (h: number) => photos.map((p) => Math.max(1, Math.round((p.width * h) / p.height)));
  const areaAt = (h: number) =>
    (widthsAt(h).reduce((a, b) => a + b, 0) + gapFor(h, o) * (photos.length - 1)) * h;

  const height = fitBudget(source, areaAt, o.maxPixels);
  const gap = gapFor(height, o);
  const widths = widthsAt(height);

  let left = 0;
  const panels: Panel[] = photos.map((p, i) => {
    const width = widths[i]!;
    const panel: Panel = { url: p.url, left, top: 0, width, height };
    left += width + gap;
    return panel;
  });

  return { kind: 'row', width: left - gap, height, gap, panels };
}

/**
 * Cuadrícula de respaldo, estilo mosaico: celdas recortadas a un lienzo 16:9.
 * ponytail: geometría fija para 2/3/4 fotos, no un empaquetado general.
 * Si algún día hacen falta más de 4 fotos, aquí es donde se generaliza.
 */
function planGrid(photos: FxPhoto[], o: LayoutOpts): Plan {
  const tallest = Math.max(...photos.map((p) => p.height));
  const height = fitBudget(Math.min(o.maxHeight, tallest), (h) => Math.round((h * 16) / 9) * h, o.maxPixels);
  const width = Math.round((height * 16) / 9);
  const gap = gapFor(height, o);

  // La celda derecha/inferior absorbe el redondeo para cuadrar con el lienzo exacto.
  const colW = Math.floor((width - gap) / 2);
  const colX = colW + gap;
  const colW2 = width - colX;
  const rowH = Math.floor((height - gap) / 2);
  const rowY = rowH + gap;
  const rowH2 = height - rowY;

  const boxes: Omit<Panel, 'url'>[] = [
    // 2 fotos: dos columnas a toda altura.
    [
      { left: 0, top: 0, width: colW, height },
      { left: colX, top: 0, width: colW2, height },
    ],
    // 3 fotos: una alta a la izquierda, dos apiladas a la derecha.
    [
      { left: 0, top: 0, width: colW, height },
      { left: colX, top: 0, width: colW2, height: rowH },
      { left: colX, top: rowY, width: colW2, height: rowH2 },
    ],
    // 4 fotos: 2×2.
    [
      { left: 0, top: 0, width: colW, height: rowH },
      { left: colX, top: 0, width: colW2, height: rowH },
      { left: 0, top: rowY, width: colW, height: rowH2 },
      { left: colX, top: rowY, width: colW2, height: rowH2 },
    ],
  ][photos.length - 2]!;

  return {
    kind: 'grid',
    width,
    height,
    gap,
    panels: boxes.map((b, i) => ({ ...b, url: photos[i]!.url })),
  };
}

export function planLayout(status: FxStatus, requested: LayoutMode = 'auto', o = defaultOpts()): Plan {
  const photos = photosOf(status).slice(0, o.maxPhotos);

  if (photos.length === 0) return { kind: 'none' };
  if (photos.length === 1) {
    const p = photos[0]!;
    return { kind: 'passthrough', url: p.url, width: p.width, height: p.height };
  }

  const row = requested === 'auto' ? looksLikeStrip(photos, hasMotion(status), o) : requested === 'row';
  return row ? planRow(photos, o) : planGrid(photos, o);
}

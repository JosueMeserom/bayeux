import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { planLayout } from '../src/layout.js';
import { composePanels } from '../src/strip.js';
import { statusWith } from './fixtures.js';

const COLORS = [
  { r: 220, g: 30, b: 30 },
  { r: 30, g: 200, b: 60 },
  { r: 40, g: 70, b: 230 },
  { r: 230, g: 200, b: 20 },
];

const solid = (w: number, h: number, i: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: COLORS[i]! } }).jpeg().toBuffer();

/** Color y opacidad del píxel (x,y) de la imagen resultante. */
async function pixelAt(img: Buffer, x: number, y: number) {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return { r: data[at]!, g: data[at + 1]!, b: data[at + 2]!, a: data[at + 3]! };
}

// La compresión es con pérdida: los colores planos se recuperan con margen de sobra.
const near = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
  expect(Math.abs(a.r - b.r)).toBeLessThan(16);
  expect(Math.abs(a.g - b.g)).toBeLessThan(16);
  expect(Math.abs(a.b - b.b)).toBeLessThan(16);
};

describe('composición de la fila', () => {
  it('produce exactamente las dimensiones que declaró el plan', async () => {
    const dims: [number, number][] = [[400, 1200], [420, 1200], [380, 1200]];
    const plan = planLayout(statusWith(dims), 'row');
    if (plan.kind !== 'row') throw new Error('esperaba row');

    const buffers = await Promise.all(dims.map(([w, h], i) => solid(w, h, i)));
    const meta = await sharp(await composePanels(plan, buffers)).metadata();

    expect(meta.width).toBe(plan.width);
    expect(meta.height).toBe(plan.height);
    expect(meta.width).toBe(400 + 420 + 380 + plan.gap * 2);
  });

  it('coloca cada panel en su sitio y en orden', async () => {
    const dims: [number, number][] = [[400, 1200], [400, 1200], [400, 1200], [400, 1200]];
    const plan = planLayout(statusWith(dims), 'row');
    if (plan.kind !== 'row') throw new Error('esperaba row');

    const jpeg = await composePanels(plan, await Promise.all(dims.map(([w, h], i) => solid(w, h, i))));

    for (const [i, panel] of plan.panels.entries()) {
      const x = panel.left + Math.floor(panel.width / 2);
      near(await pixelAt(jpeg, x, 600), COLORS[i]!);
    }
  });

  it('deja el hueco entre paneles transparente, no pintado', async () => {
    // Es lo que hace que la separación se vea del color del chat en vez de una
    // franja negra en tema claro.
    const dims: [number, number][] = [[400, 1200], [400, 1200]];
    const plan = planLayout(statusWith(dims), 'row');
    if (plan.kind !== 'row') throw new Error('esperaba row');

    const webp = await composePanels(plan, await Promise.all(dims.map(([w, h], i) => solid(w, h, i))));
    const gapX = plan.panels[0]!.width + Math.floor(plan.gap / 2); // centro del hueco

    expect((await pixelAt(webp, gapX, 600)).a).toBe(0);
    // Y los paneles siguen siendo opacos.
    expect((await pixelAt(webp, 200, 600)).a).toBe(255);
  });

  it('en JPEG el hueco se aplana a negro, porque no hay canal alfa', async () => {
    const dims: [number, number][] = [[400, 1200], [400, 1200]];
    const plan = planLayout(statusWith(dims), 'row');
    if (plan.kind !== 'row') throw new Error('esperaba row');

    const jpeg = await composePanels(plan, await Promise.all(dims.map(([w, h], i) => solid(w, h, i))), 'jpeg');
    expect((await sharp(jpeg).metadata()).format).toBe('jpeg');
    near(await pixelAt(jpeg, plan.panels[0]!.width + Math.floor(plan.gap / 2), 600), { r: 0, g: 0, b: 0 });
  });

  it('el WebP con alfa pesa menos que el JPEG equivalente', async () => {
    const dims: [number, number][] = [[400, 1200], [400, 1200], [400, 1200]];
    const plan = planLayout(statusWith(dims), 'row');
    if (plan.kind !== 'row') throw new Error('esperaba row');
    const buffers = await Promise.all(dims.map(([w, h], i) => solid(w, h, i)));

    const webp = await composePanels(plan, buffers, 'webp');
    const jpeg = await composePanels(plan, buffers, 'jpeg');
    expect((await sharp(webp).metadata()).format).toBe('webp');
    expect(webp.length).toBeLessThan(jpeg.length);
  });

  it('normaliza a una altura común cuando las fuentes difieren', async () => {
    const dims: [number, number][] = [[300, 900], [600, 1800]];
    const plan = planLayout(statusWith(dims), 'row');
    if (plan.kind !== 'row') throw new Error('esperaba row');

    const jpeg = await composePanels(plan, await Promise.all(dims.map(([w, h], i) => solid(w, h, i))));
    const meta = await sharp(jpeg).metadata();

    expect(plan.height).toBe(900);
    expect(meta.height).toBe(900);
    // La segunda foto, el doble de alta, se reescala al mismo ancho relativo.
    expect(plan.panels.map((p) => p.width)).toEqual([300, 300]);
  });
});

describe('composición de la cuadrícula', () => {
  it('rellena el lienzo entero con las 4 fotos', async () => {
    const dims: [number, number][] = Array.from({ length: 4 }, () => [800, 800]);
    const plan = planLayout(statusWith(dims), 'grid');
    if (plan.kind !== 'grid') throw new Error('esperaba grid');

    const jpeg = await composePanels(plan, await Promise.all(dims.map(([w, h], i) => solid(w, h, i))));
    expect((await sharp(jpeg).metadata()).width).toBe(plan.width);

    for (const [i, panel] of plan.panels.entries()) {
      const x = panel.left + Math.floor(panel.width / 2);
      const y = panel.top + Math.floor(panel.height / 2);
      near(await pixelAt(jpeg, x, y), COLORS[i]!);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { defaultOpts, gapFor, planLayout } from '../src/layout.js';
import { REAL, statusWith } from './fixtures.js';

const kindOf = (dims: [number, number][], extra = {}) =>
  planLayout(statusWith(dims, extra), 'auto').kind;

describe('decisión de layout en auto', () => {
  const cases: [string, [number, number][], object, string][] = [
    ['3 fotos idénticas (post real @Momotexx)', REAL.momote, {}, 'row'],
    ['4 fotos, misma altura y anchos distintos (post real @makokoto8)', REAL.makokoto, {}, 'row'],
    ['2 fotos de igual altura', [[500, 900], [520, 900]], {}, 'row'],
    ['4 fotos con 1px de diferencia de altura', [[400, 1200], [400, 1199], [400, 1200], [400, 1200]], {}, 'row'],
    ['alturas dispares (900 vs 600)', [[500, 900], [500, 600]], {}, 'grid'],
    ['alturas al 5%, fuera de la tolerancia del 2%', [[400, 1200], [400, 1140]], {}, 'grid'],
    ['3 fotos iguales con un vídeo mezclado', REAL.momote, { videos: 1 }, 'grid'],
    ['una sola foto', [[800, 600]], {}, 'passthrough'],
    ['sin fotos', [], {}, 'none'],
    ['5 fotos (por encima del máximo, se recorta a 4)', [[400, 1200], [400, 1200], [400, 1200], [400, 1200], [400, 1200]], {}, 'row'],
  ];

  for (const [name, dims, extra, expected] of cases) {
    it(`${name} → ${expected}`, () => expect(kindOf(dims, extra)).toBe(expected));
  }

  it('un GIF dentro de media.photos no cuenta como foto', () => {
    // El enum de la API permite type:"gif" en photos: si no se filtra,
    // dos fotos + un gif pasarían por una tira de tres paneles.
    const plan = planLayout(statusWith([[400, 1200], [400, 1200]], { gifPhotos: 1 }), 'auto');
    expect(plan.kind).toBe('row');
    expect(plan.kind === 'row' && plan.panels).toHaveLength(2);
  });
});

describe('layout forzado por query', () => {
  it('row fuerza la fila con alturas dispares', () => {
    expect(planLayout(statusWith([[500, 900], [500, 600]]), 'row').kind).toBe('row');
  });
  it('grid fuerza la cuadrícula aunque la heurística diga fila', () => {
    expect(planLayout(statusWith(REAL.makokoto), 'grid').kind).toBe('grid');
  });
  it('ni row ni grid pueden inventar una tira con una sola foto', () => {
    expect(planLayout(statusWith([[800, 600]]), 'row').kind).toBe('passthrough');
  });
});

describe('geometría de la fila', () => {
  it('calcula anchos, huecos y total del post real de 4 fotos', () => {
    const plan = planLayout(statusWith(REAL.makokoto), 'row');
    if (plan.kind !== 'row') throw new Error('esperaba row');

    // Altura tope 1200 (las fuentes son 1206) y hueco automático: la
    // proporción de X en su layout estrecho, 18/1393, da 16px a esta altura.
    expect(plan.height).toBe(1200);
    expect(plan.gap).toBe(16);
    expect(plan.panels.map((p) => p.width)).toEqual([408, 407, 405, 404]);
    expect(plan.panels.map((p) => p.left)).toEqual([0, 424, 847, 1268]);
    expect(plan.width).toBe(1672);
    expect(plan.panels.every((p) => p.top === 0)).toBe(true);
  });

  it('el ancho total es la suma de anchos más los huecos', () => {
    const plan = planLayout(statusWith(REAL.momote), 'row');
    if (plan.kind !== 'row') throw new Error('esperaba row');
    const sum = plan.panels.reduce((a, p) => a + p.width, 0);
    expect(plan.width).toBe(sum + plan.gap * (plan.panels.length - 1));
  });

  it('nunca amplía por encima de la fuente más baja', () => {
    const plan = planLayout(statusWith([[100, 300], [100, 300]]), 'row');
    expect(plan.kind === 'row' && plan.height).toBe(300);
  });

  it('respeta el presupuesto de píxeles degradando la altura', () => {
    const opts = { ...defaultOpts(), maxPixels: 500_000 };
    const plan = planLayout(statusWith(REAL.makokoto), 'row', opts);
    if (plan.kind !== 'row') throw new Error('esperaba row');
    expect(plan.width * plan.height).toBeLessThanOrEqual(500_000);
    expect(plan.height).toBeLessThan(1200);
  });
});

describe('hueco automático', () => {
  it('es proporcional a la altura, como el que enseña X', () => {
    // 18 sobre 1393 de alto. Al doble de altura, el doble de hueco.
    expect(gapFor(1393, defaultOpts())).toBe(18);
    expect(gapFor(2786, defaultOpts())).toBe(36);
    expect(gapFor(1200, defaultOpts())).toBe(16);
  });

  it('un GAP numérico desactiva el cálculo', () => {
    expect(gapFor(1200, { ...defaultOpts(), gap: 24 })).toBe(24);
    expect(gapFor(300, { ...defaultOpts(), gap: 0 })).toBe(0);
  });

  it('el plan expone el hueco ya resuelto, para que viaje en la URL', () => {
    const plan = planLayout(statusWith(REAL.momote), 'row');
    expect(plan.kind === 'row' && plan.gap).toBe(16);
  });
});

describe('geometría de la cuadrícula', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} fotos: los paneles cubren el lienzo sin salirse`, () => {
      const dims = Array.from({ length: n }, (): [number, number] => [600, 400]);
      const plan = planLayout(statusWith(dims), 'grid');
      if (plan.kind !== 'grid') throw new Error('esperaba grid');

      expect(plan.panels).toHaveLength(n);
      for (const p of plan.panels) {
        expect(p.left + p.width).toBeLessThanOrEqual(plan.width);
        expect(p.top + p.height).toBeLessThanOrEqual(plan.height);
      }
      // La última celda llega justo al borde: nada de franjas de fondo sobrantes.
      expect(Math.max(...plan.panels.map((p) => p.left + p.width))).toBe(plan.width);
      expect(Math.max(...plan.panels.map((p) => p.top + p.height))).toBe(plan.height);
    });
  }
});

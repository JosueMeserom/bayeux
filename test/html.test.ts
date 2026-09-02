import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { embedHtml, errorHtml } from '../src/html.js';
import { planLayout } from '../src/layout.js';
import { composePanels } from '../src/strip.js';
import { REAL, statusWith } from './fixtures.js';

const BASE = 'https://tirax.example.net';

/** Lee el content de una meta etiqueta del HTML generado. */
function metaOf(html: string, key: string): string | undefined {
  const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`));
  return m?.[1];
}

describe('meta etiquetas del embed', () => {
  const status = statusWith(REAL.makokoto);
  const plan = planLayout(status, 'auto');
  const html = embedHtml(status, plan, BASE);

  it('og:url apunta a x.com, no al servicio', () => {
    expect(metaOf(html, 'og:url')).toBe('https://x.com/autor/status/1234567890123456789');
    expect(metaOf(html, 'og:url')).not.toContain('tirax.example.net');
  });

  it('og:image sale por el host de la petición', () => {
    expect(metaOf(html, 'og:image')).toBe(`${BASE}/strip/1234567890123456789.jpg?layout=row`);
  });

  it('el og:image fija el layout ya resuelto', () => {
    const forced = embedHtml(status, planLayout(status, 'grid'), BASE);
    expect(metaOf(forced, 'og:image')).toContain('layout=grid');
  });

  it('twitter:card es summary_large_image', () => {
    expect(metaOf(html, 'twitter:card')).toBe('summary_large_image');
  });

  it('el título lleva nombre y @handle', () => {
    expect(metaOf(html, 'og:title')).toBe('Autora Ejemplo (@autor)');
  });

  it('incluye refresh y enlace visible al post original', () => {
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('<a href="https://x.com/autor/status/1234567890123456789">');
  });

  it('escapa el texto del post en vez de inyectarlo', () => {
    const evil = { ...status, text: '<script>alert(1)</script>' };
    const out = embedHtml(evil, plan, BASE);
    expect(out).not.toContain('<script>');
    expect(metaOf(out, 'og:description')).toContain('&#60;script&#62;');
  });

  it('con una sola foto enlaza pbs.twimg.com directamente', () => {
    const one = statusWith([[800, 600]]);
    const out = embedHtml(one, planLayout(one, 'auto'), BASE);
    expect(metaOf(out, 'og:image')).toContain('pbs.twimg.com');
    expect(metaOf(out, 'og:image:width')).toBe('800');
    expect(metaOf(out, 'og:image:height')).toBe('600');
  });

  it('un post sin fotos no declara og:image', () => {
    const none = statusWith([]);
    const out = embedHtml(none, planLayout(none, 'auto'), BASE);
    expect(metaOf(out, 'og:image')).toBeUndefined();
    expect(metaOf(out, 'twitter:card')).toBe('summary');
  });
});

describe('las dimensiones declaradas coinciden con la imagen real', () => {
  for (const mode of ['row', 'grid'] as const) {
    it(`en modo ${mode}`, async () => {
      const dims: [number, number][] = [[410, 1206], [409, 1206], [407, 1206], [406, 1206]];
      const status = statusWith(dims);
      const plan = planLayout(status, mode);
      const html = embedHtml(status, plan, BASE);

      const buffers = await Promise.all(
        dims.map(([w, h]) =>
          sharp({ create: { width: w, height: h, channels: 3, background: '#888' } }).jpeg().toBuffer(),
        ),
      );
      if (plan.kind === 'none' || plan.kind === 'passthrough') throw new Error('esperaba composición');
      const meta = await sharp(await composePanels(plan, buffers)).metadata();

      expect(Number(metaOf(html, 'og:image:width'))).toBe(meta.width);
      expect(Number(metaOf(html, 'og:image:height'))).toBe(meta.height);
    });
  }
});

describe('embed de error', () => {
  const html = errorHtml('https://x.com/autor/status/999', 'El post no existe.');

  it('conserva el enlace original intacto', () => {
    expect(metaOf(html, 'og:url')).toBe('https://x.com/autor/status/999');
    expect(html).toContain('<a href="https://x.com/autor/status/999">');
  });
  it('explica el motivo en la descripción', () => {
    expect(metaOf(html, 'og:description')).toBe('El post no existe.');
  });
});

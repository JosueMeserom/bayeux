import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { authorLine, compact, embedHtml, errorHtml, oembedJson, statsLine } from '../src/html.js';
import { mastodonStatus } from '../src/mastodon.js';
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
    expect(metaOf(html, 'og:image')).toBe(`${BASE}/strip/1234567890123456789.webp?layout=row`);
  });

  it('el og:image fija el layout ya resuelto', () => {
    const forced = embedHtml(status, planLayout(status, 'grid'), BASE);
    expect(metaOf(forced, 'og:image')).toContain('layout=grid');
  });

  it('twitter:card es summary_large_image', () => {
    expect(metaOf(html, 'twitter:card')).toBe('summary_large_image');
  });

  it('el autor va en el oEmbed, que es la primera línea del embed', () => {
    const o = oembedJson(status);
    expect(o.author_name).toBe('Autora Ejemplo (@autor)');
    expect(o.author_url).toBe('https://x.com/autor/status/1234567890123456789');
  });

  it('og:title es el texto del post y og:description las estadísticas', () => {
    expect(metaOf(html, 'og:title')).toBe('texto del post');
    expect(metaOf(html, 'og:description')).toBe('💬 55   🔁 1.5K   ❤️ 18.1K   👁️ 168.2K');
  });

  it('og:site_name da nombre al pie del embed', () => {
    // Sin esto Discord cae al dominio de la petición, y con nueve subdominios
    // el pie saldría distinto según por cuál se pegue el enlace.
    expect(metaOf(html, 'og:site_name')).toBe('Bayeux');
  });

  it('declara el oEmbed y el avatar del autor', () => {
    expect(html).toContain('type="application/json+oembed"');
    expect(html).toContain('/oembed?id=1234567890123456789');
    expect(html).toContain('rel="apple-touch-icon"');
  });

  it('un post sin texto sigue mostrando autor y estadísticas', () => {
    const mute = { ...status, text: '   ' };
    const out = embedHtml(mute, plan, BASE);
    expect(metaOf(out, 'og:title')).toBe('Autora Ejemplo (@autor)');
    expect(oembedJson(mute).author_name).toBe('Autora Ejemplo (@autor)');
  });

  it('incluye refresh y enlace visible al post original', () => {
    expect(html).toContain('http-equiv="refresh"');
    expect(html).toContain('<a href="https://x.com/autor/status/1234567890123456789">');
  });

  it('escapa el texto del post en vez de inyectarlo', () => {
    const evil = { ...status, text: '<script>alert(1)</script>' };
    const out = embedHtml(evil, plan, BASE);
    expect(out).not.toContain('<script>');
    expect(metaOf(out, 'og:title')).toContain('&#60;script&#62;');
  });

  it('publica la fecha del post para el pie del embed', () => {
    expect(metaOf(html, 'article:published_time')).toBe('2026-08-25T20:20:13.000Z');
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

describe('estadísticas', () => {
  it('abrevia como los contadores de X', () => {
    expect(compact(55)).toBe('55');
    expect(compact(999)).toBe('999');
    expect(compact(1000)).toBe('1K');
    expect(compact(1519)).toBe('1.5K');
    expect(compact(18115)).toBe('18.1K');
    expect(compact(168241)).toBe('168.2K');
    expect(compact(2_400_000)).toBe('2.4M');
  });

  it('omite los contadores que la API no devuelva', () => {
    const parcial = { ...statusWith(REAL.momote), reposts: undefined, views: undefined };
    expect(statsLine(parcial)).toBe('💬 55   ❤️ 18.1K');
  });

  it('omite también los que vengan a cero, como hace FxEmbed', () => {
    // Un post sin respuestas no debe gastar sitio en un «💬 0».
    expect(statsLine({ ...statusWith(REAL.momote), replies: 0 })).toBe('🔁 1.5K   ❤️ 18.1K   👁️ 168.2K');
  });

  it('sin ningún contador, la línea queda vacía en vez de con adornos sueltos', () => {
    const vacio = {
      ...statusWith(REAL.momote),
      replies: undefined,
      reposts: undefined,
      likes: undefined,
      views: undefined,
    };
    expect(statsLine(vacio)).toBe('');
    expect(authorLine(vacio)).toBe('Autora Ejemplo (@autor)');
  });
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

describe('documento estilo Mastodon (el camino de Discord)', () => {
  const status = statusWith(REAL.makokoto);
  const plan = planLayout(status, 'auto');
  const doc = mastodonStatus(status, plan, BASE, `${BASE}/strip/x.webp`);

  it('declara UN solo adjunto: la tira ya cosida, no las fotos sueltas', () => {
    // Es toda la diferencia con FxEmbed: con las fotos sueltas, Discord monta
    // su cuadrícula y se pierde el dibujo continuo.
    const media = doc.media_attachments as { url: string; meta: { original: { width: number } } }[];
    expect(media).toHaveLength(1);
    expect(media[0]!.url).toBe(`${BASE}/strip/x.webp`);
    expect(media[0]!.meta.original.width).toBe(1642);
  });

  it('mete las estadísticas en el cuerpo, en negrita y con &ensp;', () => {
    // Ahí está la negrita y el espaciado compacto: no es la fuente, es el HTML.
    expect(doc.content).toBe('texto del post<br><br><b>💬 55&ensp;🔁 1.5K&ensp;❤️ 18.1K&ensp;👁️ 168.2K</b>');
  });

  it('lleva avatar, autor y fecha, que es lo que OpenGraph no puede dar', () => {
    const account = doc.account as Record<string, unknown>;
    expect(account.display_name).toBe('Autora Ejemplo');
    expect(account.acct).toBe('autor');
    expect(account.avatar).toContain('pbs.twimg.com');
    expect(doc.created_at).toBe('2026-08-25T20:20:13.000Z');
  });

  it('escapa el texto del post también aquí', () => {
    const evil = mastodonStatus({ ...status, text: '<script>x</script>' }, plan, BASE);
    expect(evil.content).not.toContain('<script>');
  });

  it('una sola foto se declara tal cual, sin componer nada', () => {
    const one = statusWith([[800, 600]]);
    const media = mastodonStatus(one, planLayout(one, 'auto'), BASE).media_attachments as {
      url: string;
    }[];
    expect(media[0]!.url).toContain('pbs.twimg.com');
  });
});

describe('a Discord se le retira el og:image', () => {
  const status = statusWith(REAL.makokoto);
  const plan = planLayout(status, 'auto');

  it('para que no monte además el embed plano de OpenGraph', () => {
    const html = embedHtml(status, plan, BASE, true);
    expect(html).toContain('type="application/activity+json"');
    expect(metaOf(html, 'og:image')).toBeUndefined();
  });

  it('el resto de clientes siguen recibiendo el og:image de siempre', () => {
    const html = embedHtml(status, plan, BASE, false);
    expect(html).not.toContain('activity+json');
    expect(metaOf(html, 'og:image')).toContain('/strip/');
  });
});

import { config } from './config.js';
import type { FxStatus } from './fx.js';
import type { Plan } from './layout.js';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const truncate = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

const meta = (pairs: [string, string | number | undefined][]) =>
  pairs
    .filter((p): p is [string, string | number] => p[1] !== undefined && p[1] !== '')
    .map(([k, v]) => {
      const attr = k.startsWith('og:') || k.startsWith('twitter:') ? 'property' : 'name';
      return `  <meta ${attr}="${k}" content="${escapeHtml(String(v))}">`;
    })
    .join('\n');

/** URL absoluta de la imagen del embed, o undefined si el post no tiene fotos. */
function imageUrl(id: string, plan: Plan, baseUrl: string): string | undefined {
  if (plan.kind === 'none') return undefined;
  // Con una sola foto no se compone nada: se enlaza pbs.twimg.com tal cual.
  if (plan.kind === 'passthrough') return plan.url;
  // El layout ya resuelto va fijado en la URL, para que la imagen servida sea
  // exactamente la que declaran og:image:width/height aunque cambie la heurística.
  return `${baseUrl}/strip/${id}.jpg?layout=${plan.kind}`;
}

function page(head: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

export function embedHtml(status: FxStatus, plan: Plan, baseUrl: string): string {
  const image = imageUrl(status.id, plan, baseUrl);
  const title = `${status.author.name} (@${status.author.screen_name})`;
  const original = status.url;

  const head = [
    `<title>${escapeHtml(title)}</title>`,
    meta([
      ['og:site_name', config.siteName],
      // Apunta al post real: es lo que hace que el embed de Discord sea clicable al original.
      ['og:url', original],
      ['og:type', 'article'],
      ['og:title', title],
      ['og:description', truncate(status.text, 300)],
      ['og:image', image],
      ['og:image:width', plan.kind === 'none' ? undefined : plan.width],
      ['og:image:height', plan.kind === 'none' ? undefined : plan.height],
      // summary_large_image es lo que hace que Discord use imagen grande y no miniatura.
      ['twitter:card', image ? 'summary_large_image' : 'summary'],
      ['twitter:title', title],
      ['twitter:description', truncate(status.text, 300)],
      ['twitter:image', image],
      ['theme-color', config.themeColor],
    ]),
    `<meta http-equiv="refresh" content="0; url=${escapeHtml(original)}">`,
    `<link rel="canonical" href="${escapeHtml(original)}">`,
  ].join('\n');

  return page(head, `<p><a href="${escapeHtml(original)}">${escapeHtml(original)}</a></p>`);
}

/**
 * Embed de error. Nunca un 500 desnudo: en Discord eso se ve como enlace roto
 * sin explicación, y el enlace al post original se pierde.
 */
export function errorHtml(originalUrl: string, reason: string): string {
  const head = [
    `<title>${escapeHtml(config.siteName)}</title>`,
    meta([
      ['og:site_name', config.siteName],
      ['og:url', originalUrl],
      ['og:title', `${config.siteName}: no se pudo cargar el post`],
      ['og:description', reason],
      ['twitter:card', 'summary'],
      ['theme-color', config.themeColor],
    ]),
    `<meta http-equiv="refresh" content="0; url=${escapeHtml(originalUrl)}">`,
  ].join('\n');

  return page(head, `<p>${escapeHtml(reason)}</p>
<p><a href="${escapeHtml(originalUrl)}">${escapeHtml(originalUrl)}</a></p>`);
}

export function landingHtml(baseUrl: string): string {
  const host = baseUrl.replace(/^https?:\/\//, '');
  const head = `<title>${escapeHtml(config.siteName)}</title>
${meta([
  ['description', 'Embeds de X/Twitter con las imágenes cosidas en una tira horizontal.'],
  ['theme-color', config.themeColor],
])}
<style>
  body { max-width: 42rem; margin: 4rem auto; padding: 0 1.25rem; line-height: 1.6;
         font-family: system-ui, sans-serif; color: #1d1f23; background: #fbfaf7; }
  code { background: #ecebe6; padding: .15em .4em; border-radius: .25em; }
  @media (prefers-color-scheme: dark) { body { color: #e8e6e1; background: #17181b; }
    code { background: #2a2c31; } a { color: #8ab4f8; } }
</style>`;

  const body = `<h1>${escapeHtml(config.siteName)}</h1>
<p>Cuando un post de X trae varias imágenes, los embeds las apilan en cuadrícula.
Si el autor partió un dibujo en trozos, eso lo rompe. ${escapeHtml(config.siteName)}
las cose en una sola fila, en orden.</p>
<h2>Cómo se usa</h2>
<p>Cambia <code>x.com</code> por <code>${escapeHtml(host)}</code> en el enlace:</p>
<p><code>https://${escapeHtml(host)}/usuario/status/1234567890</code></p>
<p>Añade <code>?layout=row</code> o <code>?layout=grid</code> para saltarte la detección automática.</p>
<p><a href="${escapeHtml(config.repoUrl)}">Código fuente</a> · No afiliado a X Corp.</p>`;

  return page(head, body);
}

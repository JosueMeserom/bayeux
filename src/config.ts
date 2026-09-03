const str = (k: string, d: string) => process.env[k]?.trim() || d;
const num = (k: string, d: number) => {
  const raw = process.env[k]?.trim();
  if (!raw) return d;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${k} debe ser un número, recibido: ${raw}`);
  return n;
};
const list = (k: string, d: string[]) => {
  const raw = process.env[k]?.trim();
  return raw ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : d;
};

/**
 * Mapa `hostname=layout` separado por comas, p.ej. `tirax.example.net=row`.
 * Deja que un subdominio concreto fuerce un layout sin pasar `?layout=`.
 */
const hostLayouts = (): Record<string, 'row' | 'grid' | 'auto'> => {
  const out: Record<string, 'row' | 'grid' | 'auto'> = {};
  for (const pair of list('HOST_LAYOUTS', [])) {
    const [host, layout] = pair.split('=');
    if (host && (layout === 'row' || layout === 'grid' || layout === 'auto')) out[host] = layout;
  }
  return out;
};

export const config = {
  port: num('PORT', 3000),
  // Sólo localhost: quien expone al exterior es el reverse proxy.
  host: str('HOST', '127.0.0.1'),
  // IP o CIDR del reverse proxy. Nunca `true` a secas: con `true` cualquiera
  // puede falsear X-Forwarded-For y saltarse el rate limit por IP.
  trustProxy: str('TRUST_PROXY', '127.0.0.1'),

  publicBaseUrl: str('PUBLIC_BASE_URL', 'http://localhost:3000').replace(/\/+$/, ''),
  allowedHosts: list('ALLOWED_HOSTS', ['localhost:3000', '127.0.0.1:3000']),
  hostLayouts: hostLayouts(),

  fxApiBase: str('FX_API_BASE', 'https://api.fxtwitter.com').replace(/\/+$/, ''),
  fetchTimeoutMs: num('FETCH_TIMEOUT_MS', 6000),
  userAgent: str('OUTBOUND_USER_AGENT', 'Bayeux/0.1 (+https://github.com/)'),

  maxPhotos: num('MAX_PHOTOS', 4),
  maxHeight: num('MAX_HEIGHT', 1200),
  // Presupuesto total de píxeles del lienzo. 12 MP ≈ 48 MB en RGBA sin comprimir.
  maxPixels: num('MAX_PIXELS', 12_000_000),
  maxDownloadBytes: num('MAX_DOWNLOAD_BYTES', 12 * 1024 * 1024),
  /*
   * `auto` reproduce la separación que enseña X. El hueco es una proporción de
   * la altura (X escala la fila a una altura fija y la deja desbordar con
   * scroll, así que el ancho no entra en la cuenta).
   *
   * X separa siempre 6 píxeles CSS: 4 entre bordes más 1 de borde por lado.
   * Eso es idéntico en escritorio y en móvil. Lo que cambia es a qué tamaño
   * pinta los trozos, y por eso la PROPORCIÓN no es la misma:
   *
   *   layout ancho    (escritorio al 100%)      trozo de 700 CSS  ->  0,857 %
   *   layout estrecho (móvil, o zoom al 300%)   trozo de 464 CSS  ->  1,292 %
   *
   * Se calibra sobre el estrecho, que es donde encajan los cortes: coincide
   * con lo medido sobre la propia imagen (15 a 25 px de origen) y con cómo se
   * ve. Los valores son los píxeles físicos de una captura a DPR 3, sin
   * convertir: sólo se usa el cociente, así que las unidades se cancelan.
   */
  gap: str('GAP', 'auto') === 'auto' ? ('auto' as const) : num('GAP', 6),
  xDisplayHeight: num('X_DISPLAY_HEIGHT', 1393),
  xDisplayGap: num('X_DISPLAY_GAP', 18),
  // `transparent` deja el hueco del color del chat, como se ve en otros embeds.
  // Cualquier color de CSS lo pinta fijo.
  bgColor: str('BG_COLOR', 'transparent'),
  jpegQuality: num('JPEG_QUALITY', 88),
  webpQuality: num('WEBP_QUALITY', 82),
  // Dispersión relativa de alturas tolerada para considerar una fila: (max-min)/max.
  rowHeightTolerance: num('ROW_HEIGHT_TOLERANCE', 0.02),
  // Igual pero sobre el aspecto (w/h). Por defecto desactivada (Infinity):
  // la altura es la señal buena, el aspecto varía en cortes legítimos.
  rowAspectTolerance: num('ROW_ASPECT_TOLERANCE', Infinity),

  cacheDir: str('CACHE_DIR', './cache'),
  cacheMaxBytes: num('CACHE_MAX_BYTES', 512 * 1024 * 1024),
  cacheMaxAgeDays: num('CACHE_MAX_AGE_DAYS', 30),

  rateLimitMax: num('RATE_LIMIT_MAX', 60),
  rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),

  siteName: str('SITE_NAME', 'Bayeux'),
  // Fichero local con el logo. Se sirve en /icon.png y es el icono que Discord
  // pinta en el pie del embed. Si no existe, no se declara y no pasa nada.
  brandIcon: str('BRAND_ICON', 'assets/icon.png'),
  themeColor: str('THEME_COLOR', '#1d1f23'),
  repoUrl: str('REPO_URL', ''),
  logLevel: str('LOG_LEVEL', 'info'),
};

export type Config = typeof config;

/** Cambiar esto invalida toda la caché en disco sin tener que borrarla a mano. */
export const ALGO_VERSION = 'v2';

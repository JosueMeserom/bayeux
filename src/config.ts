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
  gap: num('GAP', 6),
  bgColor: str('BG_COLOR', '#000000'),
  jpegQuality: num('JPEG_QUALITY', 88),
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
  themeColor: str('THEME_COLOR', '#1d1f23'),
  repoUrl: str('REPO_URL', 'https://github.com/'),
  logLevel: str('LOG_LEVEL', 'info'),
};

export type Config = typeof config;

/** Cambiar esto invalida toda la caché en disco sin tener que borrarla a mano. */
export const ALGO_VERSION = 'v1';

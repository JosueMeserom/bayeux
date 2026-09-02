import { describe, expect, it } from 'vitest';
import { baseUrlFor, hostLayout, isCrawler } from '../src/http.js';
import { build } from '../src/server.js';

describe('detección de crawlers', () => {
  const bots = [
    'Discordbot/2.0; +https://discordapp.com',
    'TelegramBot (like TwitterBot)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Twitterbot/1.0',
    'WhatsApp/2.23.20.0 A',
    'facebookexternalhit/1.1',
    'Mastodon/4.2.1 (http.rb/5.1.1)',
    'Synapse (bot; +https://matrix.org)',
    'Mozilla/5.0 (compatible; SomeNewPreviewBot/1.0)',
  ];
  for (const ua of bots) it(`bot: ${ua.slice(0, 28)}`, () => expect(isCrawler(ua)).toBe(true));

  const humans = [
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];
  for (const ua of humans) it(`humano: ${ua.slice(0, 28)}`, () => expect(isCrawler(ua)).toBe(false));

  it('sin User-Agent sirve el embed en vez de redirigir a ciegas', () => {
    expect(isCrawler(undefined)).toBe(true);
  });
});

describe('derivación de la URL base', () => {
  it('refleja un X-Forwarded-Host de la lista blanca', () => {
    const url = baseUrlFor({ 'x-forwarded-host': 'tirax.example.net', 'x-forwarded-proto': 'https' });
    expect(url).toBe('https://tirax.example.net');
  });

  it('un host que no está en la lista cae al PUBLIC_BASE_URL', () => {
    const url = baseUrlFor({ 'x-forwarded-host': 'atacante.example.com', 'x-forwarded-proto': 'https' });
    expect(url).toBe('https://bayeux.example.net');
  });

  it('un Host manipulado no se cuela en la salida', () => {
    const url = baseUrlFor({ host: 'evil.com/"><script>alert(1)</script>' });
    expect(url).toBe('https://bayeux.example.net');
    expect(url).not.toContain('script');
  });

  it('toma el primer valor de un X-Forwarded-Host encadenado', () => {
    const url = baseUrlFor({ 'x-forwarded-host': 'tirax.example.net, interno.local', 'x-forwarded-proto': 'https' });
    expect(url).toBe('https://tirax.example.net');
  });

  it('usa el Host normal cuando no hay proxy delante', () => {
    expect(baseUrlFor({ host: 'localhost:3000' })).toBe('http://localhost:3000');
  });

  it('no promociona a https sin X-Forwarded-Proto', () => {
    expect(baseUrlFor({ 'x-forwarded-host': 'tirax.example.net' })).toBe('http://tirax.example.net');
  });
});

describe('layout por defecto según el host', () => {
  it('un host mapeado impone su layout', () => {
    expect(hostLayout({ 'x-forwarded-host': 'tirax.example.net' })).toBe('row');
    expect(hostLayout({ 'x-forwarded-host': 'panox.example.net' })).toBe('grid');
  });
  it('un host sin mapear no impone nada', () => {
    expect(hostLayout({ 'x-forwarded-host': 'bayeux.example.net' })).toBeUndefined();
  });
});

const app = await build();

describe('rutas que no tocan la red', () => {
  const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';

  it('un navegador se va al post original con un 302', async () => {
    const res = await app.inject({ url: '/autor/status/1234567890', headers: { 'user-agent': CHROME } });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://x.com/autor/status/1234567890');
  });

  it('conserva el sufijo /photo/1 al redirigir', async () => {
    const res = await app.inject({ url: '/autor/status/1234567890/photo/1', headers: { 'user-agent': CHROME } });
    expect(res.headers.location).toBe('https://x.com/autor/status/1234567890/photo/1');
  });

  it('rechaza un id que no es numérico', async () => {
    const res = await app.inject({ url: '/autor/status/nope', headers: { 'user-agent': CHROME } });
    expect(res.statusCode).toBe(404);
  });

  it('rechaza un handle que no es un handle', async () => {
    const res = await app.inject({ url: '/no%20valido/status/123', headers: { 'user-agent': CHROME } });
    expect(res.statusCode).toBe(404);
  });

  it('/health responde sin dependencias externas', async () => {
    const res = await app.inject({ url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('la landing usa el host permitido por el que entró la petición', async () => {
    const res = await app.inject({ url: '/', headers: { 'x-forwarded-host': 'tirax.example.net' } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('tirax.example.net');
  });

  it('el rate limit está realmente enganchado a las rutas', async () => {
    // Regresión: con `register` sin await, las rutas quedaban fuera del hook
    // y el límite por IP no se aplicaba a nada.
    const res = await app.inject({ url: '/', headers: { 'x-forwarded-for': '203.0.113.9' } });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
  });

  it('/health queda exento del rate limit', async () => {
    const res = await app.inject({ url: '/health' });
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

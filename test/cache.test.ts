import { mkdir, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
import { cacheKey, pruneCache } from '../src/strip.js';

const dir = config.cacheDir;

/** Crea un fichero de caché de `size` bytes con una antigüedad dada. */
async function fichero(nombre: string, size: number, hace = 0) {
  const path = join(dir, nombre);
  await writeFile(path, Buffer.alloc(size, 1));
  if (hace) {
    const t = new Date(Date.now() - hace);
    await utimes(path, t, t);
  }
}

const totalEnDisco = async () => {
  let total = 0;
  for (const n of await readdir(dir)) total += (await stat(join(dir, n))).size;
  return total;
};

describe('poda de la caché', () => {
  beforeEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  });

  it('la clave separa layout, formato y hueco', () => {
    // Cada una de esas dimensiones multiplica el número de ficheros posibles
    // por post, que es justo el motivo de que el tope tenga que vigilarse.
    expect(cacheKey('123', 'row', 'webp', 9, 92)).toBe('123-row-g9-q92-v2.webp');
    expect(cacheKey('123', 'row', 'webp', 24, 92)).toBe('123-row-g24-q92-v2.webp');
    expect(cacheKey('123', 'grid', 'jpeg', 9, 88)).toBe('123-grid-g9-q88-v2.jpg');
  });

  it('deja el total por debajo del tope, borrando lo más viejo primero', async () => {
    // 10 KB en la carpeta con un tope de 5000 bytes.
    for (let i = 0; i < 10; i++) {
      await fichero(`p${i}-row-g9-q92-v2.webp`, 1000, (10 - i) * 60_000);
    }
    expect(await totalEnDisco()).toBe(10_000);

    const { removed, total } = await pruneCache();

    expect(total).toBeLessThanOrEqual(config.cacheMaxBytes);
    expect(await totalEnDisco()).toBe(total);
    expect(removed).toBeGreaterThan(0);

    // Sobreviven los más nuevos, o sea los de índice alto.
    const quedan = (await readdir(dir)).sort();
    expect(quedan).toContain('p9-row-g9-q92-v2.webp');
    expect(quedan).not.toContain('p0-row-g9-q92-v2.webp');
  });

  it('no borra nada si cabe todo', async () => {
    await fichero('a-row-g9-q92-v2.webp', 1000);
    await fichero('b-row-g9-q92-v2.webp', 1000);
    const { removed, total } = await pruneCache();
    expect(removed).toBe(0);
    expect(total).toBe(2000);
  });

  it('informa del total, que es lo que permite vigilar el tope al escribir', async () => {
    await fichero('x-row-g9-q92-v2.webp', 1234);
    expect((await pruneCache()).total).toBe(1234);
  });
});

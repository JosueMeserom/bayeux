import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';

/**
 * Logo del proyecto, si está puesto. Es el icono que Discord pinta en el pie
 * del embed. Se comprueba una vez al arrancar: si el fichero no está, no se
 * declara el favicon y el pie sale sin icono, que es mejor que uno roto.
 */
export const brandIconPath = resolve(config.brandIcon);

let present: boolean | undefined;
export function hasBrandIcon(): boolean {
  present ??= config.brandIcon !== '' && existsSync(brandIconPath);
  return present;
}

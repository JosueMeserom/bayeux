/**
 * pm2 start ecosystem.config.cjs
 *
 * Un solo proceso en modo fork: sharp ya paraleliza internamente con libvips,
 * y la caché en disco no se coordina entre instancias. Escalar a cluster
 * duplicaría composiciones sin ganar nada.
 */
module.exports = {
  apps: [
    {
      name: 'bayeux',
      script: 'dist/main.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,

      // Carga el .env con el soporte nativo de Node (>=20.6). `env_file` de pm2
      // no lo aplica en todas las versiones, y falla en silencio: el proceso
      // arranca con los valores por defecto y parece que todo va bien.
      // `-if-exists` para que el repo siga arrancando sin .env.
      node_args: '--env-file-if-exists=.env',

      // glibc reparte la memoria en una «arena» por hilo y libvips usa muchos,
      // así que sin esto la memoria se fragmenta y no vuelve al sistema. Medido
      // cosiendo 18 tiras grandes: 1.000 MB sin el ajuste, 400 MB con él, y un
      // 15 % más rápido. Es un problema conocido de sharp.
      // Ojo: pm2 solo aplica `env` al crear la app (pm2 delete + pm2 start).
      env: { MALLOC_ARENA_MAX: '2' },

      // Con el ajuste de arriba el proceso se asienta en unos 400 MB bajo carga
      // y el pico medido llega a 520. 640M deja margen sin dejar de atajar fugas.
      // Si subes MAX_PIXELS, sube esto en proporción.
      max_memory_restart: '640M',

      out_file: 'logs/bayeux.out.log',
      error_file: 'logs/bayeux.err.log',
      merge_logs: true,
      time: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      kill_timeout: 5000,
    },
  ],
};

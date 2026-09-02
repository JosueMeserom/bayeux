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
      script: 'dist/server.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,

      // Carga el .env del directorio del proyecto.
      env_file: '.env',

      // Con MAX_PIXELS a 12 MP el pico de una composición ronda los 50 MB de
      // buffers, más libvips y el runtime. 512M deja margen y ataja fugas.
      // Si subes MAX_PIXELS, sube esto en proporción.
      max_memory_restart: '512M',

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

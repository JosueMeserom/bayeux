import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // El módulo de config lee el entorno al importarse, así que se fija aquí,
    // antes de que se cargue cualquier test. Sin red en ninguno.
    env: {
      PUBLIC_BASE_URL: 'https://bayeux.example.net',
      ALLOWED_HOSTS: 'bayeux.example.net,tirax.example.net,localhost:3000',
      HOST_LAYOUTS: 'tirax.example.net=row,panox.example.net=grid',
      CACHE_DIR: './.cache-test',
      // Topes minúsculos para poder probar la poda con ficheros de juguete.
      CACHE_MAX_BYTES: '5000',
      CACHE_MAX_AGE_DAYS: '3650',
      SITE_NAME: 'Bayeux',
      LOG_LEVEL: 'silent',
    },
  },
});

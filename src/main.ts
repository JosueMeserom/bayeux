// Punto de entrada, y nada más.
//
// Estuvo dentro de server.ts detrás de un `if (process.argv[1] === …)`, y bajo
// pm2 ese guard nunca se cumplía: argv[1] es el wrapper de pm2, no el script.
// El proceso quedaba vivo por el canal IPC, en «online», sin escuchar y sin un
// solo log. Un fichero que solo llama a start() no puede tener ese fallo.
import { start } from './server.js';

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

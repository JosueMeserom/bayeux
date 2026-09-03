// ==UserScript==
// @name         Bayeux: copiar enlace de la tira
// @namespace    https://github.com/JosueMeserom/bayeux
// @version      1.0.0
// @description  Añade un botón a cada post de X para copiar su enlace de Bayeux
// @author       JosueMeserom
// @match        https://x.com/*
// @match        https://twitter.com/*
// @icon         https://bayeux.ultrak.dynu.net/icon.png
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ─── Lo único que hay que tocar ────────────────────────────────────────── */

  // El host por el que quieres los enlaces. Cambia esto si usas otro subdominio.
  const HOST = 'bayeux.ultrak.dynu.net';

  // Parámetros fijos que quieras añadir siempre, por ejemplo '?layout=row'.
  // Déjalo vacío para el comportamiento automático.
  const PARAMS = '';

  /* ─── A partir de aquí, poco que tocar ──────────────────────────────────── */

  const MARCA = 'data-bayeux';
  const RUTA = /^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,25})/;

  /*
   * X reescribe el DOM constantemente y sus clases están ofuscadas, así que el
   * script se apoya sólo en dos cosas que llevan años estables: el `article`
   * de cada post y los `data-testid` de los botones. Si algún día deja de
   * funcionar, lo más probable es que hayan cambiado uno de esos dos.
   */

  const css = document.createElement('style');
  css.textContent = `
    .bayeux-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 34.75px; height: 34.75px; margin: -6px 0;
      border: 0; padding: 0; background: none; cursor: pointer;
      color: inherit; opacity: .6; border-radius: 9999px;
      transition: opacity .12s, background-color .12s, color .12s;
    }
    .bayeux-btn:hover { opacity: 1; background-color: rgba(43,146,240,.1); color: #2b92f0; }
    .bayeux-btn.ok { opacity: 1; color: #00c2a8; background-color: rgba(0,194,168,.12); }
    .bayeux-btn.mal { opacity: 1; color: #eb459e; background-color: rgba(235,69,158,.12); }
    .bayeux-btn svg { width: 18.75px; height: 18.75px; fill: currentColor; }
  `;
  document.head.appendChild(css);

  // Tres paneles con su separación: el logo, reducido a lo que se lee a 19px.
  const ICONO_TIRA =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<rect x="2.2" y="3.2" width="5.8" height="17.6" rx="1.2"/>' +
    '<rect x="9.1" y="3.2" width="5.8" height="17.6" rx="1.2"/>' +
    '<rect x="16" y="3.2" width="5.8" height="17.6" rx="1.2"/></svg>';

  const ICONO_OK =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M9.6 17.4 4.2 12l1.4-1.4 4 4 8.8-8.8L19.8 7z"/></svg>';

  /** Handle e id del post al que pertenece un `article`. */
  function datosDe(article) {
    // El permalink de un post es el enlace que envuelve su marca de tiempo.
    const enlace = article.querySelector('a[href*="/status/"] time')?.closest('a');
    if (enlace) {
      // `href` de un <a> ya viene absoluto, así que no hace falta base. Pasarle
      // una fue un error: en contextos donde `location.origin` es "null" (un
      // fichero abierto en local, por ejemplo) el constructor lanza.
      try {
        const m = RUTA.exec(new URL(enlace.href).pathname);
        if (m) return { handle: m[1], id: m[2] };
      } catch {
        /* href raro: se sigue con el respaldo de abajo */
      }
    }
    // El post principal de una página de detalle no lleva ese enlace, porque
    // es la página en la que ya estás.
    const m = RUTA.exec(location.pathname);
    return m ? { handle: m[1], id: m[2] } : null;
  }

  /** La barra de acciones es el grupo que contiene el botón de responder. */
  function barraDe(article) {
    for (const g of article.querySelectorAll('div[role="group"]')) {
      if (g.querySelector('[data-testid="reply"]')) return g;
    }
    return null;
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Sin permiso de portapapeles (o sin foco), se copia a la vieja usanza.
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  function crearBoton(handle, id) {
    const url = `https://${HOST}/${handle}/status/${id}${PARAMS}`;

    const b = document.createElement('button');
    b.className = 'bayeux-btn';
    b.type = 'button';
    b.title = `Copiar enlace de Bayeux\n${url}`;
    b.setAttribute('aria-label', 'Copiar enlace de Bayeux');
    b.innerHTML = ICONO_TIRA;

    b.addEventListener('click', async (e) => {
      // Sin esto, el clic abre el post: en la TL el article entero es un enlace.
      e.preventDefault();
      e.stopPropagation();

      const ok = await copiar(url);
      b.innerHTML = ok ? ICONO_OK : ICONO_TIRA;
      b.className = `bayeux-btn ${ok ? 'ok' : 'mal'}`;
      b.title = ok ? 'Copiado' : 'No se pudo copiar';
      setTimeout(() => {
        b.innerHTML = ICONO_TIRA;
        b.className = 'bayeux-btn';
        b.title = `Copiar enlace de Bayeux\n${url}`;
      }, 1400);
    });

    return b;
  }

  function procesar(article) {
    if (article.hasAttribute(MARCA)) return;
    const barra = barraDe(article);
    if (!barra) return; // aún sin pintar del todo; ya volverá el observador

    const datos = datosDe(article);
    article.setAttribute(MARCA, datos ? '1' : '0');
    if (!datos) return;

    barra.appendChild(crearBoton(datos.handle, datos.id));
  }

  function barrer() {
    for (const a of document.querySelectorAll('article:not([' + MARCA + '])')) {
      procesar(a);
    }
  }

  /*
   * X monta y desmonta posts al desplazarse, así que hay que mirar de nuevo
   * cada vez que cambia el DOM. Se agrupa con requestAnimationFrame para no
   * recorrer la página en cada una de las mil mutaciones que produce.
   */
  let pendiente = false;
  new MutationObserver(() => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      barrer();
    });
  }).observe(document.body, { childList: true, subtree: true });

  barrer();
})();

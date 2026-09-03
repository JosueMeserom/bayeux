#!/bin/bash
# Vigilante de Bayeux.
#
# pm2 ya reinicia el proceso si se muere. Lo que no cubre es el caso de que el
# proceso siga vivo y deje de responder, que es el fallo que de verdad se ha
# dado en este proyecto (arrancaba, pm2 decía "online" y no escuchaba en ningún
# puerto). Esto lo comprueba desde fuera, que es la única forma de saberlo.
#
# Uso: scripts/vigilar.sh
# Pensado para un cron cada pocos minutos.
#
# Variables:
#   HEALTH_URL   dónde preguntar          (por defecto http://127.0.0.1:3000/health)
#   PM2_APP      app a reiniciar          (por defecto bayeux)
#   LOG_FILE     dónde anotar             (por defecto ~/bayeux-vigilante.log)
#   WEBHOOK_URL  webhook de Discord       (opcional; si no está, solo se anota)
#   DRY_RUN      a 1, detecta pero no reinicia (para probar el script)

set -uo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
PM2_APP="${PM2_APP:-bayeux}"
LOG_FILE="${LOG_FILE:-$HOME/bayeux-vigilante.log}"
INTENTOS="${INTENTOS:-3}"
ESPERA="${ESPERA:-5}"

anotar() {
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

# El cuerpo de la respuesta va al log, y puede ser cualquier cosa: un PNG entero
# si alguien apunta mal la URL. Se limpia ANTES de que llegue a una variable,
# porque bash avisa (y se come el resto) en cuanto hay un byte nulo de por medio.
limpiar() {
  tr -d '\000-\010\013\014\016-\037' | head -c 120 | tr '\n' ' '
}

avisar() {
  [ -n "${WEBHOOK_URL:-}" ] || return 0
  # El payload va con jq si está, y si no a mano, escapando las comillas.
  local texto="$1"
  curl -s -m 10 -H 'Content-Type: application/json' \
    -d "{\"content\": \"${texto//\"/\\\"}\"}" "$WEBHOOK_URL" >/dev/null || \
    anotar "AVISO: no se pudo enviar el webhook"
}

cuerpo=$(mktemp) || exit 1
trap 'rm -f "$cuerpo"' EXIT

# Varios intentos antes de dar por muerto: un corte de un segundo no es una caída.
for i in $(seq 1 "$INTENTOS"); do
  if err=$(curl -fsS -m 5 -o "$cuerpo" "$HEALTH_URL" 2>&1); then
    if grep -q '"status":"ok"' "$cuerpo" 2>/dev/null; then
      exit 0
    fi
    fallo="respuesta inesperada: $(limpiar < "$cuerpo")"
  else
    fallo="sin respuesta: $(printf '%s' "$err" | limpiar)"
  fi
  [ "$i" -lt "$INTENTOS" ] && sleep "$ESPERA"
done

anotar "CAÍDO tras $INTENTOS intentos ($HEALTH_URL) -> $fallo"

if [ "${DRY_RUN:-0}" = "1" ]; then
  anotar "DRY_RUN: no se reinicia"
  exit 1
fi

if pm2 restart "$PM2_APP" >/dev/null 2>&1; then
  anotar "reiniciado $PM2_APP"
  avisar "⚠️ Bayeux no respondía en $HEALTH_URL. He reiniciado \`$PM2_APP\`."
else
  anotar "ERROR: no se pudo reiniciar $PM2_APP"
  avisar "🔥 Bayeux no responde en $HEALTH_URL y el reinicio de \`$PM2_APP\` ha fallado."
fi
exit 1

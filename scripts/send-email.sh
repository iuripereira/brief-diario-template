#!/usr/bin/env bash
# Envia o brief por e-mail como multipart/alternative (texto = .md, HTML = .html).
# Uso: scripts/send-email.sh AAAA-MM-DD
# MAIL_METHOD: smtp (curl autenticado, padrão p/ template) | sendmail (MTA local) | stdout (teste: imprime o MIME)
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
set -a; [[ -f .env ]] && source ./.env; set +a
export TZ="${BRIEF_TZ:-UTC}" LANG="${LANG:-C.UTF-8}"

TODAY="${1:?uso: send-email.sh AAAA-MM-DD}"
MD="briefs/$TODAY.md"; HTML="briefs/$TODAY.html"
[[ -s "$MD" && -s "$HTML" ]] || { echo "send-email: artefatos de $TODAY não encontrados" >&2; exit 1; }
: "${EMAIL_TO:?send-email: defina EMAIL_TO no .env}"
: "${EMAIL_FROM:?send-email: defina EMAIL_FROM no .env}"

SUBJ="📋 Brief Diário — ${TODAY:8:2}/${TODAY:5:2}/${TODAY:0:4}"
ENC_SUBJ="=?UTF-8?B?$(printf '%s' "$SUBJ" | base64 -w0)?="
BOUNDARY="brief-$TODAY-$$"
FROM_ADDR=$(printf '%s' "$EMAIL_FROM" | sed -n 's/.*<\([^>]*\)>.*/\1/p')
[[ -n "$FROM_ADDR" ]] || FROM_ADDR="$EMAIL_FROM"
HOST=$(hostname -f 2>/dev/null || hostname)

b64() { base64 -w 76 "$1" | sed 's/$/\r/'; }   # CRLF p/ compatibilidade SMTP

build_mime() {
  printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\n' "$EMAIL_FROM" "$EMAIL_TO" "$ENC_SUBJ"
  printf 'Date: %s\r\nMessage-ID: <brief-%s-%s@%s>\r\nMIME-Version: 1.0\r\n' "$(date -R)" "$TODAY" "$$" "$HOST"
  printf 'Content-Type: multipart/alternative; boundary="%s"\r\n\r\n' "$BOUNDARY"
  printf -- '--%s\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' "$BOUNDARY"
  b64 "$MD"
  printf -- '\r\n--%s\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' "$BOUNDARY"
  b64 "$HTML"
  printf -- '\r\n--%s--\r\n' "$BOUNDARY"
}

deliver() {
  case "${MAIL_METHOD:-smtp}" in
    stdout)
      cat ;;
    smtp)
      : "${SMTP_URL:?send-email: defina SMTP_URL no .env}"
      curl -fsS --url "$SMTP_URL" --user "${SMTP_USER}:${SMTP_PASS}" --ssl-reqd \
        --mail-from "$FROM_ADDR" --mail-rcpt "$EMAIL_TO" --upload-file - ;;
    sendmail)
      SENDMAIL_BIN="${SENDMAIL_BIN:-$(command -v sendmail || echo /usr/sbin/sendmail)}"
      "$SENDMAIL_BIN" -t -oi ;;
    *)
      echo "send-email: MAIL_METHOD desconhecido: $MAIL_METHOD" >&2; return 1 ;;
  esac
}

for attempt in 1 2; do
  if build_mime | deliver; then
    echo "send-email: enviado para $EMAIL_TO via ${MAIL_METHOD:-smtp} (tentativa $attempt)"
    exit 0
  fi
  [[ $attempt -eq 1 ]] && sleep "${MAIL_RETRY_SLEEP:-30}"
done
echo "send-email: falha após 2 tentativas" >&2
exit 1

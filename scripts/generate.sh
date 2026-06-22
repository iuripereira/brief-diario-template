#!/usr/bin/env bash
# Gera os 3 artefatos do brief (briefs/DATA.{md,html,chat.md}) via claude -p headless.
# Uso: scripts/generate.sh AAAA-MM-DD   |   scripts/generate.sh --check
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."

if [[ "${1:-}" == "--check" ]]; then exec node scripts/setup/doctor.js; fi

set -a; [[ -f .env ]] && source ./.env; set +a
TZ_CFG=$(python3 scripts/lib/config.py get perfil.timezone || true)
export TZ="${TZ_CFG:-UTC}" LANG="${LANG:-C.UTF-8}"

TODAY="${1:?uso: generate.sh AAAA-MM-DD | --check}"
mkdir -p briefs logs

dow=$(date -d "$TODAY" +%u)
m=$((10#${TODAY:5:2})); d=$((10#${TODAY:8:2})); y=${TODAY:0:4}
DIAS=(_ segunda-feira terça-feira quarta-feira quinta-feira sexta-feira sábado domingo)
MESES=(_ janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro)
DATA_LONGA="${DIAS[$dow]}, $d de ${MESES[$m]} de $y"

PERFIL=$(python3 scripts/lib/config.py render-profile)

PROMPT="$PERFIL

Hoje é $DATA_LONGA (data ISO: $TODAY, timezone $TZ).
Execute o WORKFLOW.md deste repositório do início ao fim usando o PERFIL E
PREFERÊNCIAS acima e grave os TRÊS artefatos:
- briefs/$TODAY.md         (brief completo, parte texto do e-mail)
- briefs/$TODAY.html       (brief completo em HTML, e-mail)
- briefs/$TODAY.chat.md    (versão enxuta para o chat: só Agenda, Tarefas e Síntese)
conforme a seção '9. Artefatos de saída' do WORKFLOW.md.
Não imprima o conteúdo do brief; termine com exatamente:
BRIEF_OK briefs/$TODAY.md briefs/$TODAY.html briefs/$TODAY.chat.md"

OUT="logs/claude-$TODAY.json"
MCP_ARG=(); [[ -f mcp-servers.json ]] && MCP_ARG=(--mcp-config mcp-servers.json)
# Ativa as guardas de "geração ≠ entrega" (.claude/hooks/, ligadas em
# .claude/settings.json): durante o headless o Claude não pode usar Bash de
# rede/entrega nem gravar fora de briefs/, e o Stop valida o trio de artefatos.
# Fora daqui (sessão interativa) os hooks são no-op.
export BRIEF_GENERATION=1
# shellcheck disable=SC2086  # CLAUDE_EXTRA_ARGS precisa de word splitting
"${CLAUDE_BIN:-claude}" -p "$PROMPT" \
  --model "${CLAUDE_MODEL:-sonnet}" \
  --fallback-model "${CLAUDE_FALLBACK_MODEL:-claude-haiku-4-5}" \
  --max-turns "${CLAUDE_MAX_TURNS:-50}" \
  --output-format json \
  --no-session-persistence \
  --setting-sources project \
  --permission-mode acceptEdits \
  "${MCP_ARG[@]}" \
  ${CLAUDE_EXTRA_ARGS:-} \
  > "$OUT"

jq -e '.is_error == false' "$OUT" >/dev/null \
  || { echo "generate: claude retornou is_error=true (ver $OUT)"; exit 1; }
jq -r '"generate: turns=\(.num_turns) custo_usd=\(.total_cost_usd // "n/a") duracao_s=\((.duration_ms // 0)/1000|floor)"' "$OUT"
jq -e '.result | strings | test("BRIEF_OK")' "$OUT" >/dev/null \
  || { echo "generate: marcador BRIEF_OK ausente (ver $OUT)"; exit 1; }

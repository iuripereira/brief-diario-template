# Design — setup/validação cross-platform + docs para menos técnicos

Data: 2026-06-22

## Problema

Feedback: o template "funciona, mas é muito complexo de configurar e só roda em Linux".
Duas frentes: (1) a configuração/validação local só roda em bash; (2) a documentação
não lidera com o wizard `npm run setup` nem orienta usuários menos técnicos / Windows.

## Fronteira

- **Produção continua Linux** e inalterada: GitHub Actions (`brief.yml`) e Cloudflare
  Worker (`scheduler/`). O CI chama `generate.sh` direto — **não** usa o doctor.
- **Geração e envio locais** (`generate.sh`, `send-email.sh`, `send-chat.sh`) continuam
  bash (espelham o CI). No Windows exigem WSL ou Git Bash — documentado, não reescrito.
- O que vira cross-platform é **configurar + validar**: `npm run setup` e `npm run doctor`.

## Decisões fechadas

- Escopo: **setup + validação nativos** (Opção A).
- O doctor em Node **substitui** o `scripts/doctor.sh` (não coexiste). `doctor.js` roda em
  Linux/macOS/Windows (Node + dep `yaml`; sem bash/python/jq).
- **WORKFLOW.md fica inalterado** (é a spec do prompt; não toca em setup nem SO).

## Parte 1 — Código

### `scripts/setup/doctor.js` (novo, substitui `doctor.sh`)

Função pura de validação + um runner CLI. Replica as checagens do `doctor.sh`:

- `config.yaml` existe; `perfil.nome` e `perfil.timezone` não-vazios; se
  `secoes.noticias` então `noticias.categorias` não-vazio.
- Segredos para a entrega escolhida, lidos de `.env` **ou** de `process.env` (CI):
  - `entrega.email.enabled` → `EMAIL_TO`/`EMAIL_FROM`; se `MAIL_METHOD=smtp` (default)
    então `SMTP_URL`/`SMTP_USER`/`SMTP_PASS`; `sendmail`/`stdout` dispensam SMTP_*.
  - `entrega.chat.tipo`: `slack`→`SLACK_WEBHOOK_URL`; `discord`→`DISCORD_WEBHOOK_URL`;
    `telegram`→`TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID`; `none`→ok.
- Wiring MCP: se algum `conectores.*.mcp` não-vazio, exige `mcp-servers.json` válido
  (`JSON.parse`, sem `jq`).
- Resumo de perfil **leve em Node** (nome, timezone, seções ativas). O `render-profile`
  completo permanece em `config.py` (usado só na geração) — fora do escopo do doctor.

Estrutura para testabilidade:
- `parseEnvFile(text): object` — parser `KEY=VALUE` simples (ignora comentários/linhas
  vazias; remove aspas externas).
- `runChecks({config, env}): { checks: [{ok, label}], fail: bool }` — **pura**, recebe o
  objeto de config (já parseado) e o objeto de env; não toca disco. É o que os testes
  exercitam.
- `main()` — lê `config.yaml` (via `yaml`), `.env` (via `parseEnvFile`, mesclado com
  `process.env`), `mcp-servers.json`; chama `runChecks`; imprime ✓/✗; `process.exit(fail?1:0)`.

### Integração

- **`index.js`** (wizard): trocar `spawnSync("bash", ["scripts/doctor.sh"])` por chamada
  in-process — `import { main as runDoctor } from "./doctor.js"` e chamar após escrever os
  arquivos. O wizard passa a rodar 100% nativo em qualquer SO.
- **`package.json`**: novo script `"doctor": "node scripts/setup/doctor.js"`.
- **`scripts/generate.sh`** linha 7: `exec scripts/doctor.sh` → `exec node scripts/setup/doctor.js`.
- **Remover `scripts/doctor.sh`.**

### Testes

`scripts/setup/doctor.test.js` (node:test), exercitando `runChecks` (puro) com fixtures:
- e-mail `smtp` sem `SMTP_PASS` → fail; `MAIL_METHOD=stdout` sem SMTP_* → ok.
- `chat=slack` sem `SLACK_WEBHOOK_URL` → fail; `telegram` sem `CHAT_ID` → fail.
- conector MCP ligado sem `mcp-servers.json` → fail.
- caminho feliz completo → ok.
- `parseEnvFile`: comenta/ignora linhas, remove aspas, lê `KEY=VALUE`.

`npm test` continua escopado a `scripts/setup/*.test.js`.

## Parte 2 — Documentação

### README.md

- **Pré-requisitos** em 3 camadas explícitas:
  1. **Configurar + validar (qualquer SO):** só **Node ≥ 20**.
  2. **Gerar + enviar localmente:** `bash`, `jq`, `curl`, `python3 + PyYAML`, `claude` CLI
     — Linux/macOS nativo; **Windows via WSL ou Git Bash**.
  3. **Produção:** conta GitHub (Actions) + Cloudflare (agendador) — Linux gerenciado.
- **Passo a passo** lidera com o caminho do wizard:
  `npm install && npm run setup` → preencher segredos no `.env` → `npm run doctor`. O fluxo
  manual (`cp config.example.yaml …`) vira alternativa recolhida. Geração/envio locais
  marcados como "Linux/macOS/WSL".
- Nota de Windows curta e explícita (setup nativo; geração/envio via WSL/Git Bash).

### CONFIG.md
- Topo: o wizard (`npm run setup`) gera este arquivo; valide com `npm run doctor`
  (cross-platform). Substituir a menção a `scripts/doctor.sh`.

### CONNECTORS.md
- Nota: o wizard já cria no `.env` as chaves certas (vazias) conforme conectores/entrega.
- Trocar "Rode `scripts/doctor.sh`" por "Rode `npm run doctor`".

### SETUP.md
- "Validar localmente": `npm run doctor` (cross-platform) no lugar de `scripts/doctor.sh`.
- Deixar claro que os passos de auth de MCP (tar/base64/`npx … auth`) são Linux/macOS/WSL.

### scheduler/README.md
- Nota curta: o deploy é `npx wrangler` (Node) — cross-platform (Win/mac/Linux).

### CHANGELOG.md
- Entrada nova descrevendo: wizard `npm run setup`, doctor portado para Node
  (`npm run doctor`, substitui `doctor.sh`), docs cross-platform.

### WORKFLOW.md
- Sem alterações.

## Não-objetivos

- Não portar `generate.sh`/`send-*.sh` para Node (espelham o CI; Windows usa WSL/Git Bash).
- Não alterar o workflow do GitHub Actions nem o Cloudflare Worker.
- Não editar os specs/plans históricos em `docs/superpowers/` da task anterior.

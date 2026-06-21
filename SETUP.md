# SETUP.md — colocar o brief em produção (GitHub Actions + agendador)

Runbook de implantação. A orquestração (lock, retry, validação, alerta) vive em
[.github/workflows/brief.yml](.github/workflows/brief.yml); o **agendamento** é um
Cloudflare Worker ([scheduler/](scheduler/)), porque o cron nativo do Actions atrasa.

> **Por que autorizar MCPs:** num runner efêmero do Actions os conectores `claude.ai`
> não existem. A forma de popular as seções pessoais (agenda/e-mails/tarefas) é o **modo
> fallback de MCPs** (servidores npm pré-autorizados). As notícias (WebSearch) não
> precisam disso.

## Visão geral

1. Criar as credenciais dos conectores (uma vez).
2. Autorizar os MCPs **na sua máquina** e empacotar os tokens.
3. Cadastrar tudo como **GitHub Secrets**.
4. Validar com um disparo manual.
5. Configurar o agendador (Cloudflare Worker) para rodar nos dias úteis.

---

## 1. Credenciais OAuth do Google (se usar Gmail/Calendar)

1. [console.cloud.google.com](https://console.cloud.google.com) → crie/selecione um projeto.
2. Ative **Gmail API** e **Google Calendar API** (APIs & Services → Library).
3. **OAuth consent screen:** User type **External**; adicione seu e-mail em Test users;
   **Scopes:** só leitura (`gmail.readonly`, `calendar.readonly`).
4. **Credentials → Create → OAuth client ID → Desktop app** → baixe o JSON e renomeie
   para `gcal-credentials.json` (é **segredo**; já está no `.gitignore`).
5. **Publique o app:** OAuth consent screen → **Publishing status: In production**. Sem
   isso, app External em "Testing" **expira o refresh token em 7 dias**. Para uso próprio
   não precisa passar pela verificação do Google — no aviso "app não verificado", clique
   em **Avançado → Acessar**.

## 2. Autorização local dos MCPs (na sua máquina, com browser)

### Todoist (token)
todoist.com → Configurações → Integrações → Token do desenvolvedor → vira `TODOIST_API_TOKEN`.

### Gmail
```bash
mkdir -p ~/.gmail-mcp
cp /caminho/gcal-credentials.json ~/.gmail-mcp/gcp-oauth.keys.json
npx -y @gongrzhe/server-gmail-autoauth-mcp auth
```
Autorize no browser. Gera `~/.gmail-mcp/credentials.json`. Ao final `~/.gmail-mcp/` tem
`gcp-oauth.keys.json` + `credentials.json` — **os dois** vão para o runner.

### Google Calendar
```bash
mkdir -p ~/.config/gcal-mcp
cp /caminho/gcal-credentials.json ~/.config/gcal-mcp/gcp-oauth.keys.json
export GOOGLE_OAUTH_CREDENTIALS=~/.config/gcal-mcp/gcp-oauth.keys.json
export GOOGLE_CALENDAR_MCP_TOKEN_PATH=~/.config/gcal-mcp/tokens.json
npx -y @cocal/google-calendar-mcp auth
```
Gera `~/.config/gcal-mcp/tokens.json`. O diretório (`gcp-oauth.keys.json` + `tokens.json`)
vai para o runner.

### Validar localmente
```bash
cp mcp-servers.example.json mcp-servers.json
sed -i "s#COLOQUE_SEU_TOKEN_TODOIST#SEU_TOKEN#g; s#/home/SEU-USUARIO#$HOME#g" mcp-servers.json
scripts/doctor.sh
scripts/generate.sh $(date +%F)     # confira briefs/ e as seções populadas
```

### Empacotar os tokens (base64)
```bash
tar czf - -C ~ .gmail-mcp | base64 -w0          # → secret GMAIL_MCP_DIR_B64
tar czf - -C ~ .config/gcal-mcp | base64 -w0    # → secret GCAL_MCP_DIR_B64
```

## 3. GitHub Secrets

Repositório → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor | Obrigatório |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` | saída de `claude setup-token` (~1 ano) | sim |
| `CONFIG_YAML` | conteúdo do seu `config.yaml` (o runner não tem o arquivo — é gitignored) | sim |
| `EMAIL_TO` | seu e-mail destino | sim |
| `EMAIL_FROM` | ex.: `Brief Diário <voce@dominio.com>` | sim |
| `SMTP_USER` | conta remetente | sim |
| `SMTP_PASS` | App Password (sem espaços) | sim |
| `TODOIST_API_TOKEN` | token do passo 2 (se usar Todoist) | se usar tarefas |
| `GMAIL_MCP_DIR_B64` | base64 do passo 2 (Gmail) | se usar e-mails |
| `GCAL_MCP_DIR_B64` | base64 do passo 2 (Calendar) | se usar agenda |
| `SLACK_WEBHOOK_URL` / `DISCORD_WEBHOOK_URL` / `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | conforme `entrega.chat.tipo` | opcional |

> Constantes não-sensíveis (`BRIEF_TZ`, `MAIL_METHOD`, `SMTP_URL`, modelos) estão no
> `env:` do workflow — **ajuste `BRIEF_TZ` para o mesmo timezone do seu `config.yaml`** e
> `SMTP_URL` ao seu provedor. App Password do Gmail exige 2FA
> ([myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).

## 4. Ativar e testar

Commit + push. No GitHub: **Actions → brief-diario → Run workflow**. Confira: passo
**Gerar + validar** sem erro; e-mail chega; post no chat; artefato `brief-AAAA-MM-DD`
em Artifacts; seções pessoais **populadas** (não em `⚠️ Fonte indisponível`).

## 5. Agendador (Cloudflare Worker)

Runbook completo em [scheduler/README.md](scheduler/README.md). Resumo:

1. Ajuste `GH_OWNER`/`GH_REPO`/`crons` em [scheduler/wrangler.toml](scheduler/wrangler.toml)
   (cron em **UTC** — converta o seu horário local).
2. Crie um **PAT fine-grained** com **Actions: Read and write** no seu repo.
3. Deploy:
   ```bash
   cd scheduler
   npm install
   npx wrangler login
   npx wrangler secret put GH_DISPATCH_TOKEN
   npx wrangler deploy
   ```
4. Valide com `npx wrangler dev --remote --test-scheduled` (deve logar
   `workflow_dispatch OK`) e confira a aba **Cron events** no painel Cloudflare.

## 6. Operação

- **Falhas:** notificação nativa do Actions por e-mail + alerta `if: failure()` no chat.
- **Credencial MCP expirou (401):** refaça o passo 2 da fonte, gere o tarball e atualize o
  secret. Causa comum: app OAuth voltou a "Testing" — republique "In production".
- **Token Claude expirou:** `claude setup-token` de novo → atualize `CLAUDE_CODE_OAUTH_TOKEN`.
- **Brief não chegou:** veja `npx wrangler tail` em `scheduler/` e o histórico em Actions.
  Se o Worker disparou mas o run não aparece, o PAT pode ter expirado.

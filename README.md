# brief-diario (template)

Template genérico para automatizar um **brief matinal** entregue por e-mail e chat. Todo dia, no horário que você definir, o **Claude Code** (headless) gera um panorama do
seu dia:

-  📅 agenda 
-  📧 e-mails 
-  ✅ tarefas
-  📰 notícias
-  🎯 síntese
-  💼 sugestões de conteúdo para redes sociais (opcional)

**Scripts determinísticos** entregam por e-mail (HTML) e num canal de chat (Slack/Discord/Telegram). Serverless: roda no **GitHub Actions**, disparado por um **Cloudflare Worker**.

Tudo é configurável num único **`config.yaml`**: seu perfil, a lente de relevância, as fontes de notícia, quais seções ligar e quais conectores usar. Sem editar código.

> **Regra geral: geração ≠ entrega:** o Claude **só gera arquivos**; nunca envia e-mail nem posta no chat. Toda entrega é dos scripts, reforçada por permissões e hooks.

## Como funciona (visão geral)

![Arquitetura do brief-diario](docs/arquitetura.svg)

Da esquerda para a direita, de cima para baixo:

1. **Você edita o `config.yaml`** — quem você é, o que é relevante, quais seções e conectores quer. É o único arquivo que você precisa mexer.
2. **O Cloudflare Worker dispara** o pipeline no horário, nos dias úteis.
3. **O GitHub Actions orquestra** (lock, retry, validação, alerta) e roda os scripts.
4. **O `generate.sh` chama o Claude headless**, que lê o seu perfil + o `WORKFLOW.md`, consulta suas **fontes** (calendário, e-mail, tarefas via MCP; notícias na web) e **grava 3 artefatos**: `.md` e `.html` completos + `.chat.md` enxuto.
5. **Os scripts entregam**: `send-email.sh` manda o e-mail; `send-chat.sh` posta no Slack/Discord/Telegram. O Claude nunca entrega.

> Diagrama editável (Excalidraw): [docs/arquitetura.excalidraw](docs/arquitetura.excalidraw) - abra em [excalidraw.com](https://excalidraw.com).

## Pré-requisitos

- **Claude Code** com `claude -p` headless e um `CLAUDE_CODE_OAUTH_TOKEN` (de `claude setup-token`).
- **bash, jq, curl, python3 + PyYAML** (`pip install pyyaml`).
- **Node ≥ 20** (servidores MCP via npm + wrangler).
- **Conta GitHub** (Actions) e **conta Cloudflare** (agendador).
- Credenciais dos conectores que você escolher: SMTP (e-mail), MCP de tarefas/calendário/e-mail, webhook do canal de chat.

## Passo a passo

1. **Copie o template.** Copie a pasta `template/` para o seu próprio repositório (ou use este repo como template no GitHub).

2. **Instale as dependências.**
   ```bash
   pip install pyyaml
   # garanta também: jq, curl, node>=20, claude (CLI)
   ```

3. **Configure suas preferências.**
   ```bash
   cp config.example.yaml config.yaml      # gitignored
   $EDITOR config.yaml                      # nome, cidade, timezone, lente, notícias, seções, conectores
   ```
   Referência campo a campo: [CONFIG.md](CONFIG.md).

4. **Configure os segredos (debug local).**
   ```bash
   cp .env.example .env && chmod 600 .env
   $EDITOR .env                             # token do Claude, SMTP, webhook do chat, etc.
   ```

5. **Configure os conectores MCP** (tarefas/calendário/e-mail), se usar.
   ```bash
   cp mcp-servers.example.json mcp-servers.json
   $EDITOR mcp-servers.json                 # deixe só os que usa; ajuste caminhos/token
   ```
   Autorize cada MCP uma vez localmente — ver [SETUP.md](SETUP.md).

6. **Valide a configuração** (não chama o Claude nem envia nada):
   ```bash
   scripts/doctor.sh        # rode até dar tudo ✓
   ```

7. **Gere um brief localmente:**
   ```bash
   scripts/generate.sh $(date +%F)
   ls briefs/               # AAAA-MM-DD.md, .html, .chat.md
   ```

8. **Teste a entrega:**
   ```bash
   MAIL_METHOD=stdout scripts/send-email.sh $(date +%F) | head -40   # inspeciona o MIME
   scripts/send-email.sh $(date +%F)                                 # envia de verdade
   scripts/send-chat.sh  $(date +%F)                                 # posta no chat
   ```

9. **Coloque em produção** (GitHub Actions + agendador): cadastre os GitHub Secrets, ative o workflow e faça o deploy do Cloudflare Worker — runbook completo em [SETUP.md](SETUP.md).

   > ⚠️ **O workflow vem desabilitado por padrão.** Assim ele não fica falhando antes de você cadastrar os secrets. Depois de configurar tudo, habilite-o em **Actions → brief-diario → Enable workflow** (ou `gh workflow enable brief-diario`).

## Artefatos gerados

| Arquivo               | Conteúdo                               | Uso                   |
| --------------------- | -------------------------------------- | --------------------- |
| `briefs/DATA.md`      | Brief completo (Markdown)              | parte texto do e-mail |
| `briefs/DATA.html`    | Brief completo (HTML standalone)       | corpo do e-mail       |
| `briefs/DATA.chat.md` | Versão enxuta (Agenda/Tarefas/Síntese) | post no chat          |

## Personalizar e estender

- **Conteúdo do brief:** edite [WORKFLOW.md](WORKFLOW.md) (a spec do prompt) — mas a maior parte do dia a dia se ajusta só pelo `config.yaml`.
- **Trocar de provedor de e-mail / chat / MCP, ou adicionar uma fonte nova:** [CONNECTORS.md](CONNECTORS.md).

## Documentação

- **[CONFIG.md](CONFIG.md)** — referência de cada campo do `config.yaml`.
- **[SETUP.md](SETUP.md)** — credenciais, MCPs, GitHub Secrets e agendador.
- **[CONNECTORS.md](CONNECTORS.md)** — conectores suportados e como estender.
- **[WORKFLOW.md](WORKFLOW.md)** — a spec do conteúdo do brief.
- **[scheduler/](scheduler/)** — o Cloudflare Worker que dispara o brief.

Não há build, lint nem testes automatizados além dos testes dos scripts (`scripts/lib/test_config.py`, `scripts/test_send_chat.sh`).

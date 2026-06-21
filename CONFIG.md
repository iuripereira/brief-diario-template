# CONFIG.md — referência do `config.yaml`

O `config.yaml` guarda **preferências** (nunca segredos — esses vão no `.env` /
GitHub Secrets). É lido por `scripts/lib/config.py`, que renderiza o bloco de perfil
injetado no prompt pelo `generate.sh`. O Claude **não lê** o `config.yaml` diretamente.

Copie de `config.example.yaml` e edite. Valide com `scripts/doctor.sh`.

## `perfil`

| Campo | Tipo | Default | Efeito |
| --- | --- | --- | --- |
| `nome` | string | — | Como o brief se refere a você. **Obrigatório.** |
| `cidade` | string | — | Usada na lente e nas notícias locais. |
| `timezone` | string (IANA) | — | Fuso da geração e base do cron. **Obrigatório.** Ex.: `America/Sao_Paulo`. |
| `idioma_saida` | string | `pt-BR` | Idioma do brief gerado (ex.: `en-US`). |
| `bio` | texto | — | 1–3 linhas sobre você; alimenta tom e relevância. |

## `lente_de_relevancia`

Lista de strings. Define o que conta como "relevante" — usada para destacar e-mails,
filtrar notícias e ancorar as sugestões de conteúdo. Ex.: `["carreira", "IA aplicada"]`.

## `noticias`

| Campo | Tipo | Default | Efeito |
| --- | --- | --- | --- |
| `num_itens` | int | `5` | Total de notícias no brief. |
| `categorias` | lista | — | Cada item vira uma busca web. |
| `categorias[].nome` | string | — | Nome da categoria (ex.: "Tecnologia/IA"). |
| `categorias[].fontes` | lista | `[]` | Veículos preferidos que guiam a busca (opcional). |

## `secoes` (liga/desliga)

Booleanos. Uma seção `false` é **pulada** inteiramente no brief.

| Campo | Default | Seção |
| --- | --- | --- |
| `agenda` | `true` | 📅 Agenda (precisa de `conectores.calendario`) |
| `emails` | `true` | 📧 E-mails (precisa de `conectores.email_leitura`) |
| `tarefas` | `true` | ✅ Tarefas (precisa de `conectores.tarefas`) |
| `noticias` | `true` | 📰 Notícias (usa WebSearch) |
| `sintese` | `true` | 🎯 Síntese |
| `conteudo_social` | `false` | 💼 Sugestões de post |

## `conectores` (intenção)

Cada conector é `{ mcp: "<nome>" }`. O **nome** é só um rótulo legível usado no prompt;
o **wiring real** (qual servidor MCP sobe) fica no `mcp-servers.json`. `mcp: ""` desliga
a fonte (equivale a desligar a seção correspondente).

| Campo | Liga a seção | Exemplos de `mcp` |
| --- | --- | --- |
| `calendario.mcp` | Agenda | `google-calendar`, `caldav` |
| `email_leitura.mcp` | E-mails | `gmail` |
| `tarefas.mcp` | Tarefas | `todoist`, `ticktick`, `notion` |

> **Coerência `config.yaml` × `mcp-servers.json`:** ligar um conector aqui **e** ter o
> servidor correspondente no `mcp-servers.json` são duas coisas. Mantenha os dois
> sincronizados — ver [CONNECTORS.md](CONNECTORS.md).

## `entrega`

```yaml
entrega:
  email:
    enabled: true          # liga o envio por e-mail (credenciais SMTP_* no .env)
  chat:
    tipo: "slack"          # slack | discord | telegram | none
```

| Campo | Valores | Segredos exigidos (`.env`) |
| --- | --- | --- |
| `email.enabled` | bool | `SMTP_URL`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_TO` |
| `chat.tipo` | `slack` | `SLACK_WEBHOOK_URL` |
| | `discord` | `DISCORD_WEBHOOK_URL` |
| | `telegram` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| | `none` | — (chat desligado) |

## Helper `config.py`

```bash
python3 scripts/lib/config.py get perfil.timezone     # imprime um escalar
python3 scripts/lib/config.py get lente_de_relevancia  # lista/dict → JSON
python3 scripts/lib/config.py render-profile           # bloco que vai ao prompt
```

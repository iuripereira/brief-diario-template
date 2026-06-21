# scheduler — agendador do brief (Cloudflare Worker)

Dispara o workflow do GitHub Actions (`brief.yml`) por `workflow_dispatch` no
horário, via API. É o disparo **primário**: o evento `schedule` nativo do Actions é
best-effort e atrasa horas em repos de baixa atividade. O `schedule` do workflow fica
como rede de segurança deduplicada (job `guard`).

## Configurar

1. Edite [wrangler.toml](wrangler.toml):
   - `GH_OWNER`/`GH_REPO` → seu usuário e repositório.
   - `crons` → seu horário **convertido para UTC** (ex.: 06:30 UTC-3 = `30 9 * * *`).
2. O filtro de dia útil (seg–sex) é feito em JS em [src/worker.js](src/worker.js)
   (`getUTCDay()`). Se o seu horário cair em outro dia civil que o de UTC, ajuste lá.

## Token de disparo (GitHub PAT fine-grained)

GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained**:
- **Repository access:** *Only select repositories* → o seu repo.
- **Permissions → Repository → Actions: Read and write**.
- **Expiration:** anote a data — ao expirar, o brief para de ser disparado.

## Deploy

```bash
cd scheduler
npm install
npx wrangler login
npx wrangler secret put GH_DISPATCH_TOKEN     # cole o PAT
npx wrangler deploy                            # (re)aplica triggers/observability
```

## Validar

```bash
# Dispara o handler scheduled com o secret REAL (faz um dispatch de verdade).
# O log deve mostrar "workflow_dispatch OK":
npx wrangler dev --remote --test-scheduled
curl "http://localhost:8787/__scheduled"
```

> O `wrangler dev` **local** (sem `--remote`) não enxerga o secret do `secret put`.
> Use `--remote` ou um `scheduler/.dev.vars` gitignorado com `GH_DISPATCH_TOKEN=...`.

## Armadilhas (lições do projeto original)

- **Cron atrelado ≠ cron disparando ≠ disparando com sucesso.** Cheque a aba
  **Cron events** do painel Cloudflare (status por invocação).
- **`1-5` no campo de dia-da-semana do Cloudflare é ambíguo** — use `* * *` (todo dia)
  + guarda `getUTCDay()` em JS.
- **Encerre o setup com `wrangler deploy`** (não `secret put`): só o `deploy` (re)aplica
  `[triggers]`/`[observability]`.
- **Erros do dispatch:** `401` = PAT ausente/errado; `403 "Resource not accessible…"` =
  PAT sem `Actions: write`; `204` = sucesso.
- **Token em DOIS lugares:** secret do Cloudflare (produção) e `.dev.vars` (teste local).
  Sincronize ao rotacionar; nunca commite.

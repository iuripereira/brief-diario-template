# scheduler — agendador do brief (Cloudflare Worker)

Dispara o workflow do GitHub Actions (`brief.yml`) por `workflow_dispatch` no
horário, via API. É o **único** disparo: o evento `schedule` nativo do Actions é
best-effort e atrasa horas em repos de baixa atividade, então não serve nem como
fallback (entregaria o brief matinal à tarde). A recuperação vive aqui no Worker.

## Recuperação: verifica-e-re-dispara (2 ticks/dia)

O Worker roda em **dois ticks pontuais** por dia (ver `crons` no `wrangler.toml`).
Em cada tick, antes de disparar, ele consulta os runs do dia pela API do GitHub:

- Se já há run de **hoje** com `conclusion=success` **ou** `status` em
  `queued`/`in_progress` → **não faz nada** (dedup).
- Caso contrário → `workflow_dispatch`.

Resultado: o 1º tick dispara; o 2º **re-dispara só se o 1º não entregou** (cron do
Cloudflare não foi disparado, ou o run falhou) e é no-op nos dias normais. Isso
substitui o antigo fallback `schedule` + job `guard` do workflow — no horário certo
e sem depender de checkout git (o `guard` quebrava por rodar `gh run list` sem repo).

> Este agendador é Node (`npx wrangler`) — o deploy roda em **Windows, macOS e Linux**.

## Configurar

1. Edite [wrangler.toml](wrangler.toml):
   - `GH_OWNER`/`GH_REPO` → seu usuário e repositório.
   - `crons` → seus **dois** horários **convertidos para UTC** (ex.: 06:30 e 07:00
     UTC-3 = `["30 9 * * *", "0 10 * * *"]`). O 2º é a janela de recuperação; ajuste
     o intervalo à sua folga.
2. O filtro de dia útil (seg–sex) é feito em JS em [src/worker.js](src/worker.js)
   (`getUTCDay()`). Se o seu horário cair em outro dia civil que o de UTC, ajuste lá.

## Token de disparo (GitHub PAT fine-grained)

GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained**:
- **Repository access:** *Only select repositories* → o seu repo.
- **Permissions → Repository → Actions: Read and write** — o **write** dispara o
  workflow; o **read** (incluso no "Read and write") é o que a verificação de dedup
  consulta antes de re-disparar.
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
- **Pós-morte do antigo `guard`:** o fallback `schedule` do workflow tinha um job
  `guard` que rodava `gh run list` **sem checkout** — `gh` não resolvia o repo e o job
  falhava todo dia (ruído + fallback morto). A dedup agora vive aqui no Worker, que já
  tem owner/repo nas vars e não depende de git. Não recrie o `schedule` no workflow.

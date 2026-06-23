/**
 * Cloudflare Worker — agendador do brief-diario.
 *
 * Dispara o workflow do GitHub Actions (brief.yml) via `workflow_dispatch` no
 * horário do cron trigger (ver wrangler.toml). Usamos um gatilho externo porque
 * o evento `schedule` nativo do GitHub Actions atrasa horas em repos de baixa
 * atividade; o `workflow_dispatch` via API roda na hora.
 *
 * RECUPERAÇÃO (sem fallback `schedule`/`guard` no Actions): o Worker roda em DOIS
 * ticks pontuais por dia (ver crons no wrangler.toml). Em cada tick ele verifica
 * se já existe um run do brief HOJE com sucesso ou em andamento; se houver, não
 * faz nada (dedup). Caso contrário, dispara. Assim o 2º tick re-dispara quando o
 * 1º não entregou (cron do Cloudflare não foi disparado, ou o run falhou), sem
 * nunca duplicar quando o 1º deu certo. Isso substitui o antigo job `guard` — no
 * horário certo e sem depender de checkout git.
 *
 * Configuração e deploy: ver scheduler/README.md e SETUP.md (agendador).
 *
 * Variáveis (wrangler.toml [vars]): GH_OWNER, GH_REPO, GH_WORKFLOW, GH_REF.
 * Secret (wrangler secret put): GH_DISPATCH_TOKEN — PAT com permissão Actions:
 *   read + write (o `read` é necessário para a verificação de dedup; um
 *   fine-grained "Read and write" e um classic com escopo `repo`/`workflow` cobrem).
 */
export default {
  async scheduled(event, env, ctx) {
    // Guarda de dia útil (seg–sex) em JS. O cron roda TODO DIA (ver wrangler.toml),
    // não `* * 1-5`, porque o Cloudflare interpreta o campo de dia-da-semana de
    // forma ambígua (`1-5` pode virar "domingo→quinta" no painel, pulando sexta).
    // Filtrar aqui elimina a ambiguidade.
    //
    // ATENÇÃO ao seu timezone: getUTCDay() usa o dia-da-semana em UTC. Se o seu
    // horário local cair em outro dia civil que o de UTC (ex.: cron de madrugada
    // UTC+x), ajuste esta lógica. Para horários de manhã em fusos das Américas
    // (UTC-3..-8) o dia UTC coincide com o local, então getUTCDay() basta.
    const day = new Date(event.scheduledTime).getUTCDay(); // 0=dom … 6=sáb
    if (day === 0 || day === 6) {
      console.log(`scheduler: fim de semana (getUTCDay=${day}), pula o disparo`);
      return;
    }
    ctx.waitUntil(run(env, event.scheduledTime));
  },
};

// Verifica-e-re-dispara: só dispara se ainda não houver um run do brief hoje
// com sucesso ou em andamento. É o dedup do antigo job `guard`, agora no Worker.
async function run(env, scheduledTime) {
  const today = new Date(scheduledTime).toISOString().slice(0, 10); // AAAA-MM-DD (UTC)
  if (await hasRunToday(env, today)) {
    console.log(`scheduler: já há run do brief de ${today} (sucesso/em andamento) — não dispara`);
    return;
  }
  await dispatch(env);
}

// Consulta os runs do workflow e decide se já existe um "bom" run de hoje:
// conclusion == "success" (já entregou) OU status em "queued"/"in_progress"
// (está rodando agora). Datas da API vêm em UTC, casando com `today`.
async function hasRunToday(env, today) {
  const { GH_OWNER, GH_REPO, GH_WORKFLOW, GH_DISPATCH_TOKEN } = env;
  if (!GH_DISPATCH_TOKEN) {
    throw new Error("GH_DISPATCH_TOKEN ausente (rode: wrangler secret put GH_DISPATCH_TOKEN)");
  }
  // `?per_page=30&created=>=HOJE` limita aos runs de hoje em diante (barato e suficiente).
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/runs`
    + `?per_page=30&created=%3E%3D${today}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_DISPATCH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub rejeita requisições à API sem User-Agent (HTTP 403).
      "User-Agent": "brief-diario-scheduler",
    },
  });
  if (!res.ok) {
    // Se a verificação falhar (ex.: PAT sem `read`), NÃO assumimos que já rodou:
    // logamos e deixamos o dispatch seguir. O `concurrency` do workflow ainda
    // serializa, então no pior caso um tick enfileira sem duplicar entrega.
    const body = await res.text();
    console.log(`scheduler: verificação de runs falhou (HTTP ${res.status} ${body}); seguindo para o dispatch`);
    return false;
  }
  const data = await res.json();
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  return runs.some((r) => {
    const createdToday = typeof r.created_at === "string" && r.created_at.startsWith(today);
    if (!createdToday) return false;
    return r.conclusion === "success" || r.status === "in_progress" || r.status === "queued";
  });
}

async function dispatch(env) {
  const { GH_OWNER, GH_REPO, GH_WORKFLOW, GH_DISPATCH_TOKEN } = env;
  const ref = env.GH_REF || "main";

  if (!GH_DISPATCH_TOKEN) {
    throw new Error("GH_DISPATCH_TOKEN ausente (rode: wrangler secret put GH_DISPATCH_TOKEN)");
  }

  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_DISPATCH_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      // GitHub rejeita requisições à API sem User-Agent (HTTP 403).
      "User-Agent": "brief-diario-scheduler",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref }),
  });

  // workflow_dispatch responde 204 No Content em caso de sucesso.
  if (res.status !== 204) {
    const body = await res.text();
    throw new Error(`workflow_dispatch falhou: HTTP ${res.status} ${body}`);
  }
  console.log(`workflow_dispatch OK (${GH_OWNER}/${GH_REPO} ${GH_WORKFLOW} @ ${ref})`);
}

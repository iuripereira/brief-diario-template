/**
 * Cloudflare Worker — agendador do brief-diario.
 *
 * Dispara o workflow do GitHub Actions (brief.yml) via `workflow_dispatch` no
 * horário do cron trigger (ver wrangler.toml). Usamos um gatilho externo porque
 * o evento `schedule` nativo do GitHub Actions atrasa horas em repos de baixa
 * atividade; o `workflow_dispatch` via API roda na hora.
 *
 * Configuração e deploy: ver scheduler/README.md e SETUP.md (agendador).
 *
 * Variáveis (wrangler.toml [vars]): GH_OWNER, GH_REPO, GH_WORKFLOW, GH_REF.
 * Secret (wrangler secret put): GH_DISPATCH_TOKEN — PAT com permissão Actions: write.
 */
export default {
  async scheduled(event, env, ctx) {
    // Guarda de dia útil (seg–sex) em JS. O cron roda TODO DIA (`30 9 * * *`),
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
    ctx.waitUntil(dispatch(env));
  },
};

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

// Coleta interativa das preferências. Só I/O de terminal; sem escrita em disco.
import {
  intro, text, confirm, select, multiselect, isCancel, cancel,
} from "@clack/prompts";

function bail(value) {
  if (isCancel(value)) {
    cancel("Setup cancelado. Nada foi escrito.");
    process.exit(0);
  }
  return value;
}

export async function collectAnswers() {
  intro("brief-diario — wizard de configuração");

  const nome = bail(await text({ message: "Seu nome", placeholder: "Maria Silva", validate: (v) => (v && v.trim() ? undefined : "Campo obrigatório") }));
  const cidade = bail(await text({ message: "Sua cidade", placeholder: "Curitiba" }));
  const timezone = bail(await text({ message: "Timezone (IANA)", initialValue: "America/Sao_Paulo", validate: (v) => (v && v.trim() ? undefined : "Campo obrigatório") }));
  const idioma_saida = bail(await text({ message: "Idioma do brief", initialValue: "pt-BR" }));
  const bio = bail(await text({ message: "Bio (1–3 linhas; use \\n p/ quebrar)", placeholder: "Profissão, foco atual…" }));

  const lenteRaw = bail(await text({
    message: "Lente de relevância (itens separados por ';')",
    placeholder: "carreira; finanças pessoais; sua área",
  }));
  const lente_de_relevancia = String(lenteRaw).split(";").map((s) => s.trim()).filter(Boolean);

  const secoesSel = bail(await multiselect({
    message: "Quais seções ligar?",
    options: [
      { value: "agenda", label: "Agenda" },
      { value: "emails", label: "E-mails" },
      { value: "tarefas", label: "Tarefas" },
      { value: "noticias", label: "Notícias" },
      { value: "sintese", label: "Síntese" },
      { value: "conteudo_social", label: "Conteúdo p/ redes (opcional)" },
    ],
    initialValues: ["agenda", "emails", "tarefas", "noticias", "sintese"],
    required: false,
  }));
  const has = (k) => secoesSel.includes(k);
  const secoes = {
    agenda: has("agenda"), emails: has("emails"), tarefas: has("tarefas"),
    noticias: has("noticias"), sintese: has("sintese"), conteudo_social: has("conteudo_social"),
  };

  // Notícias
  let noticias = { num_itens: 5, categorias: [] };
  if (secoes.noticias) {
    const n = bail(await text({ message: "Nº de itens de notícias", initialValue: "5" }));
    noticias.num_itens = Number(n) || 5;
    let mais = true;
    while (mais) {
      const cat = bail(await text({ message: "Nome da categoria de notícia", placeholder: "Tecnologia/IA" }));
      const fontesRaw = bail(await text({ message: "Fontes (separadas por ';', opcional)", placeholder: "TechCrunch; Tecnoblog" }));
      const fontes = String(fontesRaw).split(";").map((s) => s.trim()).filter(Boolean);
      noticias.categorias.push({ nome: String(cat).trim(), fontes });
      mais = bail(await confirm({ message: "Adicionar outra categoria?", initialValue: false }));
    }
  }

  // Conectores (só p/ seções pessoais ligadas)
  const pickMcp = async (label, def) =>
    secoes[label === "calendario" ? "agenda" : label === "email_leitura" ? "emails" : "tarefas"]
      ? bail(await text({ message: `MCP para ${label} ("" desliga)`, initialValue: def }))
      : "";
  const conectores = {
    calendario: await pickMcp("calendario", "google-calendar"),
    email_leitura: await pickMcp("email_leitura", "gmail"),
    tarefas: await pickMcp("tarefas", "todoist"),
  };

  // Entrega
  const emailOn = bail(await confirm({ message: "Entregar por e-mail?", initialValue: true }));
  const chatTipo = bail(await select({
    message: "Canal de chat",
    options: [
      { value: "none", label: "Nenhum" },
      { value: "slack", label: "Slack" },
      { value: "discord", label: "Discord" },
      { value: "telegram", label: "Telegram" },
    ],
    initialValue: "none",
  }));

  return {
    perfil: { nome: String(nome), cidade: String(cidade), timezone: String(timezone), idioma_saida: String(idioma_saida), bio: String(bio).replace(/\\n/g, "\n") },
    lente_de_relevancia,
    noticias,
    secoes,
    conectores,
    entrega: { email: { enabled: emailOn }, chat: { tipo: chatTipo } },
  };
}

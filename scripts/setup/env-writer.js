// Gera o conteúdo do .env com as chaves relevantes (valores vazios).
// Função pura: answers -> string. Não toca em disco.

export function renderEnv(answers) {
  const lines = [
    "# .env — preencha com valores reais (chmod 600, gitignored).",
    "# Em produção use GitHub Secrets. NÃO faça commit deste arquivo.",
    "",
    "# Claude headless",
    "CLAUDE_CODE_OAUTH_TOKEN=",
  ];

  if (answers.entrega.email.enabled) {
    lines.push(
      "",
      "# E-mail (entrega) — SMTP autenticado (ver CONNECTORS.md)",
      "MAIL_METHOD=smtp",
      "SMTP_URL=",
      "SMTP_USER=",
      "SMTP_PASS=",
      "EMAIL_FROM=",
      "EMAIL_TO=",
    );
  }

  if (answers.conectores.tarefas === "todoist") {
    lines.push("", "# Tarefas (MCP) — Todoist", "TODOIST_API_TOKEN=");
  }

  switch (answers.entrega.chat.tipo) {
    case "slack":
      lines.push("", "# Chat — Slack", "SLACK_WEBHOOK_URL=");
      break;
    case "discord":
      lines.push("", "# Chat — Discord", "DISCORD_WEBHOOK_URL=");
      break;
    case "telegram":
      lines.push("", "# Chat — Telegram", "TELEGRAM_BOT_TOKEN=", "TELEGRAM_CHAT_ID=");
      break;
    default:
      break; // none → sem chaves de chat
  }

  return lines.join("\n") + "\n";
}

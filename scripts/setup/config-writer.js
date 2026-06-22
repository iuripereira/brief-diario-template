// Gera o conteúdo do config.yaml. Função pura: answers -> string YAML.
import { stringify } from "yaml";

export function renderConfig(answers) {
  const obj = {
    perfil: {
      nome: answers.perfil.nome,
      cidade: answers.perfil.cidade,
      timezone: answers.perfil.timezone,
      idioma_saida: answers.perfil.idioma_saida,
      bio: answers.perfil.bio,
    },
    lente_de_relevancia: answers.lente_de_relevancia,
    noticias: {
      num_itens: answers.noticias.num_itens,
      categorias: answers.noticias.categorias,
    },
    secoes: {
      agenda: answers.secoes.agenda,
      emails: answers.secoes.emails,
      tarefas: answers.secoes.tarefas,
      noticias: answers.secoes.noticias,
      sintese: answers.secoes.sintese,
      conteudo_social: answers.secoes.conteudo_social,
    },
    conectores: {
      calendario: { mcp: answers.conectores.calendario },
      email_leitura: { mcp: answers.conectores.email_leitura },
      tarefas: { mcp: answers.conectores.tarefas },
    },
    entrega: {
      email: { enabled: answers.entrega.email.enabled },
      chat: { tipo: answers.entrega.chat.tipo },
    },
  };

  const header =
    "# config.yaml — gerado pelo wizard (npm run setup). Edite à vontade.\n" +
    "# SEGREDOS não entram aqui (vão no .env). Referência: CONFIG.md\n";
  return header + stringify(obj);
}

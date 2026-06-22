import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import { renderConfig } from "./config-writer.js";

const answers = {
  perfil: { nome: "Maria", cidade: "Curitiba", timezone: "America/Sao_Paulo", idioma_saida: "pt-BR", bio: "Engenheira de dados.\nFoco em IA." },
  lente_de_relevancia: ["carreira", "IA"],
  noticias: { num_itens: 3, categorias: [{ nome: "Tecnologia/IA", fontes: ["TechCrunch"] }] },
  secoes: { agenda: true, emails: true, tarefas: true, noticias: true, sintese: true, conteudo_social: false },
  conectores: { calendario: "google-calendar", email_leitura: "gmail", tarefas: "todoist" },
  entrega: { email: { enabled: true }, chat: { tipo: "slack" } },
};

test("YAML parseável com a estrutura esperada", () => {
  const back = parse(renderConfig(answers));
  assert.equal(back.perfil.nome, "Maria");
  assert.equal(back.perfil.timezone, "America/Sao_Paulo");
  assert.deepEqual(back.lente_de_relevancia, ["carreira", "IA"]);
  assert.equal(back.noticias.num_itens, 3);
  assert.equal(back.noticias.categorias[0].nome, "Tecnologia/IA");
  assert.equal(back.conectores.calendario.mcp, "google-calendar");
  assert.equal(back.conectores.tarefas.mcp, "todoist");
  assert.equal(back.entrega.email.enabled, true);
  assert.equal(back.entrega.chat.tipo, "slack");
  assert.equal(back.secoes.conteudo_social, false);
});

test("bio multilinha preservada", () => {
  const back = parse(renderConfig(answers));
  assert.match(back.perfil.bio, /Engenheira de dados\.\nFoco em IA\./);
});

test("conector vazio vira mcp string vazia", () => {
  const a = { ...answers, conectores: { calendario: "", email_leitura: "", tarefas: "" } };
  const back = parse(renderConfig(a));
  assert.equal(back.conectores.calendario.mcp, "");
});

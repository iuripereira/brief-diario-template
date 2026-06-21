import json, subprocess, sys, textwrap
from pathlib import Path

HERE = Path(__file__).parent
CONFIG = HERE / "config.py"

SAMPLE = textwrap.dedent("""
    perfil:
      nome: "Maria"
      cidade: "Curitiba"
      timezone: "America/Sao_Paulo"
      idioma_saida: "pt-BR"
      bio: |
        Engenheira de dados.
        Foco em IA aplicada.
    lente_de_relevancia:
      - "carreira"
      - "IA"
    noticias:
      num_itens: 3
      categorias:
        - nome: "Tecnologia/IA"
          fontes: ["TechCrunch"]
        - nome: "Local"
          fontes: []
    secoes:
      agenda: true
      emails: false
      tarefas: true
      noticias: true
      sintese: true
      conteudo_social: false
    conectores:
      calendario: { mcp: "google-calendar" }
      email_leitura: { mcp: "" }
      tarefas: { mcp: "todoist" }
    entrega:
      email: { enabled: true }
      chat: { tipo: "telegram" }
""")


def run(args, cfg):
    f = cfg / "config.yaml"
    f.write_text(SAMPLE)
    return subprocess.run([sys.executable, str(CONFIG), *args, "--file", str(f)],
                          capture_output=True, text=True)


def test_get_scalar(tmp_path):
    r = run(["get", "perfil.timezone"], tmp_path)
    assert r.returncode == 0
    assert r.stdout.strip() == "America/Sao_Paulo"


def test_get_bool(tmp_path):
    assert run(["get", "secoes.emails"], tmp_path).stdout.strip() == "false"
    assert run(["get", "secoes.tarefas"], tmp_path).stdout.strip() == "true"


def test_get_missing_key_empty(tmp_path):
    r = run(["get", "perfil.inexistente"], tmp_path)
    assert r.returncode == 0
    assert r.stdout.strip() == ""


def test_get_nested_connector(tmp_path):
    assert run(["get", "entrega.chat.tipo"], tmp_path).stdout.strip() == "telegram"
    assert run(["get", "conectores.email_leitura.mcp"], tmp_path).stdout.strip() == ""


def test_get_list_as_json(tmp_path):
    r = run(["get", "lente_de_relevancia"], tmp_path)
    assert json.loads(r.stdout) == ["carreira", "IA"]


def test_render_profile_has_name_and_lens(tmp_path):
    r = run(["render-profile"], tmp_path)
    assert r.returncode == 0
    out = r.stdout
    assert "Maria" in out and "Curitiba" in out
    assert "America/Sao_Paulo" in out
    assert "carreira" in out and "IA" in out
    assert "Engenheira de dados" in out


def test_render_profile_lists_news_categories(tmp_path):
    out = run(["render-profile"], tmp_path).stdout
    assert "Tecnologia/IA" in out and "TechCrunch" in out
    assert "3" in out  # num_itens


def test_render_profile_reflects_section_toggles(tmp_path):
    out = run(["render-profile"], tmp_path).stdout
    assert "Seções ativas" in out
    ativas = out.split("Seções ativas")[1]
    # emails e conteudo_social estão desligados → não aparecem como ativos
    assert "E-mails" not in ativas
    assert "Conteúdo social" not in ativas
    # tarefas e agenda ligados → aparecem
    assert "Tarefas" in ativas and "Agenda" in ativas


def test_missing_file_exits_1(tmp_path):
    r = subprocess.run([sys.executable, str(CONFIG), "get", "perfil.nome",
                        "--file", str(tmp_path / "nao-existe.yaml")],
                       capture_output=True, text=True)
    assert r.returncode == 1
    assert "config" in r.stderr.lower()

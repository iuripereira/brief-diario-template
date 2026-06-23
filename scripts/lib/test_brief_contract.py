import subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
SCRIPT = HERE / "brief_contract.py"

DATE = "2026-06-23"
# MD precisa passar de MIN_MD_BYTES (500); enche com texto + a data.
MD_OK = f"# Brief {DATE}\n" + ("conteúdo de teste. " * 60) + f"\nfim {DATE}\n"
HTML_OK = f"<!DOCTYPE html><html lang='pt-BR'><body>Brief de {DATE}</body></html>"
CHAT_OK = f"# Brief {DATE}\nAgenda / Tarefas / Síntese\n"


def write_trio(d, md=MD_OK, html=HTML_OK, chat=CHAT_OK):
    if md is not None:
        (d / f"{DATE}.md").write_text(md, encoding="utf-8")
    if html is not None:
        (d / f"{DATE}.html").write_text(html, encoding="utf-8")
    if chat is not None:
        (d / f"{DATE}.chat.md").write_text(chat, encoding="utf-8")


# --- API de biblioteca: validate() ---

def load_module():
    sys.path.insert(0, str(HERE))
    import brief_contract
    return brief_contract


def test_valid_trio_returns_no_problems(tmp_path):
    write_trio(tmp_path)
    bc = load_module()
    assert bc.validate(DATE, str(tmp_path)) == []


def test_missing_md_is_a_problem(tmp_path):
    write_trio(tmp_path, md=None)
    bc = load_module()
    probs = bc.validate(DATE, str(tmp_path))
    assert any("md" in p.lower() for p in probs)


def test_small_md_is_a_problem(tmp_path):
    write_trio(tmp_path, md=f"curto {DATE}")
    bc = load_module()
    assert bc.validate(DATE, str(tmp_path)) != []


def test_html_without_closing_tag_is_a_problem(tmp_path):
    write_trio(tmp_path, html=f"<html>Brief de {DATE} sem fechamento")
    bc = load_module()
    probs = bc.validate(DATE, str(tmp_path))
    assert any("html" in p.lower() for p in probs)


def test_missing_chat_is_a_problem(tmp_path):
    write_trio(tmp_path, chat=None)
    bc = load_module()
    assert bc.validate(DATE, str(tmp_path)) != []


def test_file_without_the_date_is_a_problem(tmp_path):
    # HTML válido estruturalmente mas sem a data no conteúdo
    write_trio(tmp_path, html="<html><body>sem data aqui</body></html>")
    bc = load_module()
    probs = bc.validate(DATE, str(tmp_path))
    assert any("data" in p.lower() for p in probs)


# --- CLI ---

def run_cli(args, cwd):
    return subprocess.run([sys.executable, str(SCRIPT), *args],
                          capture_output=True, text=True, cwd=str(cwd))


def test_cli_validate_ok_exits_0(tmp_path):
    write_trio(tmp_path)
    r = run_cli(["validate", DATE, "--dir", str(tmp_path)], tmp_path)
    assert r.returncode == 0


def test_cli_validate_problem_exits_1_with_stderr(tmp_path):
    write_trio(tmp_path, md=None)
    r = run_cli(["validate", DATE, "--dir", str(tmp_path)], tmp_path)
    assert r.returncode == 1
    assert r.stderr.strip() != ""


def test_cli_files_prints_three_paths(tmp_path):
    r = run_cli(["files", DATE, "--dir", "briefs"], tmp_path)
    assert r.returncode == 0
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    assert lines == [
        "briefs/2026-06-23.md",
        "briefs/2026-06-23.html",
        "briefs/2026-06-23.chat.md",
    ]

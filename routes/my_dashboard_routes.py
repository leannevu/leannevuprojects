import csv
import io
import sys
from pathlib import Path

from flask import Blueprint, abort, jsonify, render_template, request, send_from_directory, url_for

if getattr(sys, "frozen", False):
    RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
    APP_DIR = Path(sys.executable).resolve().parent
else:
    RESOURCE_DIR = Path(__file__).resolve().parent.parent
    APP_DIR = RESOURCE_DIR

my_dashboard_bp = Blueprint("my_dashboard", __name__)

PACKAGED_DATA_DIR = RESOURCE_DIR / "data" / "my_dashboard"

def resolve_data_dir():
    candidate_dirs = []
    seen = set()

    def add_candidate(path):
        resolved = Path(path).resolve()
        key = str(resolved).lower()
        if key in seen:
            return
        seen.add(key)
        candidate_dirs.append(resolved)

    for base in [Path.cwd(), APP_DIR, RESOURCE_DIR]:
        current = Path(base).resolve()
        for candidate in [
            current / "data" / "my_dashboard",
            current / "data",
            current.parent / "data" / "my_dashboard",
            current.parent / "data",
            current.parent.parent / "data" / "my_dashboard",
            current.parent.parent / "data",
        ]:
            add_candidate(candidate)

    for candidate in candidate_dirs:
        if (candidate / "case_scenario.csv").exists():
            return candidate

    for candidate in candidate_dirs:
        if (candidate / "CS 6040 Functions - Questions.csv").exists():
            return candidate

    return PACKAGED_DATA_DIR

DATA_DIR = resolve_data_dir()
FUNCTIONS_CSV = DATA_DIR / "functions.csv"
PARAMS_CSV = DATA_DIR / "parameters.csv"
CASE_SCENARIOS_CSV = DATA_DIR / "case_scenario.csv"
LEGACY_QUESTIONS_CSV = DATA_DIR / "CS 6040 Functions - Questions.csv"
STUDY_LOG_CSV = DATA_DIR / "study_log.csv"
CTRL_C_PROMPTS_CSV = DATA_DIR / "ctrl_c_prompts.csv"
SYNTAX_CSV = DATA_DIR / "syntax.csv"
NOTES_DIR = DATA_DIR / "notes"
NOTE_TITLES_CSV = NOTES_DIR / "note_titles.csv"

@my_dashboard_bp.context_processor
def inject_asset_url():
    def asset_url(filename):
        static_path = RESOURCE_DIR / "static" / filename
        version = int(static_path.stat().st_mtime) if static_path.exists() else 0
        return url_for("static", filename=filename, v=version)

    return {"asset_url": asset_url}

FUNCTIONS_HEADERS = [
    "Method",
    "Language",
    "Library / Object",
    "Returns",
    "Description",
    "Use Case",
    "Example Problem",
    "Example Answer",
    "Import",
    "Input example",
    "Output example",
]

PARAMS_HEADERS = [
    "Method",
    "Library / Object",
    "Argument",
    "Type",
    "Valid Range",
    "Required or Not Required",
    "Default Value",
]

CASE_SCENARIO_HEADERS = [
    "Question",
    "Answer",
    "Wrong Example",
    "Correct Example",
    "Methods",
    "Example Input",
    "Example Output",
]

SYNTAX_HEADERS = [
    "Syntax",
    "Language",
    "Library / Context",
    "Meaning",
    "Use Case",
    "Notes",
    "Example Problem",
    "Example Answer",
    "Input Example",
    "Output Example",
]

CTRL_C_COLUMN_SPLITTER = "$$COLUMN_SPLITTER$$"
CTRL_C_ROW_SPLITTER = "$$ROW_SPLITTER$$"

def ensure_csv(path, headers):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with open(path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()

def read_rows(path):
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def read_case_scenario_rows():
    source_path = CASE_SCENARIOS_CSV if CASE_SCENARIOS_CSV.exists() else LEGACY_QUESTIONS_CSV
    if not source_path.exists():
        return []

    with open(source_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        all_rows = list(reader)

    if not all_rows:
        return []

    header_row = [str(value or "").strip() for value in all_rows[0]]
    effective_headers = list(header_row[:len(CASE_SCENARIO_HEADERS)])
    if len(effective_headers) < len(CASE_SCENARIO_HEADERS):
        effective_headers.extend(CASE_SCENARIO_HEADERS[len(effective_headers):])

    parsed_rows = []
    expected_len = len(CASE_SCENARIO_HEADERS)
    for raw_row in all_rows[1:]:
        if not raw_row or not any(str(cell).strip() for cell in raw_row):
            continue

        padded = list(raw_row[:expected_len])
        if len(padded) < expected_len:
            padded.extend([""] * (expected_len - len(padded)))

        parsed_rows.append({
            CASE_SCENARIO_HEADERS[idx]: (padded[idx] or "").strip()
            for idx in range(expected_len)
        })

    return parsed_rows

def write_rows(path, rows, headers):
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

def parse_headerless_csv_rows(text, expected_headers):
    reader = csv.reader(io.StringIO(text or ""))
    parsed_rows = []
    expected_len = len(expected_headers)

    for raw_row in reader:
        if not raw_row or not any(str(cell).strip() for cell in raw_row):
            continue

        padded = list(raw_row[:expected_len])
        if len(padded) < expected_len:
            padded.extend([""] * (expected_len - len(padded)))

        parsed_rows.append({
            header: (padded[idx] or "").strip()
            for idx, header in enumerate(expected_headers)
        })

    return parsed_rows

def load_ctrl_c_prompts():
    if not CTRL_C_PROMPTS_CSV.exists():
        return []

    raw_text = CTRL_C_PROMPTS_CSV.read_text(encoding="utf-8-sig")
    row_parts = [
        part.strip()
        for part in raw_text.split(CTRL_C_ROW_SPLITTER)
        if part.strip()
    ]

    if not row_parts:
        return []

    headers = [value.strip() for value in row_parts[0].split(CTRL_C_COLUMN_SPLITTER)]
    value_rows = []
    for raw_row in row_parts[1:]:
        columns = [value.strip() for value in raw_row.split(CTRL_C_COLUMN_SPLITTER)]
        if len(columns) < len(headers):
            columns.extend([""] * (len(headers) - len(columns)))
        value_rows.append(columns[:len(headers)])

    prompts = []
    for index, header in enumerate(headers):
        if not header:
            continue

        block_parts = [
            row[index].strip()
            for row in value_rows
            if index < len(row) and row[index].strip()
        ]
        prompts.append({
            "id": f"ctrl-c-{index + 1}",
            "key": header,
            "label": (
                "Function CSV prompt"
                if header == "functions_and_parameters"
                else "Scenario CSV prompt"
                if header == "case_scenario"
                else "Syntax CSV prompt"
                if header == "syntax"
                else header.replace("_", " ").strip().title() or f"Prompt {index + 1}"
            ),
            "text": "\n\n".join(block_parts).strip(),
        })

    return prompts

def normalize_key(value):
    return (value or "").strip().lower()

def get_row_value(row, *keys):
    for key in keys:
        if key in row and row.get(key) is not None:
            return row.get(key)
    return ""

def extract_default_value(row):
    explicit_default = (row.get("default") or "").strip()
    if explicit_default in {"\u2014", "-", "None listed", "N/A", "n/a"}:
        explicit_default = ""
    if explicit_default:
        return explicit_default

    required_label = (row.get("required") or "").strip()
    marker = "default"
    lowered = required_label.lower()
    if marker not in lowered:
        return ""

    default_text = required_label[lowered.index(marker) + len(marker):].strip(" )(:=")
    return default_text.strip()

def is_required_param(value):
    label = (value or "").strip().lower()
    if not label:
        return False
    if "not required" in label or "optional" in label or label == "no":
        return False
    if " or " in label:
        return False
    return "required" in label or label == "yes"

def build_syntax(method, parameter_rows):
    method_name = (method or "").strip() or "function"
    if method_name.endswith("()"):
        method_name = method_name[:-2]

    if not any(is_required_param(row.get("required")) for row in parameter_rows):
        return f"{method_name}()"

    signature_parts = []
    for row in parameter_rows:
        argument = (row.get("argument") or "").strip()
        if not argument:
            continue

        default_value = extract_default_value(row)
        if default_value:
            signature_parts.append(f"{argument}={default_value}")
        elif is_required_param(row.get("required")):
            signature_parts.append(argument)

    joined = ", ".join(signature_parts)
    return f"{method_name}({joined})"

def summarize_parameters(parameter_rows):
    names = []
    for row in parameter_rows:
        argument = (row.get("argument") or "").strip()
        if argument:
            names.append(argument)
    return ", ".join(names)

def summarize_required_parameters(parameter_rows):
    names = []
    for row in parameter_rows:
        argument = (row.get("argument") or "").strip()
        if argument and is_required_param(row.get("required")):
            names.append(argument)
    return ", ".join(names)

def unique_parameter_libraries(parameter_rows):
    libraries = []
    seen = set()
    for row in parameter_rows:
        library = (row.get("library") or "").strip()
        key = normalize_key(library)
        if library and key not in seen:
            seen.add(key)
            libraries.append(library)
    return libraries

def load_flashcards():
    function_rows = read_rows(FUNCTIONS_CSV)
    param_rows = read_rows(PARAMS_CSV)

    params_by_method = {}
    for row in param_rows:
        key = normalize_key(row.get("Method"))
        if not key:
            continue
        params_by_method.setdefault(key, []).append({
            "library": get_row_value(row, "Library / Object", "Library", "Object", "library"),
            "argument": get_row_value(row, "Argument", "argument"),
            "type": get_row_value(row, "Type", "type"),
            "validRange": get_row_value(row, "Valid Range", "valid range"),
            "required": get_row_value(row, "! Required?", "Required or Not Required", "required"),
            "default": extract_default_value({
                "default": get_row_value(row, "Default", "Default Value", "default"),
                "required": get_row_value(row, "! Required?", "Required or Not Required", "required")
            }),
            "description": get_row_value(row, "Description", "description"),
            "notes": get_row_value(row, "Notes", "notes"),
            "problemExample": get_row_value(row, "Problem Example", "problem example"),
            "answerExample": get_row_value(row, "Answer Example", "answer example"),
        })

    cards = []
    seen_function_methods = set()
    for idx, row in enumerate(function_rows, start=1):
        method = row.get("Method", "").strip() or f"Function {idx}"
        key = normalize_key(method)
        if key in seen_function_methods:
            continue
        seen_function_methods.add(key)
        parameter_details = params_by_method.get(key, [])
        parameter_libraries = unique_parameter_libraries(parameter_details)
        function_library = get_row_value(row, "Library / Object", "Library", "Object").strip()
        cards.append({
            "id": str(idx),
            "language": get_row_value(row, "Language", "Language.1").strip() or "Python",
            "library": ", ".join(parameter_libraries) if parameter_libraries else function_library,
            "functionLibrary": function_library,
            "method": method,
            "returns": get_row_value(row, "Returns", "Return", "Output").strip(),
            "description": get_row_value(row, "Description", "description").strip(),
            "useCase": get_row_value(row, "Use Case", "Use case", "use case").strip(),
            "exampleProblem": get_row_value(row, "Example Problem", "example problem").strip(),
            "exampleAnswer": get_row_value(row, "Example Answer", "answer example", "example answer").strip(),
            "import": get_row_value(row, "Import", "import").strip(),
            "inputExample": get_row_value(row, "Input example", "Input Example", "input example").strip(),
            "outputExample": get_row_value(row, "Output example", "Output Example", "output example").strip(),
            "parameterDetails": parameter_details
        })
        cards[-1]["syntax"] = build_syntax(method, cards[-1]["parameterDetails"]) or get_row_value(row, "Syntax", "syntax").strip()
        cards[-1]["parameters"] = summarize_parameters(cards[-1]["parameterDetails"])
        cards[-1]["requiredParameters"] = summarize_required_parameters(cards[-1]["parameterDetails"])
    return cards

def load_case_scenarios():
    rows = read_case_scenario_rows()
    scenarios = []
    for idx, row in enumerate(rows, start=1):
        scenarios.append({
            "id": f"q-{idx}",
            "question": (row.get("Question") or "").strip(),
            "methods": (row.get("Methods") or "").strip(),
            "answer": (row.get("Answer") or "").strip(),
            "wrongExample": (row.get("Wrong Example") or "").strip(),
            "correctExample": (row.get("Correct Example") or "").strip(),
            "exampleInput": (row.get("Example Input") or "").strip(),
            "exampleOutput": (row.get("Example Output") or "").strip(),
        })
    return scenarios

def load_syntax_rows():
    rows = read_rows(SYNTAX_CSV)
    syntax_rows = []
    for idx, row in enumerate(rows, start=1):
        syntax_rows.append({
            "id": f"s-{idx}",
            "syntax": get_row_value(row, "Syntax", "syntax").strip(),
            "language": get_row_value(row, "Language", "language").strip() or "Python",
            "library": get_row_value(row, "Library / Context", "Library", "Context", "library").strip(),
            "meaning": get_row_value(row, "Meaning", "meaning").strip(),
            "useCase": get_row_value(row, "Use Case", "Use case", "use case").strip(),
            "notes": get_row_value(row, "Notes", "notes").strip(),
            "exampleProblem": get_row_value(row, "Example Problem", "example problem").strip(),
            "exampleAnswer": get_row_value(row, "Example Answer", "example answer", "answer example").strip(),
            "inputExample": get_row_value(row, "Input Example", "input example").strip(),
            "outputExample": get_row_value(row, "Output Example", "output example").strip(),
        })
    return syntax_rows

def load_productivity():
    ensure_csv(STUDY_LOG_CSV, ["Date", "Hours", "Notes"])

    study_logs = {}
    notes = {}
    for row in read_rows(STUDY_LOG_CSV):
        date = (get_row_value(row, "Date", "date") or "").strip()
        if not date:
            continue
        try:
            study_logs[date] = float(get_row_value(row, "Hours", "hours") or 0)
        except ValueError:
            study_logs[date] = 0
        notes[date] = get_row_value(row, "Notes", "notes", "Note", "note") or ""

    return {"studyLogs": study_logs, "notes": notes}

def load_note_pdfs():
    if not NOTES_DIR.exists():
        return []

    note_titles = load_note_titles()

    def sort_key(path):
        stem = path.stem.strip()
        return (0, int(stem)) if stem.isdigit() else (1, stem.lower())

    pdfs = []
    for pdf_path in sorted(NOTES_DIR.glob("*.pdf"), key=sort_key):
        note_key = pdf_path.stem.strip()
        pdfs.append({
            "name": pdf_path.name,
            "label": note_key,
            "title": note_titles.get(note_key, note_key),
            "url": url_for("my_dashboard.serve_note_pdf", filename=pdf_path.name),
        })
    return pdfs

def load_note_titles():
    titles = {}
    for row in read_rows(NOTE_TITLES_CSV):
        normalized = {
            (key or "").strip().lower(): (value or "").strip()
            for key, value in row.items()
        }
        note = normalized.get("note", "")
        title = normalized.get("title", "")
        if note and title:
            titles[Path(note).stem] = title
    return titles

def upsert_study_log(date, hours=None, note=None):
    ensure_csv(STUDY_LOG_CSV, ["Date", "Hours", "Notes"])
    rows = read_rows(STUDY_LOG_CSV)
    updated = False
    for row in rows:
        row_date = (get_row_value(row, "Date", "date") or "").strip()
        if row_date == date:
            row["Date"] = date
            if hours is not None:
                row["Hours"] = str(hours)
            else:
                row["Hours"] = str(get_row_value(row, "Hours", "hours") or 0)
            if note is not None:
                row["Notes"] = note
            else:
                row["Notes"] = get_row_value(row, "Notes", "notes", "Note", "note") or ""
            updated = True
            break
    if not updated:
        rows.append({
            "Date": date,
            "Hours": str(hours if hours is not None else 0),
            "Notes": note or ""
        })

    normalized_rows = []
    for row in rows:
        normalized_rows.append({
            "Date": (get_row_value(row, "Date", "date") or "").strip(),
            "Hours": str(get_row_value(row, "Hours", "hours") or 0),
            "Notes": get_row_value(row, "Notes", "notes", "Note", "note") or ""
        })

    write_rows(STUDY_LOG_CSV, normalized_rows, ["Date", "Hours", "Notes"])

def upsert_hours(date, hours):
    upsert_study_log(date, hours=hours)

def upsert_note(date, note):
    upsert_study_log(date, note=note)

def delete_study_day(date):
    ensure_csv(STUDY_LOG_CSV, ["Date", "Hours", "Notes"])
    rows = read_rows(STUDY_LOG_CSV)
    kept_rows = []
    for row in rows:
        row_date = (get_row_value(row, "Date", "date") or "").strip()
        if row_date != date:
            kept_rows.append({
                "Date": row_date,
                "Hours": str(get_row_value(row, "Hours", "hours") or 0),
                "Notes": get_row_value(row, "Notes", "notes", "Note", "note") or ""
            })
    write_rows(STUDY_LOG_CSV, kept_rows, ["Date", "Hours", "Notes"])

def import_function_rows(text):
    ensure_csv(FUNCTIONS_CSV, FUNCTIONS_HEADERS)
    existing_rows = read_rows(FUNCTIONS_CSV)
    existing_methods = {
        normalize_key(get_row_value(row, "Method"))
        for row in existing_rows
        if normalize_key(get_row_value(row, "Method"))
    }

    new_rows = parse_headerless_csv_rows(text, FUNCTIONS_HEADERS)
    inserted_rows = []
    duplicate_methods = []

    for row in new_rows:
        method = (row.get("Method") or "").strip()
        method_key = normalize_key(method)
        if not method_key:
            continue
        if method_key in existing_methods:
            duplicate_methods.append(method)
            continue

        existing_methods.add(method_key)
        inserted_rows.append(row)

    if inserted_rows:
        write_rows(FUNCTIONS_CSV, existing_rows + inserted_rows, FUNCTIONS_HEADERS)

    return {
        "inserted": len(inserted_rows),
        "duplicates": sorted(set(filter(None, duplicate_methods)), key=str.lower),
    }

def import_parameter_rows(text):
    ensure_csv(PARAMS_CSV, PARAMS_HEADERS)
    existing_rows = read_rows(PARAMS_CSV)
    new_rows = parse_headerless_csv_rows(text, PARAMS_HEADERS)

    if new_rows:
        write_rows(PARAMS_CSV, existing_rows + new_rows, PARAMS_HEADERS)

    return {"inserted": len(new_rows)}

def import_question_rows(text):
    ensure_csv(CASE_SCENARIOS_CSV, CASE_SCENARIO_HEADERS)
    existing_rows = read_case_scenario_rows()
    new_rows = parse_headerless_csv_rows(text, CASE_SCENARIO_HEADERS)

    if new_rows:
        write_rows(CASE_SCENARIOS_CSV, existing_rows + new_rows, CASE_SCENARIO_HEADERS)

    return {"inserted": len(new_rows)}

def import_syntax_rows(text):
    ensure_csv(SYNTAX_CSV, SYNTAX_HEADERS)
    existing_rows = read_rows(SYNTAX_CSV)
    new_rows = parse_headerless_csv_rows(text, SYNTAX_HEADERS)

    if new_rows:
        write_rows(SYNTAX_CSV, existing_rows + new_rows, SYNTAX_HEADERS)

    return {"inserted": len(new_rows)}

@my_dashboard_bp.route("/my_dashboard")
def my_dashboard():
    load_productivity()
    return render_template("my_dashboard/index.html")

@my_dashboard_bp.get("/api/flashcards")
def api_flashcards():
    return jsonify(load_flashcards())

@my_dashboard_bp.get("/api/case-scenarios")
def api_case_scenarios():
    return jsonify(load_case_scenarios())

@my_dashboard_bp.get("/api/syntax")
def api_syntax():
    return jsonify(load_syntax_rows())

@my_dashboard_bp.get("/api/productivity")
def api_productivity():
    return jsonify(load_productivity())

@my_dashboard_bp.get("/api/ctrl-c-prompts")
def api_ctrl_c_prompts():
    return jsonify(load_ctrl_c_prompts())

@my_dashboard_bp.get("/api/notes")
def api_notes():
    return jsonify(load_note_pdfs())

@my_dashboard_bp.get("/notes/<path:filename>")
def serve_note_pdf(filename):
    requested = Path(filename).name
    if not requested.lower().endswith(".pdf"):
        abort(404)

    file_path = NOTES_DIR / requested
    if not file_path.exists():
        abort(404)

    return send_from_directory(NOTES_DIR, requested)

@my_dashboard_bp.post("/api/productivity/log")
def api_productivity_log():
    payload = request.get_json(force=True)
    date = (payload.get("date") or "").strip()
    hours = float(payload.get("hours") or 0)
    upsert_hours(date, hours)
    return jsonify({"ok": True})

@my_dashboard_bp.post("/api/productivity/note")
def api_productivity_note():
    payload = request.get_json(force=True)
    date = (payload.get("date") or "").strip()
    note = payload.get("note") or ""
    upsert_note(date, note)
    return jsonify({"ok": True})

@my_dashboard_bp.post("/api/productivity/delete")
def api_productivity_delete():
    payload = request.get_json(force=True)
    date = (payload.get("date") or "").strip()
    delete_study_day(date)
    return jsonify({"ok": True})

@my_dashboard_bp.post("/api/import/functions")
def api_import_functions():
    payload = request.get_json(force=True)
    result = import_function_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

@my_dashboard_bp.post("/api/import/parameters")
def api_import_parameters():
    payload = request.get_json(force=True)
    result = import_parameter_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

@my_dashboard_bp.post("/api/import/questions")
def api_import_questions():
    payload = request.get_json(force=True)
    result = import_question_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

@my_dashboard_bp.post("/api/import/syntax")
def api_import_syntax():
    payload = request.get_json(force=True)
    result = import_syntax_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})


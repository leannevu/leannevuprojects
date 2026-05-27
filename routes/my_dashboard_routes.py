import csv
import io
import json
import os
import sys
from contextlib import contextmanager
from datetime import date, timedelta
from functools import wraps
from pathlib import Path

from flask import Blueprint, abort, jsonify, redirect, render_template, request, send_from_directory, session, url_for

try:
    from authlib.integrations.flask_client import OAuth
except ImportError:
    OAuth = None

try:
    from google.cloud import bigquery
    from google.oauth2 import service_account
    from google.api_core.exceptions import GoogleAPIError
except ImportError:
    bigquery = None
    service_account = None
    GoogleAPIError = Exception

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None

if getattr(sys, "frozen", False):
    PROJECT_ROOT = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
else:
    PROJECT_ROOT = Path(__file__).resolve().parent.parent

STATIC_DIR = PROJECT_ROOT / "static" / "study-dashboard"
DATA_DIR = PROJECT_ROOT / "data" / "study-dashboard"

def load_local_launch_env():
    allowed_keys = {
        "DATABASE_URL",
        "DATABASE_PRIVATE_URL",
        "GOOGLE_APPLICATION_CREDENTIALS",
        "GOOGLE_APPLICATION_CREDENTIALS_JSON",
        "STUDY_DASHBOARD_BQ_CREDENTIALS",
        "STUDY_DASHBOARD_BQ_CREDENTIALS_JSON",
        "STUDY_DASHBOARD_DATASET",
        "STUDY_DASHBOARD_DATA_SOURCE",
        "STUDY_DASHBOARD_ANALYTICS_ENGINE",
        "STUDY_DASHBOARD_POSTGRES_URL",
        "STUDY_DASHBOARD_POSTGRES_PRIVATE_URL",
        "STUDY_DASHBOARD_PROJECT",
        "STUDY_DASHBOARD_USE_BIGQUERY",
        "STUDY_DASHBOARD_USER_ID",
        "POSTGRES_URL",
        "POSTGRES_PRIVATE_URL",
    }

    env_files = [
        PROJECT_ROOT / ".env",
    ]
    for env_file in env_files:
        if not env_file.exists():
            continue
        try:
            lines = env_file.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        load_env_lines(lines, allowed_keys)

    launch_files = [
        PROJECT_ROOT / "Start Dashboard.bat",
    ]
    launch_file = next((path for path in launch_files if path.exists()), None)
    if launch_file is None:
        return

    try:
        lines = launch_file.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    load_env_lines(lines, allowed_keys)

def load_env_lines(lines, allowed_keys):
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.lower().startswith("set "):
            assignment = stripped[4:].strip().strip('"')
        else:
            assignment = stripped.strip().strip('"')
        if "=" not in assignment:
            continue
        key, value = assignment.split("=", 1)
        key = key.strip()
        if key in allowed_keys and not os.environ.get(key):
            os.environ[key] = value.strip()

load_local_launch_env()

newdashboard_bp = Blueprint(
    "newdashboard",
    __name__,
    template_folder=str(PROJECT_ROOT / "templates"),
    static_folder=str(STATIC_DIR),
    static_url_path="/study-dashboard-static",
)


NOTES_DIR = DATA_DIR / "notes"
NOTE_TITLES_CSV = NOTES_DIR / "note_titles.csv"

BQ_PROJECT = os.environ.get("STUDY_DASHBOARD_PROJECT", "mydashboard-496904")
BQ_DATASET = os.environ.get("STUDY_DASHBOARD_DATASET", "studyDashboard")
BQ_CREDENTIALS = os.environ.get(
    "GOOGLE_APPLICATION_CREDENTIALS",
    os.environ.get(
        "STUDY_DASHBOARD_BQ_CREDENTIALS",
        r"c:\Users\Leanne\Downloads\mydashboard-496904-cd3b0c2909f5.json",
    ),
)
BQ_CREDENTIALS_JSON = os.environ.get(
    "GOOGLE_APPLICATION_CREDENTIALS_JSON",
    os.environ.get("STUDY_DASHBOARD_BQ_CREDENTIALS_JSON", ""),
).strip()
USE_BIGQUERY = os.environ.get("STUDY_DASHBOARD_USE_BIGQUERY", "0").strip().lower() in {"1", "true", "yes"}
BQ_AVAILABLE = bigquery is not None and USE_BIGQUERY and bool(BQ_PROJECT and BQ_DATASET)
POSTGRES_URL = next(
    (
        os.environ.get(key, "").strip()
        for key in (
            "DATABASE_PRIVATE_URL",
            "STUDY_DASHBOARD_POSTGRES_PRIVATE_URL",
            "POSTGRES_PRIVATE_URL",
            "DATABASE_URL",
            "STUDY_DASHBOARD_POSTGRES_URL",
            "POSTGRES_URL",
        )
        if os.environ.get(key, "").strip()
    ),
    "",
)
POSTGRES_AVAILABLE = psycopg is not None and bool(POSTGRES_URL)
ACTIVE_USER_ID = int(os.environ.get("STUDY_DASHBOARD_USER_ID", "1"))
DATA_SOURCE = os.environ.get("STUDY_DASHBOARD_DATA_SOURCE", "auto").strip().lower()
ANALYTICS_ENGINE = os.environ.get("STUDY_DASHBOARD_ANALYTICS_ENGINE", "auto").strip().lower()

# Secret key is configured on the parent portfolio Flask app.
OAUTH_OPT_IN = os.environ.get("STUDY_DASHBOARD_ENABLE_OAUTH", "0").strip().lower() in {"1", "true", "yes"}
OAUTH_CLIENT_SECRET_FILE = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET_FILE", "")

def load_google_oauth_client_config():
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    redirect_uri = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
    if client_id and client_secret:
        return client_id, client_secret, redirect_uri

    path = Path(OAUTH_CLIENT_SECRET_FILE) if OAUTH_CLIENT_SECRET_FILE else None
    if not path or not path.exists():
        return client_id, client_secret, redirect_uri

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not read Google OAuth client file. {exc}", file=sys.stderr)
        return client_id, client_secret, redirect_uri

    config = data.get("web") or data.get("installed") or {}
    client_id = client_id or (config.get("client_id") or "").strip()
    client_secret = client_secret or (config.get("client_secret") or "").strip()
    redirect_uris = config.get("redirect_uris") or []
    redirect_uri = redirect_uri or (redirect_uris[0] if redirect_uris else "")
    return client_id, client_secret, redirect_uri

OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI = (
    load_google_oauth_client_config() if OAUTH_OPT_IN else ("", "", "")
)
OAUTH_ALLOWED_EMAILS = {
    email.strip().lower()
    for email in os.environ.get("GOOGLE_OAUTH_ALLOWED_EMAILS", "").split(",")
    if email.strip()
}
OAUTH_ALLOWED_DOMAIN = os.environ.get("GOOGLE_OAUTH_ALLOWED_DOMAIN", "").strip().lower()
AUTH_ENABLED = False

oauth = None
if False and AUTH_ENABLED and oauth is not None:
    oauth.register(
        name="google",
        client_id=OAUTH_CLIENT_ID,
        client_secret=OAUTH_CLIENT_SECRET,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

@newdashboard_bp.context_processor
def inject_asset_url():
    def asset_url(filename):
        static_path = STATIC_DIR / filename
        version = int(static_path.stat().st_mtime) if static_path.exists() else 0
        return url_for("newdashboard.static", filename=filename, v=version)

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

MGMT_6201_HEADERS = [
    "term",
    "definition",
    "dependencies",
]

SPREADSHEET_PROFILES = {
    "functions": {
        "headers": FUNCTIONS_HEADERS,
        "required": ["method", "returns", "description"],
        "hints": ["function", "method"],
    },
    "parameters": {
        "headers": PARAMS_HEADERS,
        "required": ["method", "argument", "type"],
        "hints": ["parameter"],
    },
    "case_scenarios": {
        "headers": CASE_SCENARIO_HEADERS,
        "required": ["question", "answer", "methods"],
        "hints": ["case", "scenario", "question"],
    },
    "syntax": {
        "headers": SYNTAX_HEADERS,
        "required": ["syntax", "meaning"],
        "hints": ["syntax"],
    },
    "study_log": {
        "headers": ["Date", "Hours", "Notes"],
        "required": ["date", "hours", "notes"],
        "hints": ["study", "log"],
    },
    "terms": {
        "headers": MGMT_6201_HEADERS,
        "required": ["term", "definition", "dependencies"],
        "hints": ["term", "definition", "mgmt"],
    },
}

LOCAL_SPREADSHEETS = {
    "functions": {
        "id": "local-functions",
        "page_id": "cs6040",
        "spreadsheet_name": "Functions",
        "filename": "functions.csv",
        "spreadsheet_type": "csv",
    },
    "parameters": {
        "id": "local-parameters",
        "page_id": "cs6040",
        "spreadsheet_name": "Parameters",
        "filename": "parameters.csv",
        "spreadsheet_type": "csv",
    },
    "case_scenarios": {
        "id": "local-case-scenarios",
        "page_id": "cs6040",
        "spreadsheet_name": "Case Scenarios",
        "filename": "case_scenario.csv",
        "spreadsheet_type": "csv",
    },
    "syntax": {
        "id": "local-syntax",
        "page_id": "cs6040",
        "spreadsheet_name": "Syntax",
        "filename": "syntax.csv",
        "spreadsheet_type": "csv",
    },
    "study_log": {
        "id": "local-study-log",
        "page_id": "cs6040",
        "spreadsheet_name": "Study Log",
        "filename": "study_log.csv",
        "spreadsheet_type": "csv",
    },
    "terms": {
        "id": "local-terms",
        "page_id": "mgmt6201",
        "spreadsheet_name": "MGMT 6201",
        "filename": "mgmt_6201.csv",
        "spreadsheet_type": "csv",
    },
}

def bq_table(table_name):
    return f"`{BQ_PROJECT}.{BQ_DATASET}.{table_name}`"

def bq_client():
    if not BQ_AVAILABLE:
        raise RuntimeError(
            "BigQuery is required. Install google-cloud-bigquery and keep STUDY_DASHBOARD_USE_BIGQUERY enabled."
        )

    try:
        if BQ_CREDENTIALS_JSON and service_account is not None:
            credentials_info = json.loads(BQ_CREDENTIALS_JSON)
            credentials = service_account.Credentials.from_service_account_info(credentials_info)
            return bigquery.Client(project=BQ_PROJECT, credentials=credentials)

        credentials_path = Path(BQ_CREDENTIALS) if BQ_CREDENTIALS else None
        if credentials_path and credentials_path.exists() and service_account is not None:
            credentials = service_account.Credentials.from_service_account_file(str(credentials_path))
            return bigquery.Client(project=BQ_PROJECT, credentials=credentials)
        return bigquery.Client(project=BQ_PROJECT)
    except Exception as exc:
        raise RuntimeError(f"BigQuery unavailable. {exc}") from exc

def bq_query(sql, parameters=None):
    client = bq_client()

    job_config = None
    if parameters:
        job_config = bigquery.QueryJobConfig(query_parameters=parameters)

    try:
        return [dict(row) for row in client.query(sql, job_config=job_config).result()]
    except GoogleAPIError as exc:
        raise RuntimeError(f"BigQuery query failed. {exc}") from exc

def bq_execute(sql, parameters=None):
    client = bq_client()

    job_config = None
    if parameters:
        job_config = bigquery.QueryJobConfig(query_parameters=parameters)

    try:
        client.query(sql, job_config=job_config).result()
        return True
    except GoogleAPIError as exc:
        raise RuntimeError(f"BigQuery update failed. {exc}") from exc

def use_postgres_source():
    return POSTGRES_AVAILABLE and DATA_SOURCE in {"auto", "postgres"}

def use_bigquery_source():
    return BQ_AVAILABLE and DATA_SOURCE in {"auto", "bigquery"}

def require_postgres_source():
    return DATA_SOURCE == "postgres"

def require_bigquery_source():
    return DATA_SOURCE == "bigquery"

def configured_db_source():
    if use_postgres_source():
        return "postgres"
    if use_bigquery_source():
        return "bigquery"
    return "local"

def postgres_url_source():
    for key in (
        "DATABASE_PRIVATE_URL",
        "STUDY_DASHBOARD_POSTGRES_PRIVATE_URL",
        "POSTGRES_PRIVATE_URL",
        "DATABASE_URL",
        "STUDY_DASHBOARD_POSTGRES_URL",
        "POSTGRES_URL",
    ):
        if os.environ.get(key, "").strip():
            return key
    return ""

def use_bigquery_analytics():
    return BQ_AVAILABLE and ANALYTICS_ENGINE in {"auto", "bigquery"}

def require_bigquery_analytics():
    return ANALYTICS_ENGINE == "bigquery"

def configured_analytics_engine():
    return "bigquery" if use_bigquery_analytics() else "python"

def bigquery_credentials_source():
    if BQ_CREDENTIALS_JSON:
        return "json_env"
    if BQ_CREDENTIALS and Path(BQ_CREDENTIALS).exists():
        return "file"
    return "default_credentials"

def bq_id_parameter(name, value):
    if isinstance(value, int):
        return bigquery.ScalarQueryParameter(name, "INT64", value)
    try:
        return bigquery.ScalarQueryParameter(name, "INT64", int(value))
    except (TypeError, ValueError):
        return bigquery.ScalarQueryParameter(name, "STRING", str(value))

def unique_rows_by_id(rows):
    unique = {}
    for row in rows or []:
        key = row.get("id")
        if key not in unique:
            unique[key] = row
    return list(unique.values())

@contextmanager
def postgres_connection():
    if not POSTGRES_AVAILABLE:
        raise RuntimeError(
            "Postgres is required for app display/user data. Set DATABASE_URL or STUDY_DASHBOARD_POSTGRES_URL."
        )

    conn = None
    try:
        conn = psycopg.connect(POSTGRES_URL, row_factory=dict_row)
        yield conn
    except Exception as exc:
        raise RuntimeError(f"Postgres unavailable. {exc}") from exc
    finally:
        if conn:
            conn.close()

def postgres_query(sql, parameters=None):
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, parameters or ())
            return cursor.fetchall()

def postgres_execute(sql, parameters=None):
    with postgres_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, parameters or ())
        conn.commit()
        return True

def api_runtime_error_response(exc):
    if request.path.startswith("/api/"):
        print(f"Dashboard API error on {request.path}: {exc}", file=sys.stderr)
        return jsonify({"error": str(exc), "path": request.path}), 500
    raise exc

@newdashboard_bp.errorhandler(RuntimeError)
def handle_dashboard_runtime_error(exc):
    return api_runtime_error_response(exc)

def postgres_health():
    health = {
        "available": POSTGRES_AVAILABLE,
        "urlSet": bool(POSTGRES_URL),
        "urlSource": postgres_url_source(),
        "connected": False,
        "tables": [],
        "counts": {},
        "error": "",
    }
    if not POSTGRES_AVAILABLE:
        health["error"] = "psycopg is not installed or no Postgres URL is configured."
        return health

    try:
        with psycopg.connect(POSTGRES_URL, row_factory=dict_row) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                    """
                )
                health["tables"] = [row["table_name"] for row in cursor.fetchall()]

                for table_name in ("users", "pages", "spreadsheets", "study_habits", "ctrl_c_prompts"):
                    if table_name not in health["tables"]:
                        health["counts"][table_name] = None
                        continue
                    cursor.execute(f"SELECT COUNT(*) AS count FROM {table_name}")
                    health["counts"][table_name] = cursor.fetchone()["count"]

        health["connected"] = True
    except Exception as exc:
        health["error"] = str(exc)
    return health

def bigquery_health():
    health = {
        "available": BQ_AVAILABLE,
        "enabled": USE_BIGQUERY,
        "credentialsSource": bigquery_credentials_source(),
        "project": BQ_PROJECT if BQ_AVAILABLE else "",
        "dataset": BQ_DATASET if BQ_AVAILABLE else "",
        "connected": False,
        "error": "",
    }
    if not BQ_AVAILABLE:
        health["error"] = "BigQuery is disabled, unavailable, or missing project/dataset config."
        return health

    try:
        bq_query("SELECT 1 AS ok")
        health["connected"] = True
    except Exception as exc:
        health["error"] = str(exc)
    return health

def split_csv_headers(header_text, fallback_headers):
    text = (header_text or "").strip()
    if not text:
        return list(fallback_headers)
    try:
        parsed = next(csv.reader(io.StringIO(text)))
    except (csv.Error, StopIteration):
        return list(fallback_headers)
    headers = [value.strip() for value in parsed if value.strip()]
    return headers or list(fallback_headers)

def normalize_db_csv_text(text):
    return (text or "").replace("\\r\\n", "\n").replace("\\n", "\n")

def rows_from_csv_text(csv_text, headers):
    content = normalize_db_csv_text(csv_text)
    if not content.strip():
        return []

    raw_rows = list(csv.reader(io.StringIO(content)))
    raw_rows = [row for row in raw_rows if row and any(str(cell).strip() for cell in row)]
    if not raw_rows:
        return []

    normalized_headers = [header.strip().lower() for header in headers]
    first_row = [str(value or "").strip().lower() for value in raw_rows[0][:len(headers)]]
    if first_row == normalized_headers:
        raw_rows = raw_rows[1:]

    parsed = []
    for raw_row in raw_rows:
        padded = list(raw_row[:len(headers)])
        if len(padded) < len(headers):
            padded.extend([""] * (len(headers) - len(padded)))
        parsed.append({header: (padded[index] or "").strip() for index, header in enumerate(headers)})
    return parsed

def rows_to_csv_text(rows, headers):
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({header: get_row_value(row, header) for header in headers})
    return output.getvalue()

def rows_by_date(rows):
    by_date = {}
    for row in rows or []:
        date_key = (get_row_value(row, "Date", "date") or "").strip()
        if not date_key:
            continue
        try:
            hours = float(get_row_value(row, "Hours", "hours") or 0)
        except ValueError:
            hours = 0
        by_date[date_key] = hours
    return by_date

def sum_date_range(by_date, start_date, end_date):
    total = 0
    for date_key, hours in by_date.items():
        try:
            current = date.fromisoformat(date_key)
        except ValueError:
            continue
        if start_date <= current <= end_date:
            total += hours
    return total

def average(values):
    values = [float(value or 0) for value in values]
    return sum(values) / len(values) if values else 0

def normalized_header(value):
    return (value or "").strip().lower()

def spreadsheet_role(source):
    header_set = set(normalized_header(header) for header in split_csv_headers(source.get("headers"), []))
    haystack = " ".join([
        str(source.get("spreadsheet_name") or ""),
        str(source.get("filename") or ""),
    ]).lower()

    best_role = ""
    best_score = 0
    for role, profile in SPREADSHEET_PROFILES.items():
        required = set(profile["required"])
        required_matches = len(required & header_set)
        if required and required_matches < len(required):
            continue

        hint_matches = sum(1 for hint in profile.get("hints", []) if hint in haystack)
        score = required_matches * 10 + hint_matches
        if score > best_score:
            best_role = role
            best_score = score
    return best_role

def get_db_spreadsheets():
    rows = postgres_query(
        """
        SELECT id, page_id, spreadsheet_name, filename, headers, csv_text, spreadsheet_type
        FROM spreadsheets
        ORDER BY page_id, id
        """,
    )
    rows = unique_rows_by_id(rows)
    for row in rows:
        row["role"] = spreadsheet_role(row)
    return rows

def get_bq_spreadsheets():
    rows = bq_query(
        f"""
        SELECT id, page_id, spreadsheet_name, filename, headers, csv_text, spreadsheet_type
        FROM {bq_table("spreadsheets")}
        ORDER BY page_id, id
        """,
    )
    rows = unique_rows_by_id(rows)
    for row in rows:
        row["role"] = spreadsheet_role(row)
    return rows

def get_source_spreadsheets():
    if use_postgres_source():
        return get_db_spreadsheets()
    if use_bigquery_source():
        return get_bq_spreadsheets()
    return local_spreadsheet_sources()

def get_db_spreadsheet_by_role(role):
    for source in get_db_spreadsheets():
        if source.get("role") == role:
            return source
    return None

def get_bq_spreadsheet_by_role(role):
    for source in get_bq_spreadsheets():
        if source.get("role") == role:
            return source
    return None

def read_db_rows(role):
    source = get_db_spreadsheet_by_role(role)
    if not source:
        return None
    headers = split_csv_headers(source.get("headers"), SPREADSHEET_PROFILES[role]["headers"])
    return rows_from_csv_text(source.get("csv_text"), headers)

def read_bq_rows(role):
    source = get_bq_spreadsheet_by_role(role)
    if not source:
        return None
    headers = split_csv_headers(source.get("headers"), SPREADSHEET_PROFILES[role]["headers"])
    return rows_from_csv_text(source.get("csv_text"), headers)

def local_spreadsheet_sources():
    sources = []
    for role, source in LOCAL_SPREADSHEETS.items():
        path = DATA_DIR / source["filename"]
        if not path.exists():
            continue
        sources.append({
            **source,
            "role": role,
        })
    return sources

def read_local_rows(role):
    source = LOCAL_SPREADSHEETS.get(role)
    if not source:
        return []
    path = DATA_DIR / source["filename"]
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def write_local_rows(role, rows, headers):
    source = LOCAL_SPREADSHEETS.get(role)
    if not source:
        return False
    path = DATA_DIR / source["filename"]
    if not path.exists():
        return False
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=headers, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({header: get_row_value(row, header) for header in headers})
    return True

def write_db_rows(role, rows, headers):
    source = get_db_spreadsheet_by_role(role)
    if not source:
        return False

    csv_text = rows_to_csv_text(rows, headers)
    joined_headers = ",".join(headers)

    return postgres_execute(
        """
        UPDATE spreadsheets
        SET headers = %s, csv_text = %s
        WHERE id = %s
        """,
        (joined_headers, csv_text, source["id"]),
    )

def write_bq_rows(role, rows, headers):
    source = get_bq_spreadsheet_by_role(role)
    if not source:
        return False

    csv_text = rows_to_csv_text(rows, headers)
    joined_headers = ",".join(headers)

    return bq_execute(
        f"""
        UPDATE {bq_table("spreadsheets")}
        SET headers = @headers, csv_text = @csv_text
        WHERE id = @id
        """,
        [
            bigquery.ScalarQueryParameter("headers", "STRING", joined_headers),
            bigquery.ScalarQueryParameter("csv_text", "STRING", csv_text),
            bq_id_parameter("id", source["id"]),
        ],
    )

def ensure_source(role):
    if use_postgres_source() and get_db_spreadsheet_by_role(role):
        return
    if require_postgres_source():
        raise RuntimeError(f"Required Postgres spreadsheet source not found for role: {role}")
    if use_bigquery_source() and get_bq_spreadsheet_by_role(role):
        return
    if require_bigquery_source():
        raise RuntimeError(f"Required BigQuery spreadsheet source not found for role: {role}")
    local_source = LOCAL_SPREADSHEETS.get(role)
    if local_source and (DATA_DIR / local_source["filename"]).exists():
        return
    raise RuntimeError(f"No database spreadsheet source found for role: {role}")

def read_rows(role):
    if use_postgres_source():
        db_rows = read_db_rows(role)
        if db_rows is not None:
            return db_rows
        if require_postgres_source():
            raise RuntimeError(f"Required Postgres spreadsheet source not found for role: {role}")
    if use_bigquery_source():
        bq_rows = read_bq_rows(role)
        if bq_rows is not None:
            return bq_rows
        if require_bigquery_source():
            raise RuntimeError(f"Required BigQuery spreadsheet source not found for role: {role}")
    return read_local_rows(role)

def read_case_scenario_rows():
    return read_rows("case_scenarios")

def write_rows(role, rows, headers):
    if use_postgres_source() and write_db_rows(role, rows, headers):
        return
    if require_postgres_source():
        raise RuntimeError(f"Required Postgres spreadsheet source not found for role: {role}")
    if use_bigquery_source() and write_bq_rows(role, rows, headers):
        return
    if require_bigquery_source():
        raise RuntimeError(f"Required BigQuery spreadsheet source not found for role: {role}")
    if write_local_rows(role, rows, headers):
        return
    raise RuntimeError(f"No spreadsheet source found for role: {role}")

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

def slugify_key(value):
    return "".join(ch for ch in (value or "").lower() if ch.isalnum())

def load_catalog():
    if use_postgres_source():
        pages = postgres_query(
            """
            SELECT id, page_name, page_type
            FROM pages
            WHERE user_id = %s
            ORDER BY id
            """,
            (ACTIVE_USER_ID,),
        )
        pages = [
            {
                "id": row["id"],
                "key": slugify_key(row.get("page_name")),
                "name": row.get("page_name") or f"Page {row['id']}",
                "type": row.get("page_type") or "",
            }
            for row in unique_rows_by_id(pages)
        ]
        return {
            "pages": pages,
            "spreadsheets": catalog_spreadsheets(get_db_spreadsheets()),
        }

    if use_bigquery_source():
        pages = bq_query(
            f"""
            SELECT id, page_name, page_type
            FROM {bq_table("pages")}
            WHERE user_id = @user_id
            ORDER BY id
            """,
            [bigquery.ScalarQueryParameter("user_id", "INT64", ACTIVE_USER_ID)],
        )
        pages = [
            {
                "id": row["id"],
                "key": slugify_key(row.get("page_name")),
                "name": row.get("page_name") or f"Page {row['id']}",
                "type": row.get("page_type") or "",
            }
            for row in unique_rows_by_id(pages)
        ]
        return {
            "pages": pages,
            "spreadsheets": catalog_spreadsheets(get_bq_spreadsheets()),
        }

    local_sources = local_spreadsheet_sources()
    pages = []
    if any(source["page_id"] == "cs6040" for source in local_sources):
        pages.append({"id": "cs6040", "key": "cs6040", "name": "CS 6040", "type": "course"})
    if any(source["page_id"] == "mgmt6201" for source in local_sources):
        pages.append({"id": "mgmt6201", "key": "mgmt6201", "name": "MGMT 6201", "type": "course"})
    return {
        "pages": pages,
        "spreadsheets": catalog_spreadsheets(local_sources),
    }

def load_db_ctrl_c_prompts():
    if not use_postgres_source():
        return None
    rows = postgres_query(
        """
        SELECT id, prompt_name, prompt_text
        FROM ctrl_c_prompts
        WHERE page_id IN (SELECT id FROM pages WHERE user_id = %s)
        ORDER BY id
        """,
        (ACTIVE_USER_ID,),
    )
    return prompt_rows_to_json(rows)

def load_bq_ctrl_c_prompts():
    if not use_bigquery_source():
        return None
    rows = bq_query(
        f"""
        SELECT id, prompt_name, prompt_text
        FROM {bq_table("ctrl_c_prompts")}
        WHERE page_id IN (
          SELECT id
          FROM {bq_table("pages")}
          WHERE user_id = @user_id
        )
        ORDER BY id
        """,
        [bigquery.ScalarQueryParameter("user_id", "INT64", ACTIVE_USER_ID)],
    )
    return prompt_rows_to_json(rows)

def catalog_spreadsheets(spreadsheet_rows):
    return [
        {
            "id": row["id"],
            "pageId": row.get("page_id"),
            "key": slugify_key(row.get("spreadsheet_name")),
            "name": row.get("spreadsheet_name") or Path(row.get("filename") or "").stem,
            "filename": row.get("filename") or "",
            "type": row.get("spreadsheet_type") or "csv",
            "role": row.get("role") or "",
        }
        for row in spreadsheet_rows
    ]

def prompt_rows_to_json(rows):
    prompts = []
    for index, row in enumerate(rows, start=1):
        row_id = row.get("id") or index
        key = row.get("prompt_name") or f"prompt_{row_id}"
        prompts.append({
            "id": f"ctrl-c-{row_id}",
            "key": key,
            "label": key.replace("_", " ").strip().title(),
            "text": row.get("prompt_text") or "",
        })
    return prompts

def email_is_allowed(email):
    normalized = (email or "").strip().lower()
    if not normalized:
        return False
    if OAUTH_ALLOWED_EMAILS and normalized not in OAUTH_ALLOWED_EMAILS:
        return False
    if OAUTH_ALLOWED_DOMAIN and not normalized.endswith(f"@{OAUTH_ALLOWED_DOMAIN}"):
        return False
    return True

def current_user():
    return session.get("user")

def save_oauth_user(user):
    if not user.get("google_sub"):
        return
    postgres_execute(
        """
        INSERT INTO users (google_sub, email, name)
        VALUES (%s, %s, %s)
        ON CONFLICT (google_sub)
        DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
        """,
        (user.get("google_sub"), user.get("email") or "", user.get("name") or ""),
    )

@newdashboard_bp.before_request
def require_oauth_login():
    if not AUTH_ENABLED:
        return None

    public_endpoints = {"login", "google_login", "google_callback", "static"}
    if request.endpoint in public_endpoints:
        return None
    if request.path.startswith("/static/"):
        return None
    if current_user():
        return None
    if request.path.startswith("/api/"):
        return jsonify({"error": "login_required"}), 401
    return redirect(url_for("newdashboard.login", next=request.full_path if request.query_string else request.path))

def load_ctrl_c_prompts():
    db_prompts = load_db_ctrl_c_prompts()
    if db_prompts is not None:
        return db_prompts
    bq_prompts = load_bq_ctrl_c_prompts()
    if bq_prompts is not None:
        return bq_prompts
    path = DATA_DIR / "ctrl_c_prompts.csv"
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8-sig")
    if "$$COLUMN_SPLITTER$$" in text:
        header_text, _, body = text.partition("$$ROW_SPLITTER$$")
        headers = [header.strip() for header in header_text.split("$$COLUMN_SPLITTER$$") if header.strip()]
        values = body.split("$$COLUMN_SPLITTER$$")
        return prompt_rows_to_json([
            {
                "id": index + 1,
                "prompt_name": header,
                "prompt_text": values[index].strip() if index < len(values) else "",
            }
            for index, header in enumerate(headers)
        ])
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return prompt_rows_to_json(list(csv.DictReader(f)))

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
    function_rows = read_rows("functions")
    param_rows = read_rows("parameters")

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
    rows = read_rows("syntax")
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

def load_mgmt_6201_rows():
    ensure_source("terms")
    rows = read_rows("terms")
    terms = []
    for idx, row in enumerate(rows, start=1):
        terms.append({
            "id": f"m-{idx}",
            "term": get_row_value(row, "term", "Term").strip(),
            "definition": get_row_value(row, "definition", "Definition").strip(),
            "dependencies": get_row_value(row, "dependencies", "Dependencies").strip(),
        })
    return terms

def load_productivity():
    study_logs = {}
    notes = {}
    if use_postgres_source():
        rows = postgres_query(
            """
            SELECT date, hours, notes
            FROM study_habits
            WHERE user_id = %s
            ORDER BY date
            """,
            (ACTIVE_USER_ID,),
        )
        for row in rows:
            date_key = row["date"].isoformat() if hasattr(row.get("date"), "isoformat") else str(row.get("date"))
            study_logs[date_key] = float(row.get("hours") or 0)
            notes[date_key] = row.get("notes") or ""
        return {"studyLogs": study_logs, "notes": notes}

    if use_bigquery_source():
        rows = bq_query(
            f"""
            SELECT date, hours, notes
            FROM {bq_table("study_habits")}
            WHERE user_id = @user_id
            ORDER BY date
            """,
            [bigquery.ScalarQueryParameter("user_id", "INT64", ACTIVE_USER_ID)],
        )
        for row in rows:
            date_key = row["date"].isoformat() if hasattr(row.get("date"), "isoformat") else str(row.get("date"))
            study_logs[date_key] = float(row.get("hours") or 0)
            notes[date_key] = row.get("notes") or ""
        return {"studyLogs": study_logs, "notes": notes}

    for row in read_rows("study_log"):
        date = (get_row_value(row, "Date", "date") or "").strip()
        if not date:
            continue
        try:
            study_logs[date] = float(get_row_value(row, "Hours", "hours") or 0)
        except ValueError:
            study_logs[date] = 0
        notes[date] = get_row_value(row, "Notes", "notes", "Note", "note") or ""

    return {"studyLogs": study_logs, "notes": notes}

def load_study_log_events_from_postgres():
    rows = postgres_query(
        """
        SELECT
          h.user_id,
          COALESCE(NULLIF(u.name, ''), u.email, CONCAT('User ', h.user_id)) AS user_name,
          h.date,
          h.hours
        FROM study_habits h
        LEFT JOIN users u ON u.id = h.user_id
        ORDER BY h.user_id, h.date
        """
    )

    events = []
    for row in rows:
        log_date = row["date"].isoformat() if hasattr(row.get("date"), "isoformat") else str(row.get("date"))
        events.append({
            "userId": row.get("user_id"),
            "name": row.get("user_name") or f"User {row.get('user_id')}",
            "date": log_date,
            "hours": float(row.get("hours") or 0),
        })
    return events

def load_study_log_events_from_bigquery():
    rows = bq_query(
        f"""
        SELECT
          h.user_id,
          COALESCE(NULLIF(u.name, ''), u.email, CONCAT('User ', CAST(h.user_id AS STRING))) AS user_name,
          h.date,
          h.hours
        FROM {bq_table("study_habits")} h
        LEFT JOIN {bq_table("users")} u ON u.id = h.user_id
        ORDER BY h.user_id, h.date
        """
    )

    events = []
    for row in rows:
        log_date = row["date"].isoformat() if hasattr(row.get("date"), "isoformat") else str(row.get("date"))
        events.append({
            "userId": row.get("user_id"),
            "name": row.get("user_name") or f"User {row.get('user_id')}",
            "date": log_date,
            "hours": float(row.get("hours") or 0),
        })
    return events

def load_study_log_events_from_local():
    productivity = load_productivity()
    events = []
    for date_key, hours in (productivity.get("studyLogs") or {}).items():
        events.append({
            "userId": ACTIVE_USER_ID,
            "name": "You",
            "date": date_key,
            "hours": float(hours or 0),
        })
    return events

def study_people_from_events(events, today):
    by_user = {}
    for event in events:
        user_id = event.get("userId")
        if user_id is None:
            continue
        person = by_user.setdefault(user_id, {
            "userId": user_id,
            "name": event.get("name") or f"User {user_id}",
            "logs": {},
        })
        if event.get("name"):
            person["name"] = event.get("name")
        person["logs"][event.get("date")] = person["logs"].get(event.get("date"), 0) + float(event.get("hours") or 0)

    people = []
    for person in by_user.values():
        people.append({
            "userId": person["userId"],
            "name": person["name"],
            **build_period_stats(person["logs"], today),
        })
    return sorted(people, key=lambda person: person["userId"])

def load_study_people_from_bigquery(today):
    events = (
        load_study_log_events_from_postgres()
        if use_postgres_source()
        else load_study_log_events_from_local()
    )
    logs_json = json.dumps(events)
    return bq_query(
        """
        WITH parsed_logs AS (
          SELECT
            SAFE_CAST(JSON_VALUE(item, '$.userId') AS INT64) AS user_id,
            JSON_VALUE(item, '$.name') AS user_name,
            SAFE_CAST(JSON_VALUE(item, '$.date') AS DATE) AS log_date,
            SAFE_CAST(JSON_VALUE(item, '$.hours') AS FLOAT64) AS hours
          FROM UNNEST(JSON_QUERY_ARRAY(@logs_json)) AS item
        )
        SELECT
          user_id AS userId,
          ANY_VALUE(user_name) AS name,
          ROUND(SUM(IF(log_date = @today, COALESCE(hours, 0), 0)), 2) AS todayHours,
          ROUND(SUM(IF(log_date BETWEEN DATE_SUB(@today, INTERVAL 6 DAY) AND @today, COALESCE(hours, 0), 0)), 2) AS weekHours,
          ROUND(SUM(IF(log_date BETWEEN DATE_SUB(@today, INTERVAL 13 DAY) AND DATE_SUB(@today, INTERVAL 7 DAY), COALESCE(hours, 0), 0)), 2) AS previousWeekHours,
          ROUND(
            SUM(IF(log_date BETWEEN DATE_SUB(@today, INTERVAL 6 DAY) AND @today, COALESCE(hours, 0), 0))
            - SUM(IF(log_date BETWEEN DATE_SUB(@today, INTERVAL 13 DAY) AND DATE_SUB(@today, INTERVAL 7 DAY), COALESCE(hours, 0), 0)),
            2
          ) AS delta
        FROM parsed_logs
        WHERE log_date IS NOT NULL
        GROUP BY user_id
        ORDER BY user_id
        """,
        [
            bigquery.ScalarQueryParameter("logs_json", "STRING", logs_json),
            bigquery.ScalarQueryParameter("today", "DATE", today.isoformat()),
        ],
    )

def build_period_stats(logs, today):
    current_week_start = today - timedelta(days=6)
    previous_week_start = today - timedelta(days=13)
    previous_week_end = today - timedelta(days=7)
    today_hours = logs.get(today.isoformat(), 0)
    week_hours = sum_date_range(logs, current_week_start, today)
    previous_week_hours = sum_date_range(logs, previous_week_start, previous_week_end)
    delta = week_hours - previous_week_hours
    return {
        "todayHours": round(today_hours, 2),
        "weekHours": round(week_hours, 2),
        "previousWeekHours": round(previous_week_hours, 2),
        "delta": round(delta, 2),
        "trend": "improved" if delta > 0 else "declined" if delta < 0 else "no_change",
    }

def load_study_stats(anchor_date=None, active_user_id=None):
    today = anchor_date or date.today()
    active_user_id = active_user_id or ACTIVE_USER_ID
    if use_bigquery_analytics():
        stats_rows = load_study_people_from_bigquery(today)
        people = []
        for row in stats_rows:
            delta = float(row.get("delta") or 0)
            people.append({
                "userId": row.get("userId"),
                "name": row.get("name") or f"User {row.get('userId')}",
                "todayHours": float(row.get("todayHours") or 0),
                "weekHours": float(row.get("weekHours") or 0),
                "previousWeekHours": float(row.get("previousWeekHours") or 0),
                "delta": delta,
                "trend": "improved" if delta > 0 else "declined" if delta < 0 else "no_change",
            })
    elif require_bigquery_analytics():
        raise RuntimeError(
            "BigQuery analytics is required. Install google-cloud-bigquery, set credentials, "
            "and keep STUDY_DASHBOARD_USE_BIGQUERY enabled."
        )
    elif use_postgres_source():
        people = study_people_from_events(load_study_log_events_from_postgres(), today)
    elif use_bigquery_source():
        people = study_people_from_events(load_study_log_events_from_bigquery(), today)
    else:
        productivity = load_productivity()
        people = [{
            "userId": active_user_id,
            "name": "You",
            **build_period_stats(productivity.get("studyLogs", {}), today),
        }]

    active_user = next((person for person in people if person["userId"] == active_user_id), None)
    all_friends = [person for person in people if person["userId"] != active_user_id]
    friends = sorted(all_friends, key=lambda item: ((item["userId"] * 1103515245 + today.toordinal()) % 2147483647))[:12]

    return {
        "date": today.isoformat(),
        "global": {
            "users": len(people),
            "activeToday": sum(1 for person in people if person["todayHours"] > 0),
            "avgTodayHours": round(average(person["todayHours"] for person in people), 2),
            "avgWeekHours": round(average(person["weekHours"] for person in people), 2),
            "avgPreviousWeekHours": round(average(person["previousWeekHours"] for person in people), 2),
            "avgDelta": round(average(person["delta"] for person in people), 2),
        },
        "you": active_user or {"userId": active_user_id, "name": "You", **build_period_stats({}, today)},
        "friends": friends,
        "friendCount": len(all_friends),
        "friendAverages": {
            "avgTodayHours": round(average(person["todayHours"] for person in all_friends), 2),
            "avgWeekHours": round(average(person["weekHours"] for person in all_friends), 2),
            "avgPreviousWeekHours": round(average(person["previousWeekHours"] for person in all_friends), 2),
            "avgDelta": round(average(person["delta"] for person in all_friends), 2),
        },
    }

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
            "url": url_for("newdashboard.serve_note_pdf", filename=pdf_path.name),
        })
    return pdfs

def load_note_titles():
    titles = {}
    if not NOTE_TITLES_CSV.exists():
        return titles
    with open(NOTE_TITLES_CSV, "r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
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
    if use_postgres_source():
        existing = postgres_query(
            """
            SELECT hours, notes
            FROM study_habits
            WHERE user_id = %s AND date = %s
            LIMIT 1
            """,
            (ACTIVE_USER_ID, date),
        )
        current_hours = existing[0].get("hours") if existing else 0
        current_note = existing[0].get("notes") if existing else ""
        next_hours = hours if hours is not None else current_hours
        next_note = note if note is not None else (current_note or "")

        updated = postgres_execute(
            """
            UPDATE study_habits
            SET hours = %s, notes = %s
            WHERE user_id = %s AND date = %s
            """,
            (next_hours, next_note, ACTIVE_USER_ID, date),
        )
        if existing:
            return

        postgres_execute(
            """
            INSERT INTO study_habits (user_id, date, hours, notes)
            VALUES (%s, %s, %s, %s)
            """,
            (ACTIVE_USER_ID, date, next_hours, next_note),
        )
        return

    if use_bigquery_source():
        existing = bq_query(
            f"""
            SELECT hours, notes
            FROM {bq_table("study_habits")}
            WHERE user_id = @user_id AND date = @date
            LIMIT 1
            """,
            [
                bigquery.ScalarQueryParameter("user_id", "INT64", ACTIVE_USER_ID),
                bigquery.ScalarQueryParameter("date", "DATE", date),
            ],
        )
        current_hours = existing[0].get("hours") if existing else 0
        current_note = existing[0].get("notes") if existing else ""
        next_hours = hours if hours is not None else current_hours
        next_note = note if note is not None else (current_note or "")

        bq_execute(
            f"""
            MERGE {bq_table("study_habits")} AS target
            USING (
              SELECT
                @user_id AS user_id,
                @date AS date,
                @hours AS hours,
                @notes AS notes
            ) AS source
            ON target.user_id = source.user_id AND target.date = source.date
            WHEN MATCHED THEN
              UPDATE SET hours = source.hours, notes = source.notes
            WHEN NOT MATCHED THEN
              INSERT (user_id, date, hours, notes)
              VALUES (source.user_id, source.date, source.hours, source.notes)
            """,
            [
                bigquery.ScalarQueryParameter("user_id", "INT64", ACTIVE_USER_ID),
                bigquery.ScalarQueryParameter("date", "DATE", date),
                bigquery.ScalarQueryParameter("hours", "FLOAT64", float(next_hours or 0)),
                bigquery.ScalarQueryParameter("notes", "STRING", next_note or ""),
            ],
        )
        return

    ensure_source("study_log")
    rows = read_rows("study_log")
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

    write_rows("study_log", normalized_rows, SPREADSHEET_PROFILES["study_log"]["headers"])

def upsert_hours(date, hours):
    upsert_study_log(date, hours=hours)

def upsert_note(date, note):
    upsert_study_log(date, note=note)

def delete_study_day(date):
    if use_postgres_source():
        postgres_execute(
            """
            DELETE FROM study_habits
            WHERE user_id = %s AND date = %s
            """,
            (ACTIVE_USER_ID, date),
        )
        return

    if use_bigquery_source():
        bq_execute(
            f"""
            DELETE FROM {bq_table("study_habits")}
            WHERE user_id = @user_id AND date = @date
            """,
            [
                bigquery.ScalarQueryParameter("user_id", "INT64", ACTIVE_USER_ID),
                bigquery.ScalarQueryParameter("date", "DATE", date),
            ],
        )
        return

    ensure_source("study_log")
    rows = read_rows("study_log")
    kept_rows = []
    for row in rows:
        row_date = (get_row_value(row, "Date", "date") or "").strip()
        if row_date != date:
            kept_rows.append({
                "Date": row_date,
                "Hours": str(get_row_value(row, "Hours", "hours") or 0),
                "Notes": get_row_value(row, "Notes", "notes", "Note", "note") or ""
            })
    write_rows("study_log", kept_rows, SPREADSHEET_PROFILES["study_log"]["headers"])

def import_function_rows(text):
    ensure_source("functions")
    existing_rows = read_rows("functions")
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
        write_rows("functions", existing_rows + inserted_rows, FUNCTIONS_HEADERS)

    return {
        "inserted": len(inserted_rows),
        "duplicates": sorted(set(filter(None, duplicate_methods)), key=str.lower),
    }

def import_parameter_rows(text):
    ensure_source("parameters")
    existing_rows = read_rows("parameters")
    new_rows = parse_headerless_csv_rows(text, PARAMS_HEADERS)

    if new_rows:
        write_rows("parameters", existing_rows + new_rows, PARAMS_HEADERS)

    return {"inserted": len(new_rows)}

def import_question_rows(text):
    ensure_source("case_scenarios")
    existing_rows = read_case_scenario_rows()
    new_rows = parse_headerless_csv_rows(text, CASE_SCENARIO_HEADERS)

    if new_rows:
        write_rows("case_scenarios", existing_rows + new_rows, CASE_SCENARIO_HEADERS)

    return {"inserted": len(new_rows)}

def import_syntax_rows(text):
    ensure_source("syntax")
    existing_rows = read_rows("syntax")
    new_rows = parse_headerless_csv_rows(text, SYNTAX_HEADERS)

    if new_rows:
        write_rows("syntax", existing_rows + new_rows, SYNTAX_HEADERS)

    return {"inserted": len(new_rows)}

def import_mgmt_6201_rows(text):
    ensure_source("terms")
    existing_rows = read_rows("terms")
    new_rows = parse_headerless_csv_rows(text, MGMT_6201_HEADERS)

    if new_rows:
        write_rows("terms", existing_rows + new_rows, MGMT_6201_HEADERS)

    return {"inserted": len(new_rows)}

@newdashboard_bp.get("/login")
def login():
    if not AUTH_ENABLED:
        return redirect(url_for("newdashboard.index"))
    if current_user():
        return redirect(request.args.get("next") or url_for("newdashboard.index"))
    return render_template("study-dashboard/login.html")

@newdashboard_bp.get("/auth/google")
def google_login():
    if not AUTH_ENABLED or oauth is None:
        return redirect(url_for("newdashboard.index"))
    session["next_url"] = request.args.get("next") or url_for("newdashboard.index")
    redirect_uri = OAUTH_REDIRECT_URI or url_for("newdashboard.google_callback", _external=True)
    return oauth.google.authorize_redirect(redirect_uri)

@newdashboard_bp.get("/auth/google/callback")
@newdashboard_bp.get("/login/google/authorized")
def google_callback():
    if not AUTH_ENABLED or oauth is None:
        return redirect(url_for("newdashboard.index"))

    token = oauth.google.authorize_access_token()
    userinfo = token.get("userinfo")
    if not userinfo:
        userinfo = oauth.google.userinfo(token=token)

    email = (userinfo.get("email") or "").strip().lower()
    if not email_is_allowed(email):
        abort(403)

    user = {
        "google_sub": userinfo.get("sub"),
        "email": email,
        "name": userinfo.get("name") or email,
        "picture": userinfo.get("picture") or "",
    }
    session["user"] = user
    save_oauth_user(user)
    return redirect(session.pop("next_url", None) or url_for("newdashboard.index"))

@newdashboard_bp.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("newdashboard.login" if AUTH_ENABLED else "newdashboard.index"))

@newdashboard_bp.get("/api/me")
def api_me():
    return jsonify({"authEnabled": AUTH_ENABLED, "user": current_user()})

@newdashboard_bp.get("/api/data-source")
def api_data_source():
    return jsonify({
        "source": configured_db_source(),
        "analyticsEngine": configured_analytics_engine(),
        "analyticsConfigured": ANALYTICS_ENGINE,
        "configured": DATA_SOURCE,
        "postgresAvailable": POSTGRES_AVAILABLE,
        "postgresUrlSet": bool(POSTGRES_URL),
        "postgresUrlSource": postgres_url_source(),
        "bigQueryAvailable": BQ_AVAILABLE,
        "bigQueryEnabled": USE_BIGQUERY,
        "bigQueryCredentialsSource": bigquery_credentials_source(),
        "project": BQ_PROJECT if BQ_AVAILABLE else "",
        "dataset": BQ_DATASET if BQ_AVAILABLE else "",
        "localDataDir": str(DATA_DIR),
    })

@newdashboard_bp.get("/api/health")
def api_health():
    return jsonify({
        "source": configured_db_source(),
        "analyticsEngine": configured_analytics_engine(),
        "configured": DATA_SOURCE,
        "analyticsConfigured": ANALYTICS_ENGINE,
        "postgres": postgres_health(),
        "bigQuery": bigquery_health(),
    })

@newdashboard_bp.route("/study-dashboard")
def index():
    return render_template("study-dashboard/index.html")

@newdashboard_bp.route("/newdashboard")
def newdashboard_redirect():
    return redirect(url_for("newdashboard.index"), code=301)

@newdashboard_bp.route("/my_dashboard")
def my_dashboard_redirect():
    return redirect(url_for("newdashboard.index"), code=301)

@newdashboard_bp.get("/api/catalog")
def api_catalog():
    return jsonify(load_catalog())

@newdashboard_bp.get("/api/flashcards")
def api_flashcards():
    return jsonify(load_flashcards())

@newdashboard_bp.get("/api/case-scenarios")
def api_case_scenarios():
    return jsonify(load_case_scenarios())

@newdashboard_bp.get("/api/syntax")
def api_syntax():
    return jsonify(load_syntax_rows())

@newdashboard_bp.get("/api/mgmt-6201")
def api_mgmt_6201():
    return jsonify(load_mgmt_6201_rows())

@newdashboard_bp.get("/api/terms")
def api_terms():
    return jsonify(load_mgmt_6201_rows())

@newdashboard_bp.get("/api/productivity")
def api_productivity():
    return jsonify(load_productivity())

@newdashboard_bp.get("/api/study-stats")
def api_study_stats():
    date_arg = (request.args.get("date") or "").strip()
    user_id_arg = (request.args.get("userId") or "").strip()

    anchor_date = None
    if date_arg:
        try:
            anchor_date = date.fromisoformat(date_arg)
        except ValueError:
            return jsonify({"error": "date must use YYYY-MM-DD"}), 400

    active_user_id = ACTIVE_USER_ID
    if user_id_arg:
        try:
            active_user_id = int(user_id_arg)
        except ValueError:
            return jsonify({"error": "userId must be an integer"}), 400

    return jsonify(load_study_stats(anchor_date=anchor_date, active_user_id=active_user_id))

@newdashboard_bp.get("/api/ctrl-c-prompts")
def api_ctrl_c_prompts():
    return jsonify(load_ctrl_c_prompts())

@newdashboard_bp.get("/api/notes")
def api_notes():
    return jsonify(load_note_pdfs())

@newdashboard_bp.get("/notes/<path:filename>")
def serve_note_pdf(filename):
    requested = Path(filename).name
    if not requested.lower().endswith(".pdf"):
        abort(404)

    file_path = NOTES_DIR / requested
    if not file_path.exists():
        abort(404)

    return send_from_directory(NOTES_DIR, requested)

@newdashboard_bp.post("/api/productivity/log")
def api_productivity_log():
    payload = request.get_json(force=True)
    date = (payload.get("date") or "").strip()
    hours = float(payload.get("hours") or 0)
    upsert_hours(date, hours)
    return jsonify({"ok": True})

@newdashboard_bp.post("/api/productivity/note")
def api_productivity_note():
    payload = request.get_json(force=True)
    date = (payload.get("date") or "").strip()
    note = payload.get("note") or ""
    upsert_note(date, note)
    return jsonify({"ok": True})

@newdashboard_bp.post("/api/productivity/delete")
def api_productivity_delete():
    payload = request.get_json(force=True)
    date = (payload.get("date") or "").strip()
    delete_study_day(date)
    return jsonify({"ok": True})

@newdashboard_bp.post("/api/import/functions")
def api_import_functions():
    payload = request.get_json(force=True)
    result = import_function_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

@newdashboard_bp.post("/api/import/parameters")
def api_import_parameters():
    payload = request.get_json(force=True)
    result = import_parameter_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

@newdashboard_bp.post("/api/import/questions")
def api_import_questions():
    payload = request.get_json(force=True)
    result = import_question_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

@newdashboard_bp.post("/api/import/syntax")
def api_import_syntax():
    payload = request.get_json(force=True)
    result = import_syntax_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

@newdashboard_bp.post("/api/import/mgmt-6201")
def api_import_mgmt_6201():
    payload = request.get_json(force=True)
    result = import_mgmt_6201_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

@newdashboard_bp.post("/api/import/terms")
def api_import_terms():
    payload = request.get_json(force=True)
    result = import_mgmt_6201_rows(payload.get("text") or "")
    return jsonify({"ok": True, **result})

my_dashboard_bp = newdashboard_bp



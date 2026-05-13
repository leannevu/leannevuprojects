from pathlib import Path

from flask import Blueprint, jsonify, render_template, request
import pandas as pd

scrum_bp = Blueprint("scrum", __name__)

## SCRUM project
## optimization project routes
@scrum_bp.route('/scrum')
def scrum():
    return render_template('scrum/index.html')

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

USER_STORY_FILE = DATA_DIR / "scrum/user_story.csv"
EMPLOYEE_FILE = DATA_DIR / "scrum/employee.csv"
ASSIGN_FILE = DATA_DIR / "scrum/assign_user_story.csv"
SPRINT_FILE = DATA_DIR / "scrum/sprint.csv"


def load_csv(path: Path) -> pd.DataFrame:
    """Load a CSV into a DataFrame. Return empty DataFrame if missing."""
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def save_csv(df: pd.DataFrame, path: Path) -> None:
    """Save DataFrame back to CSV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)


@scrum_bp.route("/api/fetch_sprint", methods=["POST"])
def fetch_sprint():
    sprint_df = load_csv(SPRINT_FILE)

    if sprint_df.empty:
        return jsonify([])

    if "current_sprint" not in sprint_df.columns:
        return jsonify({"error": "sprint.csv missing current_sprint column"}), 500

    current = sprint_df[sprint_df["current_sprint"].astype(str) == "Yes"]

    if current.empty:
        return jsonify([])

    return jsonify(current.to_dict(orient="records"))


@scrum_bp.route("/api/fetch_sprint_stories", methods=["POST"])
def fetch_sprint_stories():
    selected_status = request.form.get("itemText")

    user_story_df = load_csv(USER_STORY_FILE)

    if user_story_df.empty:
        return jsonify([])

    required_cols = {"user_story_name", "current_sprint", "status"}
    if not required_cols.issubset(user_story_df.columns):
        return jsonify({
            "error": f"user_story.csv missing required columns: {sorted(required_cols)}"
        }), 500

    stories = user_story_df[user_story_df["current_sprint"].astype(str) == "Yes"].copy()

    if selected_status and selected_status != "All":
        stories = stories[stories["status"].astype(str) == selected_status]

    return jsonify(stories.to_dict(orient="records"))


@scrum_bp.route("/api/fetch_assign_members", methods=["POST"])
def fetch_assign_members():
    user_story_name = request.form.get("itemText")

    if not user_story_name:
        return jsonify({"error": "Missing itemText"}), 400

    assign_df = load_csv(ASSIGN_FILE)
    employee_df = load_csv(EMPLOYEE_FILE)

    if assign_df.empty or employee_df.empty:
        return jsonify([])

    required_assign_cols = {"employee_id", "user_story_name"}
    required_employee_cols = {"employee_id", "employee_name", "role"}

    if not required_assign_cols.issubset(assign_df.columns):
        return jsonify({
            "error": f"assign_user_story.csv missing required columns: {sorted(required_assign_cols)}"
        }), 500

    if not required_employee_cols.issubset(employee_df.columns):
        return jsonify({
            "error": f"employee.csv missing required columns: {sorted(required_employee_cols)}"
        }), 500

    assign_df["employee_id"] = assign_df["employee_id"].astype(str)
    employee_df["employee_id"] = employee_df["employee_id"].astype(str)

    assigned = assign_df[assign_df["user_story_name"].astype(str) == user_story_name]

    if assigned.empty:
        return jsonify([])

    merged = assigned.merge(employee_df, on="employee_id", how="inner")

    return jsonify(merged.to_dict(orient="records"))


@scrum_bp.route("/api/fetch_story_points", methods=["POST"])
def fetch_story_points():
    user_story_name = request.form.get("itemText")

    if not user_story_name:
        return jsonify({"error": "Missing itemText"}), 400

    user_story_df = load_csv(USER_STORY_FILE)

    if user_story_df.empty:
        return jsonify([])

    required_cols = {"user_story_name", "story_points", "status"}
    if not required_cols.issubset(user_story_df.columns):
        return jsonify({
            "error": f"user_story.csv missing required columns: {sorted(required_cols)}"
        }), 500

    story = user_story_df[user_story_df["user_story_name"].astype(str) == user_story_name]

    if story.empty:
        return jsonify([])

    return jsonify(story.to_dict(orient="records"))


@scrum_bp.route("/api/update_status", methods=["POST"])
def update_status():
    new_status = request.form.get("newStatusText")
    user_story_name = request.form.get("userStoryText")

    if not new_status or not user_story_name:
        return jsonify({
            "status": "error",
            "message": "Missing newStatusText or userStoryText"
        }), 400

    user_story_df = load_csv(USER_STORY_FILE)

    if user_story_df.empty:
        return jsonify({
            "status": "error",
            "message": "user_story.csv not found or empty"
        }), 404

    if "user_story_name" not in user_story_df.columns or "status" not in user_story_df.columns:
        return jsonify({
            "status": "error",
            "message": "user_story.csv missing required columns"
        }), 500

    mask = user_story_df["user_story_name"].astype(str) == user_story_name

    if not mask.any():
        return jsonify({
            "status": "error",
            "message": "User story not found"
        }), 404

    user_story_df.loc[mask, "status"] = new_status
    save_csv(user_story_df, USER_STORY_FILE)

    return jsonify({
        "status": "success",
        "message": "Status updated successfully"
    })


@scrum_bp.route("/api/update_phase", methods=["POST"])
def update_phase():
    new_phase = request.form.get("newPhaseText")
    phase_number = request.form.get("phaseNumberText")

    if not new_phase or not phase_number:
        return jsonify({
            "status": "error",
            "message": "Missing newPhaseText or phaseNumberText"
        }), 400

    sprint_df = load_csv(SPRINT_FILE)

    if sprint_df.empty:
        return jsonify({
            "status": "error",
            "message": "sprint.csv not found or empty"
        }), 404

    if "phase_number" not in sprint_df.columns or "phase" not in sprint_df.columns:
        return jsonify({
            "status": "error",
            "message": "sprint.csv missing required columns"
        }), 500

    sprint_df["phase_number"] = sprint_df["phase_number"].astype(str)
    mask = sprint_df["phase_number"] == str(phase_number)

    if not mask.any():
        return jsonify({
            "status": "error",
            "message": "Sprint phase_number not found"
        }), 404

    sprint_df.loc[mask, "phase"] = new_phase
    save_csv(sprint_df, SPRINT_FILE)

    return jsonify({
        "status": "success",
        "message": "Phase updated successfully"
    })


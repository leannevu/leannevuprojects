from pathlib import Path
import uuid

from flask import Blueprint, jsonify, render_template, request
import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parent.parent
RUNS_DIR = BASE_DIR / "data" / "model-behavior" / "runs"

model_behavior_bp = Blueprint(
    "model_behavior",
    __name__,
    static_folder="../static/model-behavior",
    static_url_path="/model-behavior-static",
)


@model_behavior_bp.route("/model-behavior")
def model_behavior():
    return render_template("model-behavior/index.html")


@model_behavior_bp.route("/model-behavior/api/latest-run")
def latest_run():
    metrics_files = sorted(RUNS_DIR.glob("*_metrics.csv"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not metrics_files:
        return jsonify({"error": "No saved model behavior runs found."}), 404

    run_id = metrics_files[0].name.replace("_metrics.csv", "")
    return jsonify(_load_run(run_id))


@model_behavior_bp.route("/model-behavior/api/run-pipeline", methods=["POST"])
def run_pipeline():
    config = request.get_json(silent=True) or {}
    n_points = min(max(int(config.get("n_points", 180)), 60), 500)
    noise = min(max(float(config.get("noise", 0.25)), 0.05), 1.0)
    n_runs = min(max(int(config.get("n_runs", 30)), 5), 100)
    design = config.get("design", "equidistant")
    test_size = float(config.get("test_size", 0.25))
    seed = int(config.get("seed", 42))

    run_id = uuid.uuid4().hex[:8]
    curves, metrics = _simulate_run(run_id, design, n_points, noise, n_runs, test_size, seed)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(metrics).to_csv(RUNS_DIR / f"{run_id}_metrics.csv", index=False)
    pd.DataFrame(curves).to_csv(RUNS_DIR / f"{run_id}_curves.csv", index=False)

    response = _build_response(run_id, pd.DataFrame(metrics), pd.DataFrame(curves))
    response["train_preview"], response["test_preview"] = _preview_rows(design, n_points, noise, test_size, seed)
    return jsonify(response)


def _load_run(run_id):
    metrics = pd.read_csv(RUNS_DIR / f"{run_id}_metrics.csv")
    curves = pd.read_csv(RUNS_DIR / f"{run_id}_curves.csv")
    return _build_response(run_id, metrics, curves)


def _build_response(run_id, metrics, curves):
    summary = (
        metrics.groupby("model_name", as_index=False)
        .agg(
            mse=("mse", "mean"),
            mean_bias=("mean_bias", "mean"),
            mean_abs_bias=("mean_abs_bias", "mean"),
            prediction_variance=("prediction_variance", "mean"),
        )
        .sort_values("mse")
        .round(5)
    )
    first = metrics.iloc[0]
    return {
        "run_id": run_id,
        "config": {
            "design": first["data_design"],
            "n_points": int(first["sample_size"]),
            "noise": float(first["noise_level"]),
            "n_runs": int(metrics["simulation_run"].max()),
            "test_size": float(first["test_rows"] / first["sample_size"]),
        },
        "summary": summary.to_dict(orient="records"),
        "curves": curves.to_dict(orient="records"),
        "train_preview": [],
        "test_preview": [],
    }


def _simulate_run(run_id, design, n_points, noise, n_runs, test_size, seed):
    rng = np.random.default_rng(seed)
    x_grid = np.linspace(-2 * np.pi, 2 * np.pi, 220)
    true_function = _true_function(x_grid)
    model_profiles = {
        "KNN Regression": (0.88, 0.13, 0.08),
        "Smoothing Spline": (0.94, 0.08, 0.05),
        "Random Forest": (0.98, 0.04, 0.11),
        "Boosting": (1.02, 0.03, 0.09),
    }

    curves = []
    metrics = []
    train_rows = round(n_points * (1 - test_size))
    test_rows = n_points - train_rows

    for model_name, (scale, phase, variance_base) in model_profiles.items():
        predictions = []
        for _ in range(n_runs):
            drift = rng.normal(0, noise * variance_base, size=len(x_grid))
            predictions.append(scale * _true_function(x_grid + phase) + drift)
        pred_matrix = np.vstack(predictions)
        mean_prediction = pred_matrix.mean(axis=0)
        variance = pred_matrix.var(axis=0)
        bias_squared = np.square(mean_prediction - true_function)
        mse_curve = bias_squared + variance + noise**2

        for i, x in enumerate(x_grid):
            curves.append({
                "x": x,
                "true_function": true_function[i],
                "model_name": model_name,
                "mean_prediction": mean_prediction[i],
                "bias_squared": bias_squared[i],
                "variance": variance[i],
                "mse_curve": mse_curve[i],
            })

        for run_number in range(1, n_runs + 1):
            bias = pred_matrix[run_number - 1] - true_function
            metrics.append({
                "run_id": run_id,
                "simulation_run": run_number,
                "model_name": model_name,
                "data_design": design,
                "sample_size": n_points,
                "noise_level": noise,
                "train_rows": train_rows,
                "test_rows": test_rows,
                "mse": float(np.mean(np.square(bias))),
                "mean_bias": float(np.mean(bias)),
                "mean_abs_bias": float(np.mean(np.abs(bias))),
                "prediction_variance": float(np.mean(variance)),
            })

    return curves, metrics


def _preview_rows(design, n_points, noise, test_size, seed):
    rng = np.random.default_rng(seed)
    if design == "non_equidistant":
        x = np.sort(rng.uniform(-2 * np.pi, 2 * np.pi, n_points))
    else:
        x = np.linspace(-2 * np.pi, 2 * np.pi, n_points)
    y = _true_function(x) + rng.normal(0, noise, n_points)
    rows = [{"x": float(x_val), "y": float(y_val)} for x_val, y_val in zip(x, y)]
    split = round(n_points * (1 - test_size))
    return rows[: min(8, split)], rows[split: split + 8]


def _true_function(x):
    return np.sin(x) + 0.35 * np.cos(2 * x)

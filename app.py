import os

from flask import Flask, render_template

from routes.analysis_productivity_routes import analysis_bp
from routes.model_behavior_routes import model_behavior_bp
from routes.my_dashboard_routes import newdashboard_bp
from routes.optimization_routes import optimization_bp
from routes.scrum_routes import scrum_bp


app = Flask(__name__)
app.secret_key = os.environ.get("STUDY_DASHBOARD_SECRET_KEY", "dev-only-change-me")


@app.route('/')
def index():
    return render_template('index.html')


app.register_blueprint(optimization_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(scrum_bp)
app.register_blueprint(newdashboard_bp)
app.register_blueprint(model_behavior_bp)


if __name__ == '__main__':
    app.run(debug=True)

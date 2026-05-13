from flask import Flask, render_template

from routes.analysis_productivity_routes import analysis_bp
from routes.my_dashboard_routes import my_dashboard_bp
from routes.optimization_routes import optimization_bp
from routes.scrum_routes import scrum_bp


app = Flask(__name__)


@app.route('/')
def index():
    return render_template('index.html')


app.register_blueprint(optimization_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(scrum_bp)
app.register_blueprint(my_dashboard_bp)


if __name__ == '__main__':
    app.run(debug=True)

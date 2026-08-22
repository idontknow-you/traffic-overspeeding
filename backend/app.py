from flask import Flask, jsonify
from flask_cors import CORS

from config import Config
from extensions import init_firebase
from routes.violations import violations_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Enabled for cross-origin calls during separate frontend/backend dev
    # (Section 4.3) — the React app and this API run on different origins
    # in local/demo mode.
    CORS(app)

    init_firebase()

    app.register_blueprint(violations_bp)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    return app


# Module-level app object — required so WSGI servers (Vercel's
# @vercel/python, gunicorn, etc.) can import and serve this app without
# running the __main__ block below.
app = create_app()


if __name__ == "__main__":
    app.run(host=Config.HOST, port=Config.PORT, debug=Config.DEBUG)
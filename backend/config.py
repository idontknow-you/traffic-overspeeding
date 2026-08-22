import os


class Config:
    """
    Central config, read from environment variables so the same code
    runs in local/demo mode, hosted mode (Render/Railway), and serverless
    mode (Vercel) without changes.
    """

    # Full Firebase service account JSON, as a string, set directly as an
    # env var. Use this on serverless platforms (Vercel) where you can't
    # ship a gitignored credentials/ file — paste the contents of your
    # serviceAccountKey.json into this env var. Takes priority over
    # FIREBASE_CREDENTIALS_PATH when set.
    FIREBASE_CREDENTIALS_JSON = os.environ.get("FIREBASE_CREDENTIALS_JSON")

    # Path to the Firebase service account JSON (Admin SDK), for
    # environments with a real/persistent filesystem.
    # Defaults to credentials/serviceAccountKey.json — the whole
    # credentials/ folder is gitignored, so this never needs to change
    # per-developer as long as everyone drops their key in that folder.
    # Set this to an empty string to skip straight to
    # credentials.ApplicationDefault() (e.g. Render/Railway secret files).
    FIREBASE_CREDENTIALS_PATH = os.environ.get(
        "FIREBASE_CREDENTIALS_PATH", "credentials/serviceAccountKey.json"
    )

    # Optional: explicit Firebase project id (only needed if it can't be
    # inferred from the service account key).
    FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID")

    # Validation rules (Section 4.1 of the SDLC doc)
    GRACE_BUFFER_PCT = float(os.environ.get("GRACE_BUFFER_PCT", 0.05))  # ignore <5% over limit
    SUSTAINED_DURATION_SEC = float(os.environ.get("SUSTAINED_DURATION_SEC", 3.0))  # ~3s

    # Bind host/port — 0.0.0.0 so the ESP32 can reach it over local WiFi
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = int(os.environ.get("PORT", 5000))
    DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"
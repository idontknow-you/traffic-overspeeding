import json

import firebase_admin
from firebase_admin import credentials, firestore

from config import Config

_db = None


def init_firebase():
    """
    Initialize the Firebase Admin SDK exactly once and return a Firestore
    client. Safe to call multiple times (e.g. from tests) — subsequent
    calls just return the existing client.

    Credential resolution order:
    1. FIREBASE_CREDENTIALS_JSON env var — full service account JSON as a
       string. Use this on serverless platforms (Vercel, etc.) where you
       can't ship a gitignored credentials/ file.
    2. FIREBASE_CREDENTIALS_PATH env var / default
       credentials/serviceAccountKey.json — for local/demo mode and any
       hosted platform with a persistent or secret-mounted filesystem
       (Render, Railway).
    3. credentials.ApplicationDefault() — platform-default credentials,
       e.g. GOOGLE_APPLICATION_CREDENTIALS pointing at a mounted secret
       file, or GCP's ambient default credentials.
    """
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        if Config.FIREBASE_CREDENTIALS_JSON:
            cred_dict = json.loads(Config.FIREBASE_CREDENTIALS_JSON)
            cred = credentials.Certificate(cred_dict)
        elif Config.FIREBASE_CREDENTIALS_PATH:
            cred = credentials.Certificate(Config.FIREBASE_CREDENTIALS_PATH)
        else:
            cred = credentials.ApplicationDefault()

        init_kwargs = {}
        if Config.FIREBASE_PROJECT_ID:
            init_kwargs["projectId"] = Config.FIREBASE_PROJECT_ID

        firebase_admin.initialize_app(cred, init_kwargs)

    _db = firestore.client()
    return _db


def get_db():
    if _db is None:
        return init_firebase()
    return _db
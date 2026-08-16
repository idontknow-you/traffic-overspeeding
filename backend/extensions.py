import firebase_admin
from firebase_admin import credentials, firestore

from config import Config

_db = None


def init_firebase():
    """
    Initialize the Firebase Admin SDK exactly once and return a Firestore
    client. Safe to call multiple times (e.g. from tests) — subsequent
    calls just return the existing client.
    """
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        if Config.FIREBASE_CREDENTIALS_PATH:
            cred = credentials.Certificate(Config.FIREBASE_CREDENTIALS_PATH)
        else:
            # Falls back to GOOGLE_APPLICATION_CREDENTIALS env var or
            # platform-default credentials (useful in hosted mode).
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
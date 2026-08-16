from datetime import datetime, timezone

from google.cloud.firestore_v1 import FieldFilter

from extensions import get_db

VIOLATIONS_COLLECTION = "violations"
VEHICLE_REGISTRY_COLLECTION = "vehicle_registry"
SPEED_LIMIT_MAP_COLLECTION = "speed_limit_map"
APPEALS_COLLECTION = "appeals"


# ---------------------------------------------------------------------------
# vehicle_registry — tag_id -> owner resolution (Section 4.3)
# ---------------------------------------------------------------------------

def resolve_owner(tag_id: str) -> dict | None:
    """
    Look up a vehicle tag in vehicle_registry and return its owner info,
    or None if the tag isn't registered.
    """
    db = get_db()
    doc = db.collection(VEHICLE_REGISTRY_COLLECTION).document(tag_id).get()
    if not doc.exists:
        return None
    return doc.to_dict()


# ---------------------------------------------------------------------------
# violations
# ---------------------------------------------------------------------------

def write_violation(payload: dict, owner: dict | None) -> str:
    """
    Persist a validated, flagged violation. Returns the new document id.
    """
    db = get_db()
    record = {
        "tag_id": payload["tag_id"],
        "type": payload["type"],
        "gps": payload["gps"],
        "timestamp": payload.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        "owner_id": owner.get("owner_id") if owner else None,
        "owner_details": owner.get("owner_details") if owner else None,
    }

    if payload["type"] in ("overspeeding", "rash_driving"):
        record["speed"] = payload["speed"]
        record["limit"] = payload["limit"]
        record["duration_sec"] = payload["duration_sec"]

    if payload["type"] == "red_light":
        record["signal_id"] = payload["signal_id"]

    _, doc_ref = db.collection(VIOLATIONS_COLLECTION).add(record)
    return doc_ref.id


def get_violation(violation_id: str) -> dict | None:
    db = get_db()
    doc = db.collection(VIOLATIONS_COLLECTION).document(violation_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["id"] = doc.id
    return data


# ---------------------------------------------------------------------------
# appeals (Section 4.6)
# ---------------------------------------------------------------------------

def create_appeal(violation_id: str, tag_id: str, reason: str) -> str:
    db = get_db()
    record = {
        "violation_id": violation_id,
        "tag_id": tag_id,
        "reason": reason,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    _, doc_ref = db.collection(APPEALS_COLLECTION).add(record)
    return doc_ref.id


def get_latest_appeal_for_violation(violation_id: str) -> dict | None:
    """
    Returns the most recently submitted appeal for a given violation_id,
    or None if no appeal has been filed. Supports the "check my appeal"
    lookup (GET /appeal/<violation_id>).
    """
    db = get_db()
    query = (
        db.collection(APPEALS_COLLECTION)
        .where(filter=FieldFilter("violation_id", "==", violation_id))
        .order_by("submitted_at", direction="DESCENDING")
        .limit(1)
    )
    docs = list(query.stream())
    if not docs:
        return None
    data = docs[0].to_dict()
    data["id"] = docs[0].id
    return data


def update_appeal_status(appeal_id: str, status: str) -> bool:
    """
    Transitions an appeal's status (pending -> reviewed | dismissed).
    Returns False if no appeal doc exists with that id, True on success.
    Caller (routes/appeals.py) is responsible for validating `status`
    against the allowed set before calling this.
    """
    db = get_db()
    doc_ref = db.collection(APPEALS_COLLECTION).document(appeal_id)
    if not doc_ref.get().exists:
        return False
    doc_ref.update({"status": status})
    return True
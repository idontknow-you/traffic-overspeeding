from flask import Blueprint, jsonify, request

from services import firestore_service
from services.validation import ValidationError, should_flag_violation, validate_violation_payload

violations_bp = Blueprint("violations", __name__)


@violations_bp.route("/violation", methods=["POST"])
def post_violation():
    """
    Receives a violation event from the ESP32 in-vehicle unit or the
    signal-jump unit, validates it, resolves the owner, and — if it
    passes the grace-buffer / sustained-duration checks — persists it
    to Firestore. This is the only write path into `violations`;
    the React dashboard reads it directly via onSnapshot().
    """
    payload = request.get_json(silent=True)

    try:
        validate_violation_payload(payload)
    except ValidationError as e:
        return jsonify({"error": str(e)}), 400

    flag, reason = should_flag_violation(payload)
    if not flag:
        # Not an error — a legitimate outcome of the grace-buffer /
        # sustained-duration rules. Nothing is written to Firestore.
        return jsonify({"status": "ignored", "reason": reason}), 200

    owner = firestore_service.resolve_owner(payload["tag_id"])

    # A recorded violation always has a fine issued against it — there's
    # no amount tracked, just the fact that one was issued.
    violation_id = firestore_service.write_violation(payload, owner)

    return (
        jsonify(
            {
                "status": "recorded",
                "violation_id": violation_id,
                "owner_resolved": owner is not None,
                "fine_issued": True,
                "reason": reason,
            }
        ),
        201,
    )
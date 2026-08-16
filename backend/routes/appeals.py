from flask import Blueprint, jsonify, request

from services import firestore_service

appeals_bp = Blueprint("appeals", __name__)

VALID_STATUSES = {"pending", "reviewed", "dismissed"}


@appeals_bp.route("/appeal", methods=["POST"])
def post_appeal():
    """
    Accepts a violation id + reason from the registered owner, confirms
    the violation exists, and writes to the appeals collection
    (Section 4.6). React reads appeal status directly from Firestore
    the same way it reads violations.
    """
    payload = request.get_json(silent=True)

    if not payload:
        return jsonify({"error": "Empty or missing JSON body"}), 400

    required = ["violation_id", "tag_id", "reason"]
    missing = [f for f in required if f not in payload]
    if missing:
        return jsonify({"error": f"Missing required field(s): {', '.join(missing)}"}), 400

    violation = firestore_service.get_violation(payload["violation_id"])
    if violation is None:
        return jsonify({"error": "No violation found with that violation_id"}), 404

    appeal_id = firestore_service.create_appeal(
        violation_id=payload["violation_id"],
        tag_id=payload["tag_id"],
        reason=payload["reason"],
    )

    return jsonify({"status": "submitted", "appeal_id": appeal_id}), 201


@appeals_bp.route("/appeal/<violation_id>", methods=["GET"])
def get_appeal(violation_id):
    """
    'Check my appeal' lookup — returns the latest appeal status for a
    given violation_id.
    """
    appeal = firestore_service.get_latest_appeal_for_violation(violation_id)
    if appeal is None:
        return jsonify({"error": "No appeal found for that violation_id"}), 404

    return jsonify(appeal), 200


@appeals_bp.route("/appeal/<appeal_id>/status", methods=["PATCH"])
def patch_appeal_status(appeal_id):
    """
    Admin-only status transition for an appeal: pending -> reviewed |
    dismissed (Section 4.6). Same write-path rule as everywhere else —
    the client never updates Firestore directly, this is the only path.

    Note the route: /appeal/<appeal_id>/status, not /appeal/<violation_id>.
    An appeal_id (Firestore doc id from create_appeal) is not the same
    thing as a violation_id — GET /appeal/<violation_id> above looks up
    by violation, this looks up by the appeal doc itself. Keeping them
    on different paths avoids colliding on the same URL shape with two
    different id meanings.
    """
    payload = request.get_json(silent=True)

    if not payload or "status" not in payload:
        return jsonify({"error": "Missing required field: status"}), 400

    new_status = payload["status"]
    if new_status not in VALID_STATUSES:
        return (
            jsonify(
                {
                    "error": f"Invalid status '{new_status}'. Must be one of: "
                    f"{', '.join(sorted(VALID_STATUSES))}"
                }
            ),
            400,
        )

    updated = firestore_service.update_appeal_status(appeal_id, new_status)
    if not updated:
        return jsonify({"error": "No appeal found with that appeal_id"}), 404

    return jsonify({"status": "updated", "appeal_id": appeal_id, "new_status": new_status}), 200
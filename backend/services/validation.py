from config import Config

VALID_TYPES = {"overspeeding", "rash_driving", "red_light"}


class ValidationError(Exception):
    """Raised for a malformed request (bad request, HTTP 400)."""
    pass


def validate_violation_payload(payload: dict) -> None:
    """
    Structural validation of the JSON contract from the ESP32 / signal unit
    (Section 4.1). Raises ValidationError with a human-readable message
    on failure. Does not decide whether the violation should be *flagged*
    (see should_flag_violation) — only whether the payload is well-formed.
    """
    if not payload:
        raise ValidationError("Empty or missing JSON body")

    required = ["tag_id", "type", "gps"]
    missing = [f for f in required if f not in payload]
    if missing:
        raise ValidationError(f"Missing required field(s): {', '.join(missing)}")

    v_type = payload["type"]
    if v_type not in VALID_TYPES:
        raise ValidationError(
            f"Invalid type '{v_type}'. Must be one of {sorted(VALID_TYPES)}"
        )

    gps = payload.get("gps")
    if not isinstance(gps, dict) or "lat" not in gps or "lng" not in gps:
        raise ValidationError("gps must be an object with 'lat' and 'lng'")

    if v_type in ("overspeeding", "rash_driving"):
        for f in ("speed", "limit", "duration_sec"):
            if f not in payload:
                raise ValidationError(f"Missing required field for {v_type}: '{f}'")
            if not isinstance(payload[f], (int, float)):
                raise ValidationError(f"Field '{f}' must be numeric")

    if v_type == "red_light" and "signal_id" not in payload:
        raise ValidationError("Missing required field for red_light: 'signal_id'")


def should_flag_violation(payload: dict) -> tuple[bool, str]:
    """
    Business-rule validation (Section 4.1 / 4.3):
      - grace buffer: ignore overspeeding <5% over the limit
      - sustained duration: require ~3s sustained before flagging
        (applies to overspeeding and rash_driving, both of which are
        continuous-sensor-derived rather than instantaneous events)

    Returns (flag: bool, reason: str). reason explains why it was
    ignored when flag is False; it's informational when flag is True.
    """
    v_type = payload["type"]

    if v_type == "red_light":
        # Instantaneous event — no grace buffer or duration check applies.
        return True, "red_light violations are flagged unconditionally"

    speed = payload["speed"]
    limit = payload["limit"]
    duration_sec = payload["duration_sec"]

    if duration_sec < Config.SUSTAINED_DURATION_SEC:
        return False, (
            f"Ignored: duration {duration_sec}s below sustained-duration "
            f"threshold of {Config.SUSTAINED_DURATION_SEC}s"
        )

    if v_type == "overspeeding":
        threshold = limit * (1 + Config.GRACE_BUFFER_PCT)
        if speed < threshold:
            return False, (
                f"Ignored: speed {speed} within grace buffer "
                f"({Config.GRACE_BUFFER_PCT * 100:.0f}% of limit {limit} = {threshold:.2f})"
            )

    return True, "Passed grace-buffer and sustained-duration checks"
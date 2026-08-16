"""
Tests for the pure validation logic in services/validation.py.
No Firestore connection needed — run with: pytest tests/
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from services.validation import ValidationError, should_flag_violation, validate_violation_payload


def test_overspeeding_within_grace_buffer_is_not_flagged():
    p = {"tag_id": "T1", "type": "overspeeding", "gps": {"lat": 1, "lng": 1},
         "speed": 52, "limit": 50, "duration_sec": 4}
    validate_violation_payload(p)
    flag, _ = should_flag_violation(p)
    assert flag is False


def test_overspeeding_clearly_over_is_flagged():
    p = {"tag_id": "T1", "type": "overspeeding", "gps": {"lat": 1, "lng": 1},
         "speed": 70, "limit": 50, "duration_sec": 4}
    validate_violation_payload(p)
    flag, _ = should_flag_violation(p)
    assert flag is True


def test_short_duration_is_not_flagged():
    p = {"tag_id": "T1", "type": "overspeeding", "gps": {"lat": 1, "lng": 1},
         "speed": 70, "limit": 50, "duration_sec": 1}
    validate_violation_payload(p)
    flag, _ = should_flag_violation(p)
    assert flag is False


def test_red_light_always_flagged():
    p = {"tag_id": "T1", "type": "red_light", "gps": {"lat": 1, "lng": 1}, "signal_id": "S1"}
    validate_violation_payload(p)
    flag, _ = should_flag_violation(p)
    assert flag is True


def test_missing_required_field_raises():
    with pytest.raises(ValidationError):
        validate_violation_payload(
            {"tag_id": "T1", "type": "overspeeding", "gps": {"lat": 1, "lng": 1}}
        )


def test_invalid_type_raises():
    with pytest.raises(ValidationError):
        validate_violation_payload(
            {"tag_id": "T1", "type": "jaywalking", "gps": {"lat": 1, "lng": 1}}
        )


def test_missing_gps_raises():
    with pytest.raises(ValidationError):
        validate_violation_payload({"tag_id": "T1", "type": "red_light", "signal_id": "S1"})
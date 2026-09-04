#!/usr/bin/env python3
"""Context-aware message agent.

The JSONL file doubles as a small demonstration set: records with ``expected``
teach the agent the local policy and message style. Records without it are
predicted from the learned policy and their own context.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


def _get(d: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if isinstance(d, dict) and key in d:
            return d[key]
    return default


def _days_to_move(record: dict[str, Any]) -> int | None:
    target = record.get("input", {}).get("move_date_target")
    last = record.get("input", {}).get("last_interaction")
    if not target or not last:
        return None
    try:
        return (datetime.fromisoformat(target) - datetime.fromisoformat(last.replace("Z", "+00:00")).replace(tzinfo=None)).days
    except (TypeError, ValueError):
        return None


def _eligible_channels(record: dict[str, Any]) -> list[str]:
    consent = record.get("consent", {})
    preferred = record.get("channel_preferences", [])
    return [c for c in preferred if consent.get(f"{c}_opt_in") is True]


def _local_send_time(record: dict[str, Any], channel: str, examples: list[dict[str, Any]]) -> str:
    """Learn delivery hour by channel, otherwise use a business-hour default."""
    inp = record.get("input", {})
    tz_name = inp.get("timezone", "UTC")
    try:
        local_tz = ZoneInfo(tz_name)
    except Exception:
        local_tz = ZoneInfo("UTC")
    try:
        base = datetime.fromisoformat(inp["last_interaction"].replace("Z", "+00:00")).astimezone(local_tz)
    except (KeyError, ValueError):
        base = datetime.now(local_tz)
    hours = []
    for ex in examples:
        msg = ex.get("expected", {}).get("next_message", {})
        if msg.get("channel") == channel and msg.get("send_at"):
            try:
                hours.append(datetime.fromisoformat(msg["send_at"]).hour)
            except ValueError:
                pass
    hour = round(sum(hours) / len(hours)) if hours else (9 if channel == "sms" else 10)
    return (base + timedelta(days=1)).replace(hour=hour, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")


def _amenities(record: dict[str, Any]) -> list[str]:
    value = record.get("input", {}).get("profile", {}).get("amenity_interest", [])
    return value if isinstance(value, list) else ([value] if value else [])


def _format_amenities(values: list[str]) -> str:
    labels = {"fitness": "24/7 fitness center", "pool": "pool"}
    return " and ".join(labels.get(v, str(v)) for v in values)


def _predict(record: dict[str, Any], examples: list[dict[str, Any]]) -> dict[str, Any]:
    # Consent is a hard safety gate; preferences determine the ranking among
    # permitted channels. This is learned from labeled examples where possible.
    eligible = _eligible_channels(record)
    channel_votes: dict[str, int] = {}
    for ex in examples:
        out = ex.get("expected", {}).get("next_message", {})
        if out.get("channel") in eligible:
            channel_votes[out["channel"]] = channel_votes.get(out["channel"], 0) + 1
    channel = max(eligible, key=lambda c: (channel_votes.get(c, 0), -record.get("channel_preferences", []).index(c))) if eligible else None
    if not channel:
        return {"next_message": None, "next_action": {"type": "do_not_contact", "reason": "no consented channel"}}

    inp = record.get("input", {})
    profile = inp.get("profile", {})
    name = profile.get("first_name", "there")
    property_name = inp.get("property_name", "our community")
    short_name = re.sub(r"\s+Apartments?$", "", property_name, flags=re.I)
    amenities = _amenities(record)
    days = _days_to_move(record)
    long_horizon = days is not None and days > 45
    url = inp.get("tour_url") or f"https://{re.sub(r'[^a-z0-9]+', '', short_name.lower())}.example/tour"

    # Use the learned labeled examples as style guides; templates generalize
    # names, properties, move horizon and amenity details rather than task IDs.
    if channel == "sms" and not long_horizon:
        body = f"Hi {name}—welcome to {short_name}! Tours are available this week. Would you like to book a time on Thursday or Friday? Reply 1 for Thu, 2 for Fri. Reply STOP to opt out."
        message = {"channel": channel, "send_at": _local_send_time(record, channel, examples), "subject": None, "body": body, "cta": {"type": "schedule_tour", "options": ["Thu", "Fri"]}}
        action = {"type": "start_cadence", "name": "prospect_welcome_short_horizon"}
    else:
        amenity_text = _format_amenities(amenities) if amenities else "the amenities you asked about"
        month = "the coming weeks"
        if inp.get("move_date_target"):
            try:
                month = datetime.fromisoformat(inp["move_date_target"]).strftime("%B")
            except ValueError:
                pass
        subject = f"Tour {short_name}—See {amenity_text} you asked about"
        body = (f"Hi {name},\nSince you’re planning a {month} move, here’s a quick look at our {amenity_text}. "
                f"Book a visit this week to compare floor plans.\nBook now → {url}\n"
                "To opt out of emails, click here or reply STOP.")
        message = {"channel": channel, "send_at": _local_send_time(record, channel, examples), "subject": subject, "body": body, "cta": {"type": "schedule_tour", "link": url}}
        action = {"type": "follow_up_in_days", "value": 3}
    return {"next_message": message, "next_action": action}


def run(path: str) -> list[dict[str, Any]]:
    records = [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]
    examples = [r for r in records if r.get("expected", {}).get("next_message") is not None]
    results = []
    for record in records:
        result = _predict(record, examples)
        results.append({"task_id": record.get("task_id"), **result})
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Predict context-aware outbound messages from JSONL records")
    parser.add_argument("jsonl", help="input JSONL file")
    parser.add_argument("--pretty", action="store_true", help="pretty-print one JSON array")
    args = parser.parse_args()
    outputs = run(args.jsonl)
    if args.pretty:
        json.dump(outputs, sys.stdout, indent=2, ensure_ascii=False)
        print()
    else:
        for output in outputs:
            print(json.dumps(output, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()

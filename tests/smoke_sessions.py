#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER_TOKEN = "smoke_test_teacher_token_1234567890"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request(base: str, path: str, *, method: str = "GET", payload=None, headers=None):
    body = None
    final_headers = dict(headers or {})
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        final_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=body, method=method, headers=final_headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers, exc.read()


def json_request(base: str, path: str, *, method: str = "GET", payload=None, headers=None):
    status, response_headers, body = request(
        base, path, method=method, payload=payload, headers=headers
    )
    parsed = json.loads(body.decode("utf-8")) if body else {}
    return status, response_headers, parsed


def assert_status(actual: int, expected: int, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected HTTP {expected}, got {actual}")


def main() -> int:
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="maths-lgc-smoke-") as data_dir:
        legacy_session = "legacy_session_0001"
        legacy_admin = "legacy_admin_token_smoke_0001"
        Path(data_dir, "sessions.json").write_text(
            json.dumps({
                "version": 1,
                "sessions": {
                    legacy_session: {
                        "class_session_id": legacy_session,
                        "teacher_id": "kevin",
                        "teacher_label": "Monsieur Kevin",
                        "course_session": "seance-1",
                        "course_session_label": "Séance 1",
                        "group_label": "PSR historique",
                        "admin_token_hash": hashlib.sha256(legacy_admin.encode("utf-8")).hexdigest(),
                        "corrections_unlocked": False,
                        "created_at": "2026-01-10T08:00:00+00:00",
                        "updated_at": "2026-01-10T08:00:00+00:00",
                    }
                },
            }),
            encoding="utf-8",
        )
        env = {
            **os.environ,
            "MATHS_HOST": "127.0.0.1",
            "MATHS_PORT": str(port),
            "MATHS_DATA_DIR": data_dir,
            "MATHS_TEACHER_TOKEN": MASTER_TOKEN,
            "MATHS_PUBLIC_URL": base,
        }
        process = subprocess.Popen(
            [sys.executable, "server.py"],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            deadline = time.time() + 10
            while time.time() < deadline:
                try:
                    status, _, _ = request(base, "/healthz")
                    if status == 200:
                        break
                except OSError:
                    pass
                time.sleep(0.1)
            else:
                raise AssertionError("server did not become healthy")

            status, _, _ = json_request(base, "/api/teacher/status")
            assert_status(status, 401, "teacher status without token")

            master_headers = {"Authorization": f"Bearer {MASTER_TOKEN}"}
            status, _, status_body = json_request(
                base, "/api/teacher/status", headers=master_headers
            )
            assert_status(status, 200, "teacher status with token")
            assert status_body.get("ok") is True

            # Portal SSO identity owns new sessions server-side, so they are
            # recoverable on another browser/device without a local management secret.
            sso_cookie = "sso_smoke_owner_cookie_1234567890"
            other_cookie = "sso_smoke_other_cookie_1234567890"
            db_path = Path(data_dir, "maths_lgc.sqlite3")
            with sqlite3.connect(db_path) as db:
                for raw_cookie, portal_id, display_name in [
                    (sso_cookie, "42", "Kevin Portail"),
                    (other_cookie, "99", "Autre Prof"),
                ]:
                    db.execute(
                        """INSERT INTO teacher_browser_sessions(
                            token_hash,portal_user_id,display_name,role,expires_at,created_at
                        ) VALUES(?,?,?,?,?,?)""",
                        (
                            hashlib.sha256(raw_cookie.encode("utf-8")).hexdigest(),
                            portal_id,
                            display_name,
                            "teacher",
                            "2099-01-01T00:00:00+00:00",
                            "2026-09-30T11:00:00+00:00",
                        ),
                    )

            sso_headers = {"Cookie": f"maths_teacher_session={sso_cookie}"}
            status, _, sso_status = json_request(
                base, "/api/teacher/status", headers=sso_headers
            )
            assert_status(status, 200, "teacher status with portal SSO cookie")
            assert sso_status["auth_mode"] == "portal-sso"
            assert sso_status["user"]["portal_user_id"] == "42"

            status, _, sso_created = json_request(
                base,
                "/api/teacher/sessions",
                method="POST",
                payload={
                    "teacher_id": "",
                    "session_number": 3,
                    "session_title": "Session SSO",
                    "group_label": "PSR SSO",
                },
                headers=sso_headers,
            )
            assert_status(status, 201, "create SSO-owned session")
            sso_session = sso_created["session"]["class_session_id"]
            assert sso_created["session"]["teacher_label"] == "Kevin Portail"
            assert sso_created["session"]["teacher_id"] == "portal-42"
            assert sso_created["access_mode"] == "portal-owner"
            assert "admin_token" not in sso_created

            status, _, owned = json_request(
                base, "/api/teacher/sessions", headers=sso_headers
            )
            assert_status(status, 200, "list SSO-owned sessions")
            assert [item["class_session_id"] for item in owned["sessions"]] == [sso_session]

            status, _, owner_summary = json_request(
                base,
                f"/api/teacher/session-summary?id={sso_session}",
                headers=sso_headers,
            )
            assert_status(status, 200, "owner opens SSO-owned session without management token")
            assert owner_summary["session"]["class_session_id"] == sso_session

            status, _, _ = json_request(
                base,
                f"/api/teacher/session-summary?id={sso_session}",
                headers={"Cookie": f"maths_teacher_session={other_cookie}"},
            )
            assert_status(status, 401, "other portal teacher cannot open owned session")

            # Closing a session is reversible: public learner access stops,
            # history/report access stays teacher-authorized, and corrections relock.
            status, _, _ = json_request(
                base,
                "/api/teacher/session-corrections",
                method="POST",
                payload={"class_session_id": sso_session, "unlocked": True},
                headers=sso_headers,
            )
            assert_status(status, 200, "unlock corrections before close")

            status, _, closed = json_request(
                base,
                "/api/teacher/session-active",
                method="POST",
                payload={"class_session_id": sso_session, "active": False},
                headers=sso_headers,
            )
            assert_status(status, 200, "close SSO-owned session")
            assert closed["active"] is False
            assert closed["corrections_unlocked"] is False

            status, _, closed_public = json_request(
                base, f"/api/session?id={sso_session}"
            )
            assert_status(status, 410, "closed session rejects learner entry")
            assert "fermée" in closed_public["error"]

            status, _, owned_closed = json_request(
                base, "/api/teacher/sessions", headers=sso_headers
            )
            assert_status(status, 200, "closed SSO session remains in teacher list")
            closed_row = next(
                item for item in owned_closed["sessions"]
                if item["class_session_id"] == sso_session
            )
            assert closed_row["active"] is False

            status, _, closed_summary = json_request(
                base,
                f"/api/teacher/session-summary?id={sso_session}",
                headers=sso_headers,
            )
            assert_status(status, 200, "closed session report remains readable")
            assert closed_summary["session"]["active"] is False

            closed_progress = {
                "student_id": "student_closed_sso_001",
                "display_name": "Eleve test",
                "first_name": "Eleve",
                "last_name": "Test",
                "birth_date": "2008-04-12",
                "class_session_id": sso_session,
                "stage": "activity",
                "activity": {
                    "event": "session_started",
                    "route": "parcours",
                    "session_id": "activity_closed_sso_001",
                },
            }
            status, _, closed_progress_body = json_request(
                base, "/api/progress", method="POST", payload=closed_progress
            )
            assert_status(status, 410, "closed session rejects progress writes")
            assert "fermée" in closed_progress_body["error"]

            status, _, denied_reopen = json_request(
                base,
                "/api/teacher/session-active",
                method="POST",
                payload={"class_session_id": sso_session, "active": True},
                headers={"Cookie": f"maths_teacher_session={other_cookie}"},
            )
            assert_status(status, 401, "other portal teacher cannot reopen session")

            status, _, closed_correction = json_request(
                base,
                "/api/teacher/session-corrections",
                method="POST",
                payload={"class_session_id": sso_session, "unlocked": True},
                headers=sso_headers,
            )
            assert_status(status, 400, "closed session corrections stay locked")
            assert "Réouvre" in closed_correction["error"]

            status, _, reopened = json_request(
                base,
                "/api/teacher/session-active",
                method="POST",
                payload={"class_session_id": sso_session, "active": True},
                headers=sso_headers,
            )
            assert_status(status, 200, "reopen SSO-owned session")
            assert reopened["active"] is True
            assert reopened["corrections_unlocked"] is False

            status, _, reopened_public = json_request(
                base, f"/api/session?id={sso_session}"
            )
            assert_status(status, 200, "same learner link works after reopen")
            assert reopened_public["active"] is True

            status, _, legacy_public = json_request(
                base, f"/api/session?id={legacy_session}"
            )
            assert_status(status, 200, "legacy public session")
            assert legacy_public["session_number"] == 1
            assert legacy_public["session_title"] == ""
            assert legacy_public["course_session"] == "seance-1"
            assert legacy_public["course_session_label"] == "Séance 1"
            assert legacy_public["active"] is True

            status, _, legacy_summary = json_request(
                base,
                f"/api/teacher/session-summary?id={legacy_session}",
                headers={"X-Session-Token": legacy_admin},
            )
            assert_status(status, 200, "legacy teacher dashboard")
            assert legacy_summary["session"]["session_number"] == 1
            assert legacy_summary["session"]["session_title"] == ""
            assert legacy_summary["count"] == 0

            status, _, _ = json_request(
                base,
                "/api/teacher/sessions",
                method="POST",
                payload={
                    "teacher_id": "kevin",
                    "session_number": 1,
                    "session_title": "Proportionnalité",
                    "group_label": "PSR 1",
                },
            )
            assert_status(status, 401, "create session without token")

            status, _, invalid_number = json_request(
                base,
                "/api/teacher/sessions",
                method="POST",
                payload={
                    "teacher_id": "kevin",
                    "session_number": 0,
                    "session_title": "",
                    "group_label": "PSR 1",
                },
                headers=master_headers,
            )
            assert_status(status, 400, "reject invalid session number")
            assert "numéro de séance" in invalid_number["error"].lower()

            status, _, created_a = json_request(
                base,
                "/api/teacher/sessions",
                method="POST",
                payload={
                    "teacher_id": "kevin",
                    "session_number": 1,
                    "session_title": "Proportionnalité",
                    "group_label": "PSR 1",
                },
                headers=master_headers,
            )
            assert_status(status, 201, "create Kevin session")
            session_a = created_a["session"]["class_session_id"]
            admin_a = created_a["admin_token"]

            status, _, created_b = json_request(
                base,
                "/api/teacher/sessions",
                method="POST",
                payload={
                    "teacher_id": "fadhila",
                    "session_number": 2,
                    "session_title": "",
                    "group_label": "PSR 2",
                },
                headers=master_headers,
            )
            assert_status(status, 201, "create Fadhila session")
            session_b = created_b["session"]["class_session_id"]
            admin_b = created_b["admin_token"]
            assert session_a != session_b
            assert admin_a != admin_b

            status, _, public_a = json_request(base, f"/api/session?id={session_a}")
            assert_status(status, 200, "public Kevin session")
            assert public_a["teacher_label"] == "Monsieur Kevin"
            assert public_a["session_number"] == 1
            assert public_a["session_title"] == "Proportionnalité"
            assert public_a["course_session"] == "seance-1"
            assert public_a["course_session_label"] == "Séance 1 · Proportionnalité"
            assert public_a["group_label"] == "PSR 1"
            assert public_a["corrections_unlocked"] is False

            status, qr_headers, qr_body = request(base, f"/api/session-qr?id={session_a}")
            assert_status(status, 200, "session QR")
            assert "image/svg+xml" in (qr_headers.get("Content-Type") or "")
            assert b"<svg" in qr_body

            shared_student_id = "student_smoke_shared_001"
            activity_session_a = "activity_smoke_group_a_001"
            activity_session_b = "activity_smoke_group_b_001"

            activity_payload_a = {
                "student_id": shared_student_id,
                "display_name": "Alice",
                "first_name": "Alice",
                "last_name": "Test",
                "birth_date": "2008-04-12",
                "class_session_id": session_a,
                "stage": "activity",
                "activity": {
                    "event": "session_started",
                    "route": "parcours",
                    "session_id": activity_session_a,
                },
            }
            status, _, _ = json_request(
                base, "/api/progress", method="POST", payload=activity_payload_a
            )
            assert_status(status, 201, "register student in Kevin session")

            diagnostic_payload_a = {
                **{k: v for k, v in activity_payload_a.items() if k not in {"stage", "activity"}},
                "session_id": activity_session_a,
                "stage": "diagnostic",
                "self_eval": {"feeling": "ok", "help": "sometimes"},
                "diagnostic": {
                    "score": 7,
                    "details": [
                        {"id": "q1", "domain": "Calcul", "correct": True, "value": "18"},
                        {"id": "q2", "domain": "Automatismes", "correct": False, "value": "je ne sais pas"},
                    ],
                    "weak_domains": ["Automatismes"],
                    "strong_domains": ["Calcul"],
                },
                "challenge": None,
            }
            status, _, _ = json_request(
                base, "/api/progress", method="POST", payload=diagnostic_payload_a
            )
            assert_status(status, 201, "diagnostic in Kevin session")

            activity_payload_b = {
                "student_id": shared_student_id,
                "display_name": "Bob",
                "first_name": "Bob",
                "last_name": "Test",
                "birth_date": "2008-04-12",
                "class_session_id": session_b,
                "stage": "activity",
                "activity": {
                    "event": "session_started",
                    "route": "parcours",
                    "session_id": activity_session_b,
                },
            }
            status, _, _ = json_request(
                base, "/api/progress", method="POST", payload=activity_payload_b
            )
            assert_status(status, 201, "register same device id in Fadhila session")

            status, _, _ = json_request(
                base,
                f"/api/teacher/session-summary?id={session_a}",
                headers={"X-Session-Token": admin_b},
            )
            assert_status(status, 401, "cross-session access blocked")

            status, _, summary_a = json_request(
                base,
                f"/api/teacher/session-summary?id={session_a}",
                headers={"X-Session-Token": admin_a},
            )
            assert_status(status, 200, "Kevin summary")
            assert summary_a["count"] == 1
            assert summary_a["students"][0]["first_name"] == "Alice"
            assert summary_a["students"][0]["group_label"] == "PSR 1"
            assert summary_a["students"][0]["diagnostic"]["score"] == 7

            status, _, summary_b = json_request(
                base,
                f"/api/teacher/session-summary?id={session_b}",
                headers={"X-Session-Token": admin_b},
            )
            assert_status(status, 200, "Fadhila summary")
            assert summary_b["count"] == 1
            assert summary_b["session"]["session_number"] == 2
            assert summary_b["session"]["session_title"] == ""
            assert summary_b["session"]["course_session_label"] == "Séance 2"
            assert summary_b["students"][0]["first_name"] == "Bob"
            assert summary_b["students"][0].get("diagnostic") is None

            status, _, toggled = json_request(
                base,
                "/api/teacher/session-corrections",
                method="POST",
                payload={"class_session_id": session_a, "unlocked": True},
                headers={"X-Session-Token": admin_a},
            )
            assert_status(status, 200, "unlock Kevin corrections")
            assert toggled["corrections_unlocked"] is True

            _, _, public_a_after = json_request(base, f"/api/session?id={session_a}")
            _, _, public_b_after = json_request(base, f"/api/session?id={session_b}")
            assert public_a_after["corrections_unlocked"] is True
            assert public_b_after["corrections_unlocked"] is False

            status, _, history_a = json_request(
                base,
                f"/api/teacher/session-history?id={session_a}",
                headers={"X-Session-Token": admin_a},
            )
            assert_status(status, 200, "Kevin history")
            assert history_a["count"] == 2
            assert all(item["class_session_id"] == session_a for item in history_a["submissions"])

            status, _, csv_body = request(
                base,
                f"/api/teacher/session-export.csv?id={session_a}",
                headers={"X-Session-Token": admin_a},
            )
            assert_status(status, 200, "Kevin CSV")
            csv_text = csv_body.decode("utf-8-sig")
            assert "PSR 1" in csv_text
            assert "Alice" in csv_text
            assert "PSR 2" not in csv_text
            assert "Bob" not in csv_text

            bad_payload = {**activity_payload_a, "class_session_id": "unknown_session_12345"}
            status, _, _ = json_request(
                base, "/api/progress", method="POST", payload=bad_payload
            )
            assert_status(status, 400, "unknown class session rejected")

            print("session smoke test: OK")
            return 0
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            if process.returncode not in {0, -15}:
                stderr = process.stderr.read() if process.stderr else ""
                if stderr:
                    print(stderr, file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())

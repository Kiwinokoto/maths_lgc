#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import socket
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

            status, _, _ = json_request(
                base,
                "/api/teacher/sessions",
                method="POST",
                payload={
                    "teacher_id": "kevin",
                    "course_session": "seance-1",
                    "group_label": "PSR 1",
                },
            )
            assert_status(status, 401, "create session without token")

            status, _, created_a = json_request(
                base,
                "/api/teacher/sessions",
                method="POST",
                payload={
                    "teacher_id": "kevin",
                    "course_session": "seance-1",
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
                    "course_session": "seance-1",
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

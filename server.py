#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("MATHS_DATA_DIR", ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "maths_lgc.sqlite3"
HOST = os.environ.get("MATHS_HOST", "0.0.0.0")
PORT = int(os.environ.get("MATHS_PORT", "8080"))
TEACHER_TOKEN = os.environ.get("MATHS_TEACHER_TOKEN", "")
MAX_BODY = 64 * 1024
STUDENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
VALID_STAGES = {"diagnostic", "challenge", "bilan"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect_db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH, timeout=5)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=5000")
    return db


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect_db() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                stage TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id, id)")


def clean_name(value: object) -> str:
    name = " ".join(str(value or "").split()).strip()
    if not (1 <= len(name) <= 40):
        raise ValueError("Le prénom ou code doit contenir entre 1 et 40 caractères.")
    if any(ord(ch) < 32 for ch in name):
        raise ValueError("Le prénom ou code contient un caractère invalide.")
    return name


def validate_payload(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("Corps JSON invalide.")
    student_id = str(raw.get("student_id", ""))
    if not STUDENT_ID_RE.fullmatch(student_id):
        raise ValueError("Identifiant élève invalide.")
    display_name = clean_name(raw.get("display_name"))
    stage = str(raw.get("stage", ""))
    if stage not in VALID_STAGES:
        raise ValueError("Étape invalide.")

    diagnostic = raw.get("diagnostic")
    if diagnostic is not None:
        if not isinstance(diagnostic, dict):
            raise ValueError("Diagnostic invalide.")
        score = diagnostic.get("score")
        if not isinstance(score, int) or not (0 <= score <= 10):
            raise ValueError("Score de diagnostic invalide.")
        details = diagnostic.get("details", [])
        if not isinstance(details, list) or len(details) > 20:
            raise ValueError("Détails de diagnostic invalides.")
        compact_details = []
        for item in details:
            if not isinstance(item, dict):
                continue
            compact_details.append(
                {
                    "id": str(item.get("id", ""))[:16],
                    "domain": str(item.get("domain", ""))[:64],
                    "correct": bool(item.get("correct")),
                    "value": str(item.get("value", ""))[:64],
                }
            )
        diagnostic = {
            "score": score,
            "details": compact_details,
            "weak_domains": [str(v)[:64] for v in diagnostic.get("weak_domains", [])[:12]],
            "strong_domains": [str(v)[:64] for v in diagnostic.get("strong_domains", [])[:12]],
        }

    challenge = raw.get("challenge")
    if challenge is not None:
        if not isinstance(challenge, dict):
            raise ValueError("Défi invalide.")
        challenge = {
            "score": max(0, min(3, int(challenge.get("score", 0)))),
            "portions": max(0, min(100, int(challenge.get("portions", 0)))),
            "factor_ok": bool(challenge.get("factor_ok")),
            "time_ok": bool(challenge.get("time_ok")),
            "revenue_ok": bool(challenge.get("revenue_ok")),
        }

    self_eval = raw.get("self_eval")
    if isinstance(self_eval, dict):
        self_eval = {
            "feeling": str(self_eval.get("feeling", ""))[:32],
            "help": str(self_eval.get("help", ""))[:32],
        }
    else:
        self_eval = None

    return {
        "student_id": student_id,
        "display_name": display_name,
        "stage": stage,
        "diagnostic": diagnostic,
        "challenge": challenge,
        "self_eval": self_eval,
    }


def submission_history() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            "SELECT id, student_id, display_name, stage, payload_json, created_at FROM submissions ORDER BY id ASC"
        ).fetchall()
    history = []
    for row in rows:
        payload = json.loads(row["payload_json"])
        history.append(
            {
                "id": row["id"],
                "student_id": row["student_id"],
                "display_name": row["display_name"],
                "stage": row["stage"],
                "created_at": row["created_at"],
                "diagnostic": payload.get("diagnostic"),
                "challenge": payload.get("challenge"),
                "self_eval": payload.get("self_eval"),
            }
        )
    return history


def latest_students() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            "SELECT id, student_id, display_name, stage, payload_json, created_at FROM submissions ORDER BY id ASC"
        ).fetchall()
    by_student: dict[str, dict] = {}
    attempts: dict[str, int] = {}
    for row in rows:
        payload = json.loads(row["payload_json"])
        sid = row["student_id"]
        attempts[sid] = attempts.get(sid, 0) + 1
        current = by_student.get(sid, {})
        merged = {
            **current,
            "student_id": sid,
            "display_name": row["display_name"],
            "stage": row["stage"],
            "updated_at": row["created_at"],
        }
        if payload.get("diagnostic") is not None:
            merged["diagnostic"] = payload["diagnostic"]
        if payload.get("challenge") is not None:
            merged["challenge"] = payload["challenge"]
        if payload.get("self_eval") is not None:
            merged["self_eval"] = payload["self_eval"]
        by_student[sid] = merged
    out = []
    for sid, item in by_student.items():
        item["submissions"] = attempts[sid]
        diag = item.get("diagnostic") or {}
        weak = list(diag.get("weak_domains") or [])
        strong = list(diag.get("strong_domains") or [])
        item["recommended_start"] = weak[0] if weak else "Consolidation / défi PSR"
        item["strengths"] = strong
        item["weaknesses"] = weak
        out.append(item)
    return sorted(out, key=lambda x: x["display_name"].casefold())


class Handler(BaseHTTPRequestHandler):
    server_version = "MathsLGC/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _headers(self, status: int, content_type: str, length: int | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.end_headers()

    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self._headers(status, "application/json; charset=utf-8", len(body))
        self.wfile.write(body)

    def _authorized(self) -> bool:
        if not TEACHER_TOKEN:
            return False
        auth = self.headers.get("Authorization", "")
        supplied = auth[7:] if auth.startswith("Bearer ") else self.headers.get("X-Teacher-Token", "")
        return bool(supplied) and secrets.compare_digest(supplied, TEACHER_TOKEN)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/healthz":
            return self._json(200, {"ok": True})
        if path == "/api/teacher/summary":
            if not self._authorized():
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès enseignant refusé."})
            students = latest_students()
            return self._json(200, {"students": students, "count": len(students), "generated_at": utc_now()})
        if path == "/api/teacher/history":
            if not self._authorized():
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès enseignant refusé."})
            history = submission_history()
            return self._json(200, {"submissions": history, "count": len(history), "generated_at": utc_now()})
        if path == "/api/teacher/export.csv":
            if not self._authorized():
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès enseignant refusé."})
            rows = latest_students()
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(["eleve", "id", "derniere_activite", "diagnostic", "defi", "forces", "a_travailler", "commencer_par"])
            for item in rows:
                diag = item.get("diagnostic") or {}
                challenge = item.get("challenge") or {}
                writer.writerow([
                    item["display_name"], item["student_id"], item["updated_at"],
                    diag.get("score", ""), challenge.get("score", ""),
                    " | ".join(item.get("strengths", [])),
                    " | ".join(item.get("weaknesses", [])),
                    item.get("recommended_start", ""),
                ])
            body = buffer.getvalue().encode("utf-8-sig")
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="maths-lgc-classe.csv"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return self._serve_static(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/progress":
            return self._json(404, {"error": "Route inconnue."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._json(400, {"error": "Taille invalide."})
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {"error": "Requête trop volumineuse."})
        try:
            raw = json.loads(self.rfile.read(length))
            payload = validate_payload(raw)
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
            return self._json(400, {"error": str(exc)})
        created_at = utc_now()
        with connect_db() as db:
            db.execute(
                "INSERT INTO submissions(student_id, display_name, stage, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (
                    payload["student_id"], payload["display_name"], payload["stage"],
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":")), created_at,
                ),
            )
        return self._json(201, {"ok": True, "saved_at": created_at})

    def _serve_static(self, path: str) -> None:
        aliases = {"/": "index.html", "/teacher": "teacher.html", "/teacher/": "teacher.html"}
        relative = aliases.get(path, path.lstrip("/"))
        target = (ROOT / relative).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            return self._json(403, {"error": "Chemin refusé."})
        if not target.is_file():
            return self._json(404, {"error": "Fichier introuvable."})
        data = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if mime.startswith("text/") or mime in {"application/javascript", "application/json"}:
            mime += "; charset=utf-8"
        self._headers(200, mime, len(data))
        self.wfile.write(data)


def main() -> None:
    init_db()
    if not TEACHER_TOKEN:
        print("WARNING: MATHS_TEACHER_TOKEN absent; le tableau enseignant restera inaccessible.", file=sys.stderr)
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Maths LGC listening on http://{HOST}:{PORT}", file=sys.stderr)
    httpd.serve_forever()


if __name__ == "__main__":
    main()

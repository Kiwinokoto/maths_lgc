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
VALID_STAGES = {"diagnostic", "challenge", "bilan", "activity"}
ACTIVITY_EVENTS = {"session_started", "route_opened", "activity_checked"}
ACTIVITY_ROUTES = {"parcours", "intro", "diagnostic", "correction", "defi", "bilan", "durees", "proportion", "pourcentages", "donnees", "equations", "fonctions"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def elapsed_seconds(start: str | None, end: str | None) -> int | None:
    if not start or not end:
        return None
    try:
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
    except ValueError:
        return None
    return max(0, int((end_dt - start_dt).total_seconds()))


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
        raise ValueError("Le prénom doit contenir entre 1 et 40 caractères.")
    if any(ord(ch) < 32 for ch in name):
        raise ValueError("Le prénom contient un caractère invalide.")
    return name


def clean_last_name(value: object) -> str:
    name = " ".join(str(value or "").split()).strip()
    if not (1 <= len(name) <= 60):
        raise ValueError("Le nom doit contenir entre 1 et 60 caractères.")
    if any(ord(ch) < 32 for ch in name):
        raise ValueError("Le nom contient un caractère invalide.")
    return name


def clean_birth_date(value: object) -> str:
    raw = str(value or "").strip()
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError("Date de naissance invalide.") from exc
    today = datetime.now(timezone.utc).date()
    if parsed.year < 1940 or parsed > today:
        raise ValueError("Date de naissance hors plage autorisée.")
    return parsed.isoformat()


def validate_payload(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("Corps JSON invalide.")
    student_id = str(raw.get("student_id", ""))
    if not STUDENT_ID_RE.fullmatch(student_id):
        raise ValueError("Identifiant élève invalide.")
    # Compatibilité ascendante : les anciens clients n'envoyaient qu'un display_name.
    first_name_raw = raw.get("first_name")
    last_name_raw = raw.get("last_name")
    birth_date_raw = raw.get("birth_date")
    if first_name_raw is not None or last_name_raw is not None or birth_date_raw is not None:
        first_name = clean_name(first_name_raw)
        last_name = clean_last_name(last_name_raw)
        birth_date = clean_birth_date(birth_date_raw)
        display_name = first_name
    else:
        display_name = clean_name(raw.get("display_name"))
        first_name = display_name
        last_name = ""
        birth_date = ""
    session_id = str(raw.get("session_id", "") or "")
    if session_id and not STUDENT_ID_RE.fullmatch(session_id):
        raise ValueError("Identifiant de session invalide.")

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

    activity = None
    if stage == "activity":
        raw_activity = raw.get("activity")
        if not isinstance(raw_activity, dict):
            raise ValueError("Événement d'activité invalide.")
        event = str(raw_activity.get("event", ""))
        route = str(raw_activity.get("route", ""))
        session_id = str(raw_activity.get("session_id", ""))
        if event not in ACTIVITY_EVENTS:
            raise ValueError("Type d'événement d'activité invalide.")
        if route not in ACTIVITY_ROUTES:
            raise ValueError("Page d'activité invalide.")
        if not STUDENT_ID_RE.fullmatch(session_id):
            raise ValueError("Identifiant de session invalide.")
        activity = {
            "event": event,
            "route": route,
            "session_id": session_id,
        }

    return {
        "student_id": student_id,
        "display_name": display_name,
        "first_name": first_name,
        "last_name": last_name,
        "birth_date": birth_date,
        "session_id": session_id,
        "stage": stage,
        "diagnostic": diagnostic,
        "challenge": challenge,
        "self_eval": self_eval,
        "activity": activity,
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
                "first_name": payload.get("first_name") or row["display_name"],
                "last_name": payload.get("last_name") or "",
                "birth_date": payload.get("birth_date") or "",
                "session_id": payload.get("session_id") or (payload.get("activity") or {}).get("session_id") or "",
                "stage": row["stage"],
                "created_at": row["created_at"],
                "diagnostic": payload.get("diagnostic"),
                "challenge": payload.get("challenge"),
                "self_eval": payload.get("self_eval"),
                "activity": payload.get("activity"),
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
    activity_counts: dict[str, int] = {}
    timelines: dict[str, list[dict]] = {}

    for row in rows:
        payload = json.loads(row["payload_json"])
        sid = row["student_id"]
        activity = payload.get("activity") or {}
        event_session_id = payload.get("session_id") or activity.get("session_id") or ""
        timelines.setdefault(sid, []).append(
            {
                "stage": row["stage"],
                "created_at": row["created_at"],
                "activity": activity,
                "session_id": event_session_id,
            }
        )
        if row["stage"] == "activity":
            activity_counts[sid] = activity_counts.get(sid, 0) + 1
        else:
            attempts[sid] = attempts.get(sid, 0) + 1

        current = by_student.get(sid, {})
        merged = {
            **current,
            "student_id": sid,
            "display_name": row["display_name"],
            "first_name": payload.get("first_name") or current.get("first_name") or row["display_name"],
            "last_name": payload.get("last_name") or current.get("last_name") or "",
            "birth_date": payload.get("birth_date") or current.get("birth_date") or "",
            "stage": row["stage"] if row["stage"] != "activity" else current.get("stage", "activity"),
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
        item["submissions"] = attempts.get(sid, 0)
        diag = item.get("diagnostic") or {}
        weak = list(diag.get("weak_domains") or [])
        strong = list(diag.get("strong_domains") or [])
        details = list(diag.get("details") or [])
        item["unknown_count"] = sum(
            1 for detail in details
            if str(detail.get("value", "")).strip().casefold() == "je ne sais pas"
        )
        item["recommended_start"] = weak[0] if weak else "Consolidation / défi PSR"
        item["strengths"] = strong
        item["weaknesses"] = weak

        sessions: dict[str, dict] = {}
        for event in timelines.get(sid, []):
            session_id = str(event.get("session_id") or "")
            if not session_id:
                continue
            session = sessions.setdefault(
                session_id,
                {
                    "session_started_at": None,
                    "routes": {},
                    "diagnostic_submitted_at": None,
                    "challenge_first_submitted_at": None,
                },
            )
            activity = event.get("activity") or {}
            if event["stage"] == "activity":
                if activity.get("event") == "session_started" and session["session_started_at"] is None:
                    session["session_started_at"] = event["created_at"]
                if activity.get("event") == "route_opened":
                    route = str(activity.get("route", ""))
                    if route and route not in session["routes"]:
                        session["routes"][route] = event["created_at"]
            elif event["stage"] == "diagnostic" and session["diagnostic_submitted_at"] is None:
                session["diagnostic_submitted_at"] = event["created_at"]
            elif event["stage"] == "challenge" and session["challenge_first_submitted_at"] is None:
                session["challenge_first_submitted_at"] = event["created_at"]

        ordered_sessions = sorted(
            sessions.values(),
            key=lambda session: session.get("session_started_at") or "9999",
        )
        diagnostic_session = next(
            (
                session for session in ordered_sessions
                if session["routes"].get("diagnostic") and session.get("diagnostic_submitted_at")
            ),
            None,
        )
        challenge_session = next(
            (
                session for session in ordered_sessions
                if session["routes"].get("defi") and session.get("challenge_first_submitted_at")
            ),
            None,
        )
        bilan_session = next(
            (
                session for session in ordered_sessions
                if session.get("session_started_at") and session["routes"].get("bilan")
            ),
            None,
        )
        first_session = next(
            (session for session in ordered_sessions if session.get("session_started_at")),
            None,
        )

        diagnostic_opened_at = diagnostic_session["routes"].get("diagnostic") if diagnostic_session else None
        diagnostic_submitted_at = diagnostic_session.get("diagnostic_submitted_at") if diagnostic_session else None
        challenge_opened_at = challenge_session["routes"].get("defi") if challenge_session else None
        challenge_first_submitted_at = challenge_session.get("challenge_first_submitted_at") if challenge_session else None
        session_started_at = first_session.get("session_started_at") if first_session else None
        bilan_opened_at = bilan_session["routes"].get("bilan") if bilan_session else None
        bilan_session_started_at = bilan_session.get("session_started_at") if bilan_session else None

        item["timing"] = {
            "session_started_at": session_started_at,
            "diagnostic_opened_at": diagnostic_opened_at,
            "diagnostic_submitted_at": diagnostic_submitted_at,
            "diagnostic_seconds": elapsed_seconds(diagnostic_opened_at, diagnostic_submitted_at),
            "challenge_opened_at": challenge_opened_at,
            "challenge_first_submitted_at": challenge_first_submitted_at,
            "challenge_seconds": elapsed_seconds(challenge_opened_at, challenge_first_submitted_at),
            "bilan_opened_at": bilan_opened_at,
            "session_to_bilan_seconds": elapsed_seconds(bilan_session_started_at, bilan_opened_at),
            "activity_events": activity_counts.get(sid, 0),
            "sessions_observed": len(sessions),
        }
        out.append(item)

    return sorted(
        out,
        key=lambda x: (
            str(x.get("last_name", "")).casefold(),
            str(x.get("first_name", x.get("display_name", ""))).casefold(),
            str(x.get("birth_date", "")),
        ),
    )


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
            writer.writerow([
                "nom", "prenom", "date_naissance", "id", "derniere_activite",
                "diagnostic", "je_ne_sais_pas", "defi", "forces", "a_travailler", "commencer_par",
                "debut_session", "diagnostic_ouvert", "diagnostic_rendu", "temps_diagnostic_s",
                "defi_ouvert", "premiere_reponse_defi", "temps_defi_s",
                "bilan_ouvert", "temps_session_jusqu_bilan_s", "evenements_temps"
            ])
            for item in rows:
                diag = item.get("diagnostic") or {}
                challenge = item.get("challenge") or {}
                timing = item.get("timing") or {}
                writer.writerow([
                    item.get("last_name", ""),
                    item.get("first_name", item.get("display_name", "")),
                    item.get("birth_date", ""),
                    item["student_id"], item["updated_at"],
                    diag.get("score", ""), item.get("unknown_count", 0), challenge.get("score", ""),
                    " | ".join(item.get("strengths", [])),
                    " | ".join(item.get("weaknesses", [])),
                    item.get("recommended_start", ""),
                    timing.get("session_started_at", ""),
                    timing.get("diagnostic_opened_at", ""),
                    timing.get("diagnostic_submitted_at", ""),
                    timing.get("diagnostic_seconds", ""),
                    timing.get("challenge_opened_at", ""),
                    timing.get("challenge_first_submitted_at", ""),
                    timing.get("challenge_seconds", ""),
                    timing.get("bilan_opened_at", ""),
                    timing.get("session_to_bilan_seconds", ""),
                    timing.get("activity_events", 0),
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

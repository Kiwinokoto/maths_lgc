#!/usr/bin/env python3
from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlencode, urlparse

import qrcode
from qrcode.image.svg import SvgPathImage

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("MATHS_DATA_DIR", ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "maths_lgc.sqlite3"
CLASS_STATE_PATH = DATA_DIR / "class_state.json"
SESSIONS_PATH = DATA_DIR / "sessions.json"
HOST = os.environ.get("MATHS_HOST", "0.0.0.0")
PORT = int(os.environ.get("MATHS_PORT", "8080"))
TEACHER_TOKEN = os.environ.get("MATHS_TEACHER_TOKEN", "")
PUBLIC_BASE_URL = os.environ.get("MATHS_PUBLIC_URL", "https://maths.lagrandeclasse.fr").rstrip("/")
PORTAL_BASE_URL = os.environ.get("MATHS_PORTAL_URL", "https://portail.lagrandeclasse.fr").rstrip("/")
TEACHER_SESSION_COOKIE = "maths_teacher_session"
SSO_PENDING_COOKIE = "maths_sso_pending"
TEACHER_SESSION_TTL_HOURS = int(os.environ.get("MATHS_TEACHER_SESSION_TTL_HOURS", "12"))
SSO_PENDING_TTL_SECONDS = 300
MAX_BODY = 64 * 1024
STUDENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
CLASS_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
VALID_STAGES = {"diagnostic", "challenge", "bilan", "activity"}
ACTIVITY_EVENTS = {"session_started", "route_opened", "activity_checked"}
ACTIVITY_ROUTES = {"parcours", "intro", "diagnostic", "correction", "defi", "bilan", "durees", "proportion", "pourcentages", "donnees", "equations", "fonctions", "commerce", "probabilites"}
TEACHERS = {
    "kevin": "Monsieur Kevin",
    "waren": "Monsieur Waren",
    "fadhila": "Madame Fadhila",
}
COURSE_SESSIONS = {"seance-1": "Séance 1"}
CLASS_STATE_LOCK = Lock()
SESSIONS_LOCK = Lock()


class ClosedSessionError(ValueError):
    pass


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
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS teacher_browser_sessions (
                token_hash TEXT PRIMARY KEY,
                portal_user_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_teacher_browser_sessions_expiry "
            "ON teacher_browser_sessions(expires_at)"
        )


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def redeem_portal_user(code: str, verifier: str) -> dict:
    code = str(code or "").strip()
    verifier = str(verifier or "").strip()
    if not code or not verifier:
        raise ValueError("Preuve Portail manquante.")
    body = json.dumps({
        "target": "maths",
        "code": code,
        "verifier": verifier,
    }, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        PORTAL_BASE_URL + "/api/sso/redeem",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = json.loads(response.read().decode("utf-8"))
    user = payload.get("user") if isinstance(payload, dict) else None
    if not isinstance(user, dict):
        raise ValueError("Réponse SSO invalide.")
    role = str(user.get("role") or "")
    display_name = " ".join(str(user.get("display_name") or "").split()).strip()
    portal_user_id = str(user.get("id") or "")
    if role not in {"admin", "teacher"} or not portal_user_id or not (1 <= len(display_name) <= 80):
        raise ValueError("Identité enseignant invalide.")
    return user


def create_teacher_browser_session(user: dict) -> tuple[str, datetime]:
    role = str(user.get("role") or "")
    display_name = " ".join(str(user.get("display_name") or "").split()).strip()
    portal_user_id = str(user.get("id") or "")
    if role not in {"admin", "teacher"} or not portal_user_id or not (1 <= len(display_name) <= 80):
        raise ValueError("Identité enseignant invalide.")

    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=TEACHER_SESSION_TTL_HOURS)
    with connect_db() as db:
        db.execute(
            "DELETE FROM teacher_browser_sessions WHERE expires_at<?",
            (now.isoformat(timespec="seconds"),),
        )
        db.execute(
            """INSERT INTO teacher_browser_sessions(
                token_hash,portal_user_id,display_name,role,expires_at,created_at
            ) VALUES(?,?,?,?,?,?)""",
            (
                _hash_secret(raw),
                portal_user_id,
                display_name,
                role,
                expires.isoformat(timespec="seconds"),
                now.isoformat(timespec="seconds"),
            ),
        )
    return raw, expires


def teacher_from_browser_session(raw: str) -> dict | None:
    if not raw:
        return None
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with connect_db() as db:
        row = db.execute(
            """SELECT portal_user_id,display_name,role,expires_at
               FROM teacher_browser_sessions
               WHERE token_hash=? AND expires_at>?""",
            (_hash_secret(raw), now),
        ).fetchone()
    return dict(row) if row else None


def delete_teacher_browser_session(raw: str) -> None:
    if not raw:
        return
    with connect_db() as db:
        db.execute(
            "DELETE FROM teacher_browser_sessions WHERE token_hash=?",
            (_hash_secret(raw),),
        )


def _read_class_state_file() -> dict:
    try:
        raw = json.loads(CLASS_STATE_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}
    return raw if isinstance(raw, dict) else {}


def _cohort_key(teacher_id: str, course_session: str) -> str:
    return f"{teacher_id}|{course_session}"


def read_class_state(teacher_id: str = "", course_session: str = "") -> dict:
    default = {
        "teacher_id": teacher_id,
        "teacher_label": TEACHERS.get(teacher_id, ""),
        "course_session": course_session,
        "course_session_label": COURSE_SESSIONS.get(course_session, ""),
        "corrections_unlocked": False,
        "updated_at": None,
    }
    with CLASS_STATE_LOCK:
        raw = _read_class_state_file()
    if teacher_id and course_session:
        cohorts = raw.get("cohorts")
        if not isinstance(cohorts, dict):
            return default
        state = cohorts.get(_cohort_key(teacher_id, course_session))
        if not isinstance(state, dict):
            return default
        return {
            **default,
            "corrections_unlocked": bool(state.get("corrections_unlocked", False)),
            "updated_at": state.get("updated_at"),
        }
    # Compatibilité avec l'ancien verrou global, uniquement pour les anciens clients.
    if "corrections_unlocked" in raw:
        return {
            **default,
            "corrections_unlocked": bool(raw.get("corrections_unlocked", False)),
            "updated_at": raw.get("updated_at"),
        }
    return default


def write_class_state(*, teacher_id: str, course_session: str, corrections_unlocked: bool) -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    state = {
        "corrections_unlocked": bool(corrections_unlocked),
        "updated_at": utc_now(),
    }
    with CLASS_STATE_LOCK:
        raw = _read_class_state_file()
        cohorts = raw.get("cohorts")
        if not isinstance(cohorts, dict):
            cohorts = {}
        cohorts[_cohort_key(teacher_id, course_session)] = state
        payload = {"version": 2, "cohorts": cohorts}
        temporary = CLASS_STATE_PATH.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        temporary.replace(CLASS_STATE_PATH)
    return {
        "teacher_id": teacher_id,
        "teacher_label": TEACHERS[teacher_id],
        "course_session": course_session,
        "course_session_label": COURSE_SESSIONS[course_session],
        **state,
    }


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


def clean_teacher_id(value: object) -> str:
    teacher_id = str(value or "").strip()
    if teacher_id not in TEACHERS:
        raise ValueError("Professeur invalide.")
    return teacher_id


def clean_course_session(value: object) -> str:
    course_session = str(value or "").strip()
    if course_session not in COURSE_SESSIONS:
        raise ValueError("Séance invalide.")
    return course_session


def clean_session_number(value: object) -> int:
    if isinstance(value, bool):
        raise ValueError("Numéro de séance invalide.")
    raw = str(value or "").strip()
    if not raw.isdigit():
        raise ValueError("Le numéro de séance doit être un entier.")
    number = int(raw)
    if not (1 <= number <= 999):
        raise ValueError("Le numéro de séance doit être compris entre 1 et 999.")
    return number


def clean_session_title(value: object) -> str:
    title = " ".join(str(value or "").split()).strip()
    if len(title) > 120:
        raise ValueError("Le titre de séance doit contenir au maximum 120 caractères.")
    if any(ord(ch) < 32 for ch in title):
        raise ValueError("Le titre de séance contient un caractère invalide.")
    return title


def session_label(number: int, title: str = "") -> str:
    base = f"Séance {number}"
    return f"{base} · {title}" if title else base


def clean_group_label(value: object) -> str:
    label = " ".join(str(value or "").split()).strip()
    if not (1 <= len(label) <= 80):
        raise ValueError("Le groupe doit contenir entre 1 et 80 caractères.")
    if any(ord(ch) < 32 for ch in label):
        raise ValueError("Le groupe contient un caractère invalide.")
    return label


def _read_sessions_file() -> dict:
    try:
        raw = json.loads(SESSIONS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {"version": 1, "sessions": {}}
    if not isinstance(raw, dict):
        return {"version": 1, "sessions": {}}
    sessions = raw.get("sessions")
    if not isinstance(sessions, dict):
        sessions = {}
    return {"version": 1, "sessions": sessions}


def _write_sessions_file(payload: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary = SESSIONS_PATH.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    temporary.replace(SESSIONS_PATH)


def _hash_session_admin_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_session(session: dict) -> dict:
    course_session = str(session.get("course_session") or "seance-1")
    match = re.fullmatch(r"seance-(\d+)", course_session)
    session_number = int(session.get("session_number") or (match.group(1) if match else 1))
    session_title = str(session.get("session_title") or "")
    course_session_label = str(session.get("course_session_label") or session_label(session_number, session_title))
    return {
        "class_session_id": session["class_session_id"],
        "teacher_id": session["teacher_id"],
        "teacher_label": session["teacher_label"],
        "session_number": session_number,
        "session_title": session_title,
        "course_session": course_session,
        "course_session_label": course_session_label,
        "group_label": session["group_label"],
        "active": bool(session.get("active", True)),
        "corrections_unlocked": bool(session.get("corrections_unlocked", False)),
        "created_at": session["created_at"],
        "updated_at": session.get("updated_at") or session["created_at"],
    }


def get_class_session(class_session_id: str) -> dict | None:
    if not CLASS_SESSION_ID_RE.fullmatch(class_session_id):
        return None
    with SESSIONS_LOCK:
        raw = _read_sessions_file()
        session = raw["sessions"].get(class_session_id)
    return dict(session) if isinstance(session, dict) else None


def _legacy_teacher_name(value: object) -> str:
    name = " ".join(str(value or "").split()).strip().casefold()
    for prefix in ("monsieur ", "madame ", "m. ", "mme "):
        if name.startswith(prefix):
            name = name[len(prefix):].strip()
            break
    return name


def legacy_teacher_id_for_portal_name(display_name: object) -> str:
    target = _legacy_teacher_name(display_name)
    if not target:
        return ""
    matches = [
        teacher_id
        for teacher_id, label in TEACHERS.items()
        if _legacy_teacher_name(label) == target
    ]
    return matches[0] if len(matches) == 1 else ""


def adopt_legacy_sessions_for_portal_user(user: dict | None) -> int:
    """Attach pre-SSO sessions only when the legacy teacher name is unambiguous.

    This compatibility migration is intentionally narrow: it never changes
    sessions already owned by another Portail identity, and it keeps all
    historical session ids / management tokens intact.
    """
    if not isinstance(user, dict):
        return 0
    portal_user_id = str(user.get("portal_user_id") or user.get("id") or "").strip()
    display_name = str(user.get("display_name") or "").strip()
    teacher_id = legacy_teacher_id_for_portal_name(display_name)
    if not portal_user_id or not teacher_id:
        return 0

    changed = 0
    with SESSIONS_LOCK:
        raw = _read_sessions_file()
        sessions = raw.get("sessions")
        if not isinstance(sessions, dict):
            return 0
        for session in sessions.values():
            if not isinstance(session, dict):
                continue
            if str(session.get("owner_portal_user_id") or ""):
                continue
            if str(session.get("teacher_id") or "") != teacher_id:
                continue
            session["owner_portal_user_id"] = portal_user_id
            changed += 1
        if changed:
            _write_sessions_file(raw)
    return changed


def teacher_owned_sessions(portal_user_id: str) -> list[dict]:
    if not portal_user_id:
        return []
    with SESSIONS_LOCK:
        raw = _read_sessions_file()
        sessions = [
            public_session(item)
            for item in raw["sessions"].values()
            if isinstance(item, dict)
            and str(item.get("owner_portal_user_id") or "") == portal_user_id
        ]
    return sorted(sessions, key=lambda item: item["created_at"], reverse=True)


def create_class_session(
    *,
    teacher_id: str,
    session_number: int,
    session_title: str,
    group_label: str,
    teacher_label: str = "",
    owner_portal_user_id: str = "",
) -> tuple[dict, str]:
    now = utc_now()
    course_session = f"seance-{session_number}"
    course_session_label = session_label(session_number, session_title)
    if owner_portal_user_id:
        teacher_label = " ".join(str(teacher_label or "").split()).strip()
        if not (1 <= len(teacher_label) <= 80):
            raise ValueError("Identité enseignant invalide.")
    else:
        teacher_label = TEACHERS[teacher_id]

    with SESSIONS_LOCK:
        raw = _read_sessions_file()
        sessions = raw["sessions"]
        while True:
            class_session_id = secrets.token_urlsafe(15)
            if CLASS_SESSION_ID_RE.fullmatch(class_session_id) and class_session_id not in sessions:
                break
        admin_token = secrets.token_urlsafe(32)
        session = {
            "class_session_id": class_session_id,
            "teacher_id": teacher_id,
            "teacher_label": teacher_label,
            "owner_portal_user_id": owner_portal_user_id,
            "session_number": session_number,
            "session_title": session_title,
            "course_session": course_session,
            "course_session_label": course_session_label,
            "group_label": group_label,
            "admin_token_hash": _hash_session_admin_token(admin_token),
            "active": True,
            "corrections_unlocked": False,
            "created_at": now,
            "updated_at": now,
        }
        sessions[class_session_id] = session
        _write_sessions_file(raw)
    return public_session(session), admin_token


def update_session_active(*, class_session_id: str, active: bool) -> dict:
    with SESSIONS_LOCK:
        raw = _read_sessions_file()
        session = raw["sessions"].get(class_session_id)
        if not isinstance(session, dict):
            raise ValueError("Séance introuvable.")
        session["active"] = bool(active)
        if not active:
            session["corrections_unlocked"] = False
        session["updated_at"] = utc_now()
        raw["sessions"][class_session_id] = session
        _write_sessions_file(raw)
    return public_session(session)


def update_session_corrections(*, class_session_id: str, unlocked: bool) -> dict:
    with SESSIONS_LOCK:
        raw = _read_sessions_file()
        session = raw["sessions"].get(class_session_id)
        if not isinstance(session, dict):
            raise ValueError("Séance introuvable.")
        if not bool(session.get("active", True)):
            raise ValueError("Réouvre la séance avant de modifier les corrigés.")
        session["corrections_unlocked"] = bool(unlocked)
        session["updated_at"] = utc_now()
        raw["sessions"][class_session_id] = session
        _write_sessions_file(raw)
    return public_session(session)


def session_admin_authorized(class_session_id: str, supplied_token: str) -> bool:
    session = get_class_session(class_session_id)
    if not session or not supplied_token:
        return False
    supplied_hash = _hash_session_admin_token(supplied_token)
    return secrets.compare_digest(supplied_hash, str(session.get("admin_token_hash", "")))


def session_join_url(class_session_id: str) -> str:
    return f"{PUBLIC_BASE_URL}/?{urlencode({'session': class_session_id})}"


def session_qr_svg(class_session_id: str) -> bytes:
    image = qrcode.make(
        session_join_url(class_session_id),
        image_factory=SvgPathImage,
        box_size=8,
        border=4,
    )
    svg = image.to_string()
    return svg.encode("utf-8") if isinstance(svg, str) else svg


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
    class_session_id = str(raw.get("class_session_id", "") or "").strip()
    if class_session_id:
        class_session = get_class_session(class_session_id)
        if not class_session:
            raise ValueError("Séance de classe invalide ou inconnue.")
        if not bool(class_session.get("active", True)):
            raise ClosedSessionError("Cette séance est fermée.")
        teacher_id = class_session["teacher_id"]
        course_session = class_session["course_session"]
        group_label = class_session["group_label"]
    else:
        # Compatibilité avec les données historiques créées avant les liens de séance.
        teacher_id_raw = raw.get("teacher_id")
        course_session_raw = raw.get("course_session")
        if teacher_id_raw is not None or course_session_raw is not None:
            teacher_id = clean_teacher_id(teacher_id_raw)
            course_session = clean_course_session(course_session_raw)
        else:
            teacher_id = ""
            course_session = ""
        group_label = ""

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
        "class_session_id": class_session_id,
        "teacher_id": teacher_id,
        "teacher_label": TEACHERS.get(teacher_id, ""),
        "course_session": course_session,
        "course_session_label": COURSE_SESSIONS.get(course_session, ""),
        "group_label": group_label,
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
                "class_session_id": payload.get("class_session_id") or "",
                "teacher_id": payload.get("teacher_id") or "",
                "teacher_label": payload.get("teacher_label") or TEACHERS.get(payload.get("teacher_id") or "", ""),
                "course_session": payload.get("course_session") or "",
                "course_session_label": payload.get("course_session_label") or COURSE_SESSIONS.get(payload.get("course_session") or "", ""),
                "group_label": payload.get("group_label") or "",
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
        class_session_id = payload.get("class_session_id") or ""
        teacher_id = payload.get("teacher_id") or ""
        course_session = payload.get("course_session") or ""
        cohort_key = class_session_id or f"legacy:{teacher_id}|{course_session}"
        cohort_student_key = f"{sid}|{cohort_key}"
        activity = payload.get("activity") or {}
        event_session_id = payload.get("session_id") or activity.get("session_id") or ""
        timelines.setdefault(cohort_student_key, []).append(
            {
                "stage": row["stage"],
                "created_at": row["created_at"],
                "activity": activity,
                "session_id": event_session_id,
            }
        )
        if row["stage"] == "activity":
            activity_counts[cohort_student_key] = activity_counts.get(cohort_student_key, 0) + 1
        else:
            attempts[cohort_student_key] = attempts.get(cohort_student_key, 0) + 1

        current = by_student.get(cohort_student_key, {})
        merged = {
            **current,
            "student_id": sid,
            "class_session_id": class_session_id,
            "teacher_id": teacher_id,
            "teacher_label": payload.get("teacher_label") or TEACHERS.get(teacher_id, ""),
            "course_session": course_session,
            "course_session_label": payload.get("course_session_label") or COURSE_SESSIONS.get(course_session, ""),
            "group_label": payload.get("group_label") or current.get("group_label") or "",
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
        by_student[cohort_student_key] = merged

    out = []
    for cohort_student_key, item in by_student.items():
        item["submissions"] = attempts.get(cohort_student_key, 0)
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
        for event in timelines.get(cohort_student_key, []):
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
            "activity_events": activity_counts.get(cohort_student_key, 0),
            "sessions_observed": len(sessions),
        }
        out.append(item)

    return sorted(
        out,
        key=lambda x: (
            str(x.get("teacher_label", "")).casefold(),
            str(x.get("course_session", "")).casefold(),
            str(x.get("last_name", "")).casefold(),
            str(x.get("first_name", x.get("display_name", ""))).casefold(),
            str(x.get("birth_date", "")),
        ),
    )


def filter_by_context(items: list[dict], teacher_id: str = "", course_session: str = "") -> list[dict]:
    filtered = items
    if teacher_id:
        filtered = [item for item in filtered if item.get("teacher_id") == teacher_id]
    if course_session:
        filtered = [item for item in filtered if item.get("course_session") == course_session]
    return filtered


def filter_by_class_session(items: list[dict], class_session_id: str) -> list[dict]:
    return [item for item in items if item.get("class_session_id") == class_session_id]


class Handler(BaseHTTPRequestHandler):
    server_version = "MathsLGC/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _headers(
        self,
        status: int,
        content_type: str,
        length: int | None = None,
        *,
        cookies: list[str] | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.end_headers()

    def _json(self, status: int, payload: object, *, cookies: list[str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self._headers(status, "application/json; charset=utf-8", len(body), cookies=cookies)
        self.wfile.write(body)

    def _redirect(self, location: str, *, cookies: list[str] | None = None) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.send_header("Cache-Control", "no-store")
        for cookie in cookies or []:
            self.send_header("Set-Cookie", cookie)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _cookie(self, name: str) -> str:
        cookie = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookie.get(name)
        return morsel.value if morsel else ""

    def _cookie_header(
        self,
        name: str,
        value: str,
        *,
        max_age: int,
        path: str = "/",
        same_site: str = "Strict",
    ) -> str:
        secure = "; Secure" if PUBLIC_BASE_URL.startswith("https://") else ""
        return (
            f"{name}={value}; Path={path}; HttpOnly; SameSite={same_site}; "
            f"Max-Age={max_age}{secure}"
        )

    def _clear_cookie(self, name: str, *, path: str = "/") -> str:
        secure = "; Secure" if PUBLIC_BASE_URL.startswith("https://") else ""
        return f"{name}=; Path={path}; HttpOnly; SameSite=Strict; Max-Age=0{secure}"

    def _teacher_identity(self) -> dict | None:
        return teacher_from_browser_session(self._cookie(TEACHER_SESSION_COOKIE))

    def _authorized(self) -> bool:
        if self._teacher_identity():
            return True
        if not TEACHER_TOKEN:
            return False
        auth = self.headers.get("Authorization", "")
        supplied = auth[7:] if auth.startswith("Bearer ") else self.headers.get("X-Teacher-Token", "")
        return bool(supplied) and secrets.compare_digest(supplied, TEACHER_TOKEN)

    def _session_admin_authorized(self, class_session_id: str) -> bool:
        session = get_class_session(class_session_id)
        if not session:
            return False
        identity = self._teacher_identity()
        if identity:
            owner_id = str(session.get("owner_portal_user_id") or "")
            if owner_id and secrets.compare_digest(owner_id, str(identity["portal_user_id"])):
                return True
        supplied = self.headers.get("X-Session-Token", "")
        return session_admin_authorized(class_session_id, supplied)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        teacher_filter = str((query.get("teacher") or [""])[0]).strip()
        legacy_session_filter = str((query.get("session") or [""])[0]).strip()
        class_session_id = str((query.get("id") or [""])[0]).strip()
        if teacher_filter and teacher_filter not in TEACHERS:
            return self._json(400, {"error": "Professeur invalide."})
        if legacy_session_filter and path == "/api/class-state" and legacy_session_filter not in COURSE_SESSIONS:
            return self._json(400, {"error": "Séance invalide."})
        if path == "/healthz":
            return self._json(200, {"ok": True})
        if path == "/api/sso/start":
            tab = str((query.get("tab") or [""])[0]).strip()
            tab = tab if tab in {"create", "inspect", "corrections", "live", "reports"} else "create"
            requested_session = str((query.get("session") or [""])[0]).strip()
            if requested_session and not CLASS_SESSION_ID_RE.fullmatch(requested_session):
                requested_session = ""
            if self._teacher_identity():
                target_query = {"tab": tab}
                if requested_session:
                    target_query["session"] = requested_session
                return self._redirect("/teacher?" + urlencode(target_query))

            verifier = secrets.token_urlsafe(48)
            state = secrets.token_urlsafe(24)
            challenge = _pkce_challenge(verifier)
            pending = f"{state}.{verifier}.{tab}.{requested_session}"
            pending_cookie = self._cookie_header(
                SSO_PENDING_COOKIE,
                pending,
                max_age=SSO_PENDING_TTL_SECONDS,
                path="/api/sso",
                same_site="Lax",
            )
            authorize_url = PORTAL_BASE_URL + "/api/sso/authorize?" + urlencode({
                "target": "maths",
                "challenge": challenge,
                "state": state,
            })
            return self._redirect(authorize_url, cookies=[pending_cookie])
        if path == "/api/sso/callback":
            code = str((query.get("code") or [""])[0]).strip()
            state = str((query.get("state") or [""])[0]).strip()
            pending = self._cookie(SSO_PENDING_COOKIE)
            clear_pending = self._clear_cookie(SSO_PENDING_COOKIE, path="/api/sso")
            try:
                pending_parts = pending.split(".", 3)
                if len(pending_parts) == 3:
                    pending_state, verifier, tab = pending_parts
                    requested_session = ""
                else:
                    pending_state, verifier, tab, requested_session = pending_parts
            except ValueError:
                return self._redirect("/teacher?sso=failed", cookies=[clear_pending])
            if not code or not state or not secrets.compare_digest(state, pending_state):
                return self._redirect("/teacher?sso=failed", cookies=[clear_pending])
            if tab not in {"create", "inspect", "corrections", "live", "reports"}:
                tab = "create"
            if requested_session and not CLASS_SESSION_ID_RE.fullmatch(requested_session):
                requested_session = ""

            try:
                user = redeem_portal_user(code, verifier)
                adopt_legacy_sessions_for_portal_user(user)
                raw_session, expires = create_teacher_browser_session(user)
            except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError):
                return self._redirect("/teacher?sso=failed", cookies=[clear_pending])

            max_age = max(1, int((expires - datetime.now(timezone.utc)).total_seconds()))
            teacher_cookie = self._cookie_header(
                TEACHER_SESSION_COOKIE,
                raw_session,
                max_age=max_age,
                path="/",
                same_site="Strict",
            )
            target_query = {"tab": tab}
            if requested_session:
                target_query["session"] = requested_session
            return self._redirect(
                "/teacher?" + urlencode(target_query),
                cookies=[teacher_cookie, clear_pending],
            )
        if path == "/api/session":
            session = get_class_session(class_session_id)
            if not session:
                return self._json(404, {"error": "Séance introuvable."})
            if not bool(session.get("active", True)):
                return self._json(HTTPStatus.GONE, {"error": "Cette séance est fermée."})
            return self._json(200, public_session(session))
        if path == "/api/session-qr":
            session = get_class_session(class_session_id)
            if not session:
                return self._json(404, {"error": "Séance introuvable."})
            if not bool(session.get("active", True)):
                return self._json(HTTPStatus.GONE, {"error": "Cette séance est fermée."})
            body = session_qr_svg(class_session_id)
            self._headers(200, "image/svg+xml; charset=utf-8", len(body))
            self.wfile.write(body)
            return
        if path == "/api/class-state":
            return self._json(200, read_class_state(teacher_filter, legacy_session_filter))
        if path in {"/api/teacher/status", "/api/teacher/summary"}:
            if not self._authorized():
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès enseignant refusé."})
            identity = self._teacher_identity()
            return self._json(200, {
                "ok": True,
                "user": identity,
                "auth_mode": "portal-sso" if identity else "legacy-token",
                "generated_at": utc_now(),
            })
        if path == "/api/teacher/sessions":
            if not self._authorized():
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès enseignant refusé."})
            identity = self._teacher_identity()
            if identity:
                adopt_legacy_sessions_for_portal_user(identity)
            sessions = teacher_owned_sessions(str(identity["portal_user_id"])) if identity else []
            return self._json(200, {
                "sessions": sessions,
                "auth_mode": "portal-sso" if identity else "legacy-token",
            })
        if path == "/api/teacher/session-summary":
            session = get_class_session(class_session_id)
            if not session:
                return self._json(404, {"error": "Séance introuvable."})
            if not self._session_admin_authorized(class_session_id):
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès à cette séance refusé."})
            students = filter_by_class_session(latest_students(), class_session_id)
            return self._json(200, {
                "session": public_session(session),
                "students": students,
                "count": len(students),
                "generated_at": utc_now(),
            })
        if path == "/api/teacher/session-history":
            session = get_class_session(class_session_id)
            if not session:
                return self._json(404, {"error": "Séance introuvable."})
            if not self._session_admin_authorized(class_session_id):
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès à cette séance refusé."})
            history = filter_by_class_session(submission_history(), class_session_id)
            return self._json(200, {
                "session": public_session(session),
                "submissions": history,
                "count": len(history),
                "generated_at": utc_now(),
            })
        if path == "/api/teacher/session-export.csv":
            session = get_class_session(class_session_id)
            if not session:
                return self._json(404, {"error": "Séance introuvable."})
            if not self._session_admin_authorized(class_session_id):
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès à cette séance refusé."})
            rows = filter_by_class_session(latest_students(), class_session_id)
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow([
                "nom", "prenom", "date_naissance", "professeur", "seance", "groupe", "id", "derniere_activite",
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
                    item.get("teacher_label", ""),
                    item.get("course_session_label", ""),
                    item.get("group_label", ""),
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
        if path == "/api/teacher/logout":
            raw = self._cookie(TEACHER_SESSION_COOKIE)
            delete_teacher_browser_session(raw)
            return self._json(
                200,
                {"ok": True},
                cookies=[self._clear_cookie(TEACHER_SESSION_COOKIE)],
            )

        allowed_paths = {
            "/api/progress",
            "/api/portal/session-summaries",
            "/api/teacher/corrections",
            "/api/teacher/sessions",
            "/api/teacher/session-corrections",
            "/api/teacher/session-active",
        }
        if path not in allowed_paths:
            return self._json(404, {"error": "Route inconnue."})
        if path in {"/api/teacher/corrections", "/api/teacher/sessions"} and not self._authorized():
            return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès enseignant refusé."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._json(400, {"error": "Taille invalide."})
        if length <= 0 or length > MAX_BODY:
            return self._json(413, {"error": "Requête trop volumineuse."})
        try:
            raw = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            return self._json(400, {"error": str(exc)})

        if path == "/api/portal/session-summaries":
            if not isinstance(raw, dict):
                return self._json(400, {"error": "Preuve Portail invalide."})
            try:
                user = redeem_portal_user(raw.get("code"), raw.get("verifier"))
            except urllib.error.HTTPError:
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Preuve Portail refusée."})
            except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError):
                return self._json(HTTPStatus.BAD_GATEWAY, {"error": "Portail LGC indisponible."})
            adopt_legacy_sessions_for_portal_user(user)
            sessions = teacher_owned_sessions(str(user["id"]))
            return self._json(200, {"sessions": sessions})

        if path == "/api/teacher/sessions":
            if not isinstance(raw, dict):
                return self._json(400, {"error": "Données de séance invalides."})
            identity = self._teacher_identity()
            try:
                session_number = clean_session_number(raw.get("session_number"))
                session_title = clean_session_title(raw.get("session_title"))
                group_label = clean_group_label(raw.get("group_label"))
                if identity:
                    owner_id = str(identity["portal_user_id"])
                    teacher_id = f"portal-{owner_id}"
                    teacher_label = str(identity["display_name"])
                else:
                    owner_id = ""
                    teacher_id = clean_teacher_id(raw.get("teacher_id"))
                    teacher_label = TEACHERS[teacher_id]
            except ValueError as exc:
                return self._json(400, {"error": str(exc)})
            session, admin_token = create_class_session(
                teacher_id=teacher_id,
                teacher_label=teacher_label,
                owner_portal_user_id=owner_id,
                session_number=session_number,
                session_title=session_title,
                group_label=group_label,
            )
            session_id = session["class_session_id"]
            response = {
                "session": session,
                "join_url": session_join_url(session_id),
                "manage_url": f"{PUBLIC_BASE_URL}/teacher?session={session_id}",
                "qr_url": f"/api/session-qr?id={session_id}",
                "access_mode": "portal-owner" if identity else "session-token",
            }
            if not identity:
                response["admin_token"] = admin_token
                response["manage_url"] += f"#token={admin_token}"
            return self._json(201, response)

        if path == "/api/teacher/session-active":
            if not isinstance(raw, dict) or not isinstance(raw.get("active"), bool):
                return self._json(400, {"error": "État de séance invalide."})
            class_session_id = str(raw.get("class_session_id", "") or "").strip()
            if not get_class_session(class_session_id):
                return self._json(404, {"error": "Séance introuvable."})
            if not self._session_admin_authorized(class_session_id):
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès à cette séance refusé."})
            try:
                session = update_session_active(
                    class_session_id=class_session_id,
                    active=raw["active"],
                )
            except ValueError as exc:
                return self._json(400, {"error": str(exc)})
            return self._json(200, session)

        if path == "/api/teacher/session-corrections":
            if not isinstance(raw, dict) or not isinstance(raw.get("unlocked"), bool):
                return self._json(400, {"error": "État des corrigés invalide."})
            class_session_id = str(raw.get("class_session_id", "") or "").strip()
            if not get_class_session(class_session_id):
                return self._json(404, {"error": "Séance introuvable."})
            if not self._session_admin_authorized(class_session_id):
                return self._json(HTTPStatus.UNAUTHORIZED, {"error": "Accès à cette séance refusé."})
            try:
                session = update_session_corrections(
                    class_session_id=class_session_id,
                    unlocked=raw["unlocked"],
                )
            except ValueError as exc:
                return self._json(400, {"error": str(exc)})
            return self._json(200, session)

        if path == "/api/teacher/corrections":
            if not isinstance(raw, dict) or not isinstance(raw.get("unlocked"), bool):
                return self._json(400, {"error": "État des corrigés invalide."})
            try:
                teacher_id = clean_teacher_id(raw.get("teacher_id"))
                course_session = clean_course_session(raw.get("course_session"))
            except ValueError as exc:
                return self._json(400, {"error": str(exc)})
            return self._json(
                200,
                write_class_state(
                    teacher_id=teacher_id,
                    course_session=course_session,
                    corrections_unlocked=raw["unlocked"],
                ),
            )

        try:
            payload = validate_payload(raw)
        except ClosedSessionError as exc:
            return self._json(HTTPStatus.GONE, {"error": str(exc)})
        except ValueError as exc:
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

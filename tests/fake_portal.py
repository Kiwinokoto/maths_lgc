#!/usr/bin/env python3
from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ["FAKE_PORTAL_PORT"])
VALID_CODE = "summary-code"
VALID_VERIFIER = "v" * 48
used = False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def _json(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        global used
        if self.path != "/api/sso/redeem":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) if length else b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "bad request"})
        if (
            used
            or payload.get("target") != "maths"
            or payload.get("code") != VALID_CODE
            or payload.get("verifier") != VALID_VERIFIER
        ):
            return self._json(HTTPStatus.UNAUTHORIZED, {"error": "invalid code"})
        used = True
        return self._json(200, {
            "user": {"id": 42, "display_name": "Kevin Portail", "role": "teacher"}
        })


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()

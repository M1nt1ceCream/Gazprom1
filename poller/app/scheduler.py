import logging
import os
import time
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psycopg

from app.poller import run_once

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("obsbay-scheduler")
interval = max(900, int(os.getenv("POLL_INTERVAL_SECONDS", "21600")))


class StatusHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/status":
            self.send_error(404)
            return
        try:
            with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
                row = conn.execute("SELECT last_success, feature_count, last_error FROM import_status WHERE id=1").fetchone()
            payload = {"last_success": row[0].isoformat() if row[0] else None, "feature_count": row[1], "last_error": row[2]}
            status = 200
        except Exception as exc:
            payload, status = {"error": str(exc)}, 503
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        return


threading.Thread(target=lambda: ThreadingHTTPServer(("0.0.0.0", 8000), StatusHandler).serve_forever(), daemon=True).start()

while True:
    try:
        run_once()
    except Exception as exc:
        log.exception("Import failed; existing database snapshot was kept")
        from app.poller import record_error
        record_error(exc)
    time.sleep(interval)

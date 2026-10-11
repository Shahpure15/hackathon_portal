from datetime import datetime, timedelta
import logging
import threading
import time

from app.config import settings
from app.database import SessionLocal
from app.models import EmailOutbox
from app.services.email_outbox import process_due

logger = logging.getLogger("email_worker")

_worker_thread = None
_stop_event = threading.Event()


def _requeue_stuck_sending(db):
    try:
        ten_mins_ago = datetime.utcnow() - timedelta(minutes=10)
        stuck_rows = (
            db.query(EmailOutbox)
            .filter(
                EmailOutbox.status == "sending",
                EmailOutbox.nextAttemptAt < ten_mins_ago,
            )
            .all()
        )
        if stuck_rows:
            for r in stuck_rows:
                r.status = "queued"
                r.error = "Requeued from stuck sending state on worker start"
            db.commit()
            logger.info(f"Requeued {len(stuck_rows)} stuck sending outbox rows.")
    except Exception as e:
        logger.error(f"Error requeuing stuck outbox rows: {e}")
        db.rollback()


def _worker_loop():
    logger.info("Email worker thread started.")
    # Requeue stuck rows once on startup
    with SessionLocal() as db:
        _requeue_stuck_sending(db)

    while not _stop_event.is_set():
        try:
            with SessionLocal() as db:
                process_due(db, limit=10)
        except Exception as e:
            logger.error(f"Error in email worker processing loop: {e}")

        # Sleep in short increments to respond quickly to stop event
        for _ in range(30):
            if _stop_event.is_set():
                break
            time.sleep(0.1)

    logger.info("Email worker thread stopped.")


def start_email_worker():
    global _worker_thread
    if not settings.EMAIL_WORKER_ENABLED:
        logger.info("Email worker is disabled in settings.")
        return

    if settings.ENVIRONMENT == "test":
        logger.info("Email worker is disabled in test environment.")
        return

    if _worker_thread and _worker_thread.is_alive():
        return

    _stop_event.clear()
    _worker_thread = threading.Thread(target=_worker_loop, daemon=True, name="EmailWorkerThread")
    _worker_thread.start()


def stop_email_worker():
    global _worker_thread
    _stop_event.set()
    if _worker_thread and _worker_thread.is_alive():
        _worker_thread.join(timeout=3)
        _worker_thread = None

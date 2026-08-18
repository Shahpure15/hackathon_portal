import os
import logging
import sys

class UnbufferedStreamHandler(logging.StreamHandler):
    def emit(self, record):
        super().emit(record)
        self.flush()

def setup_logger(name: str = "portal") -> logging.Logger:
    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, level_name, logging.INFO)

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(line_buffering=True)
        except Exception:
            pass

    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    logger.handlers.clear()

    handler = UnbufferedStreamHandler(sys.stdout)
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False

    for uvicorn_logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        u_logger = logging.getLogger(uvicorn_logger_name)
        u_logger.setLevel(log_level)
        if not any(isinstance(h, UnbufferedStreamHandler) for h in u_logger.handlers):
            u_handler = UnbufferedStreamHandler(sys.stdout)
            u_handler.setFormatter(formatter)
            u_logger.addHandler(u_handler)

    return logger

logger = setup_logger()



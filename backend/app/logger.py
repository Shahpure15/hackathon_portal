import os
import logging
import sys

def setup_logger(name: str = "portal") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
        logger.setLevel(getattr(logging, level_name, logging.INFO))
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger

logger = setup_logger()


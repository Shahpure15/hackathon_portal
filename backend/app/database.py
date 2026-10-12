from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings
from app.db_url import normalize_db_url

# For SQLite, we need connect_args={"check_same_thread": False}
connect_args = {}
engine_kwargs = {
    "pool_pre_ping": True,
    "pool_recycle": 300
}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 20,
        "pool_timeout": 30
    })

engine = create_engine(
    normalize_db_url(settings.DATABASE_URL),
    connect_args=connect_args,
    **engine_kwargs
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

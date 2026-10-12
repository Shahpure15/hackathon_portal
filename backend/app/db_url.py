def normalize_db_url(url: str) -> str:
    """postgres:// and postgresql:// both mean the psycopg2 driver here; other URLs are unchanged."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url

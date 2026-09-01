"""Entry point kept for process managers that run `uvicorn server:app`.

The application itself lives in app/ — start there.
"""
from app.main import app

__all__ = ["app"]

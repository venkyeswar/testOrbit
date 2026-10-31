import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import worker
from .api import accounts, model_configs, projects, testing
from .config import CORS_ORIGINS
from .db import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("testorbit")
logging.getLogger("alembic.runtime.plugins").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    interrupted = worker.mark_interrupted()
    if interrupted:
        log.warning("marked %d unfinished run(s) from a previous process as interrupted", interrupted)
    yield
    worker.shutdown()


app = FastAPI(title="TestOrbit", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["Authorization", "Content-Type"])


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/health")
def health():
    return {"ok": True}


for module in (accounts, model_configs, projects, testing):
    app.include_router(module.router)

"""Background execution of test runs.

Runs are queued in the DB and executed on a thread pool inside the API process, persisting progress
as each test finishes so the UI can poll. Single-node by design: for multiple API processes, swap the
pool for a shared queue (e.g. arq / Celery) — `execute_run` is the job body either way.
"""
import copy
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException
from sqlalchemy import select, update

from .db import SessionLocal, now
from .deps import project_llm
from .graphs import run_graph
from .models import Run, TestCase

log = logging.getLogger("testorbit.worker")
_pool: ThreadPoolExecutor | None = None


def submit(run_id: str) -> None:
    global _pool
    if _pool is None:
        _pool = ThreadPoolExecutor(max_workers=int(os.getenv("RUN_WORKERS", "4")), thread_name_prefix="run")
    _pool.submit(_safe_execute, run_id)


def shutdown() -> None:
    global _pool
    if _pool is not None:
        _pool.shutdown(wait=False, cancel_futures=True)
        _pool = None


def mark_interrupted() -> int:
    """Runs left queued/running by a previous process can never finish; close them out."""
    with SessionLocal() as db:
        res = db.execute(update(Run).where(Run.status.in_(("queued", "running")))
                         .values(status="interrupted", finished_at=now(),
                                 error="The server restarted while this run was in progress"))
        db.commit()
        return res.rowcount or 0


def _safe_execute(run_id: str) -> None:
    try:
        execute_run(run_id)
    except Exception as exc:  # never let a job die silently
        log.exception("run %s crashed", run_id)
        with SessionLocal() as db:
            run = db.get(Run, run_id)
            if run:
                run.status, run.finished_at, run.error = "failed", now(), str(exc)[:1000]
                db.commit()


def execute_run(run_id: str) -> None:
    with SessionLocal() as db:
        run = db.get(Run, run_id)
        if not run or run.status != "queued":
            return
        project = run.project
        by_id = {t.id: t for t in db.scalars(select(TestCase).where(TestCase.id.in_(run.test_ids or [])))}
        tests = [by_id[i].to_dict() for i in run.test_ids or [] if i in by_id]
        try:
            model = project_llm(db, project.user, project)
        except HTTPException:
            model = None  # unreadable key: run without AI diagnosis
        total = len(tests)
        run.status, run.started_at = "running", now()
        run.progress = {"done": 0, "total": total, "stage": "authenticating"}
        db.commit()

        def on_progress(stage: str, results: list) -> None:
            run.progress = {"done": len(results), "total": total, "stage": stage}
            # Deep copy: graph nodes keep mutating these dicts (e.g. adding diagnoses), and SQLAlchemy
            # only writes a JSON column when the new value differs from the one it last saved.
            run.results = copy.deepcopy(results)
            db.commit()

        state = run_graph.invoke(
            {"project": {**project.to_dict(), "auth": project.auth}, "tests": tests, "run": {"id": run.id},
             "t0": time.time()},
            config={"configurable": {"llm": model, "on_progress": on_progress}},
        )
        result = state["run"]
        run.status, run.finished_at = result["status"], result["finished_at"]
        run.summary, run.auth, run.results = result["summary"], result["auth"], result["results"]
        run.progress = {"done": total, "total": total, "stage": "done"}
        db.commit()
        log.info("run %s finished: %s", run_id, run.summary)

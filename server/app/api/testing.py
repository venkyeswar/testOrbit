"""Test cases and runs."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import worker
from ..db import get_db
from ..deps import owned_project, project_llm
from ..graphs import generation_graph
from ..models import Project, Run, TestCase, User
from ..schemas import TEST_EDITABLE_FIELDS, ApproveIn, GenerateIn, RunIn
from ..security import current_user

router = APIRouter(prefix="/api", tags=["testing"])
log = logging.getLogger("testorbit")


def owned_test(db: Session, user: User, test_id: str) -> TestCase:
    test = db.get(TestCase, test_id)
    if not test or test.project.user_id != user.id:
        raise HTTPException(404, "Test not found")
    return test


def project_tests(db: Session, project: Project) -> list[TestCase]:
    return list(db.scalars(select(TestCase).where(TestCase.project_id == project.id).order_by(TestCase.order)))


# ---------------------------------------------------------------- tests

@router.post("/projects/{pid}/tests/generate")
def generate(pid: str, body: GenerateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = owned_project(db, user, pid)
    model = project_llm(db, user, project)
    if model is None:
        raise HTTPException(400, "No model configured. Add one under Models.")
    endpoints = [e for e in project.endpoints if not body.endpoint_ids or e["id"] in body.endpoint_ids]
    if not endpoints:
        raise HTTPException(400, "No endpoints selected")
    start = db.scalar(select(func.max(TestCase.order)).where(TestCase.project_id == pid)) or 0
    try:
        state = generation_graph.invoke(
            {"project": project.to_dict(), "endpoints": endpoints, "categories": body.categories,
             "max_tests": body.max_tests, "start_order": start},
            config={"configurable": {"llm": model}},
        )
    except Exception as exc:
        log.exception("generation failed for project %s", pid)
        raise HTTPException(502, f"Test generation failed: {str(exc)[:500]}")
    rows = []
    for t in state["tests"]:
        order, approved = t.pop("order"), t.pop("approved")
        rows.append(TestCase(project_id=pid, order=order, approved=approved, data=t))
    db.add_all(rows)
    db.commit()
    return [r.to_dict() for r in rows]


@router.get("/projects/{pid}/tests")
def list_tests(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [t.to_dict() for t in project_tests(db, owned_project(db, user, pid))]


@router.patch("/tests/{tid}")
def update_test(tid: str, body: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    test = owned_test(db, user, tid)
    changes = {k: v for k, v in body.items() if k in TEST_EDITABLE_FIELDS}
    if "order" in changes:
        test.order = int(changes.pop("order"))
    if "approved" in changes:
        test.approved = bool(changes.pop("approved"))
    test.data = {**test.data, **changes}
    db.commit()
    return test.to_dict()


@router.delete("/tests/{tid}")
def delete_test(tid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned_test(db, user, tid))
    db.commit()
    return {"ok": True}


@router.post("/projects/{pid}/tests/approve")
def approve_tests(pid: str, body: ApproveIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_project(db, user, pid)
    rows = list(db.scalars(select(TestCase).where(TestCase.project_id == pid, TestCase.id.in_(body.test_ids))))
    for t in rows:
        t.approved = body.approved
    db.commit()
    return [t.to_dict() for t in rows]


# ---------------------------------------------------------------- runs

@router.post("/projects/{pid}/runs", status_code=202)
def start_run(pid: str, body: RunIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Queue a run; the background worker executes it. Poll GET /api/runs/{id} for progress."""
    project = owned_project(db, user, pid)
    tests = [t for t in project_tests(db, project) if (t.id in body.test_ids if body.test_ids else t.approved)]
    if not tests:
        raise HTTPException(400, "No approved tests to run")
    run = Run(project_id=pid, status="queued", test_ids=[t.id for t in tests],
              progress={"done": 0, "total": len(tests), "stage": "queued"},
              summary={"total": len(tests), "passed": 0, "failed": 0, "error": 0, "skipped": 0, "duration_ms": 0})
    db.add(run)
    db.commit()
    worker.submit(run.id)
    return run.to_dict()


@router.get("/projects/{pid}/runs")
def list_runs(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_project(db, user, pid)
    rows = db.scalars(select(Run).where(Run.project_id == pid).order_by(Run.started_at.desc()))
    return [r.to_dict() for r in rows]


@router.get("/runs/{rid}")
def get_run(rid: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = db.get(Run, rid)
    if not run or run.project.user_id != user.id:
        raise HTTPException(404, "Run not found")
    return run.to_dict()

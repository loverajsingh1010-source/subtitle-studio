
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Generator

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./subtitle_studio.db")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), default="Untitled project")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    subtitles: Mapped[list["Subtitle"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Subtitle(Base):
    __tablename__ = "subtitles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    start_time: Mapped[float]
    end_time: Mapped[float]
    text: Mapped[str] = mapped_column(Text)
    project: Mapped[Project] = relationship(back_populates="subtitles")


class SubtitleInput(BaseModel):
    start_time: float = Field(ge=0)
    end_time: float = Field(ge=0)
    text: str


class ProjectInput(BaseModel):
    title: str = "Untitled project"
    subtitles: list[SubtitleInput] = []


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as db:
        yield db


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Subtitle Studio API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://subtitle-studio.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Subtitle Studio API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/projects", status_code=201)
def create_project(payload: ProjectInput, db: Session = Depends(get_db)):
    project = Project(title=payload.title)
    project.subtitles = [
        Subtitle(start_time=s.start_time, end_time=s.end_time, text=s.text)
        for s in payload.subtitles
    ]
    db.add(project)
    db.commit()
    db.refresh(project)
    return serialize_project(project)


@app.get("/api/projects")
def list_projects(db: Session = Depends(get_db)):
    projects = db.scalars(select(Project).order_by(Project.id.desc())).all()
    return [serialize_project(project) for project in projects]


@app.get("/api/projects/{project_id}")
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return serialize_project(project)


@app.put("/api/projects/{project_id}")
def update_project(
    project_id: int, payload: ProjectInput, db: Session = Depends(get_db)
):
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    project.title = payload.title
    project.subtitles.clear()
    project.subtitles.extend(
        Subtitle(start_time=s.start_time, end_time=s.end_time, text=s.text)
        for s in payload.subtitles
    )
    db.commit()
    db.refresh(project)
    return serialize_project(project)


def serialize_project(project: Project):
    return {
        "id": project.id,
        "title": project.title,
        "created_at": project.created_at.isoformat(),
        "subtitles": [
            {
                "id": s.id,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "text": s.text,
            }
            for s in project.subtitles
        ],
    }

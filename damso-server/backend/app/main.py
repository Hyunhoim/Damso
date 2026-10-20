import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.middleware.base import RequestResponseEndpoint
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response

from app.api.main import api_router
from app.api.routes.llm_setup import router as llm_setup_router
from app.core.config import settings
from app.core.db import engine
from app.http_limits import RequestSizeLimit


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


if settings.SENTRY_DSN and settings.FASTAPI_ENV != "development":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    generate_unique_id_function=custom_generate_unique_id,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_HOST, *settings.BACKEND_CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)
app.include_router(llm_setup_router)
app.add_middleware(RequestSizeLimit, audio_limit=settings.MAX_AUDIO_BYTES)


@app.exception_handler(IntegrityError)
async def integrity_error(_request: Request, _error: IntegrityError) -> JSONResponse:
    return JSONResponse(
        {"detail": "The operation conflicts with existing data"}, status_code=409
    )


@app.exception_handler(SQLAlchemyError)
async def database_error(_request: Request, _error: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(
        {"detail": "Database is temporarily unavailable"}, status_code=503
    )


@app.middleware("http")
async def response_headers(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health/live", tags=["health"])
def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
def ready() -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1")).one()
    return {"status": "ok", "database": "postgresql"}

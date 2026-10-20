from fastapi import APIRouter

from app.api.routes import (
    answers,
    audio,
    families,
    library,
    login,
    photos,
    profile,
    questions,
    users,
    utils,
)

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
for domain_router in (
    families.router,
    questions.router,
    answers.router,
    audio.router,
    library.router,
    profile.router,
    photos.router,
):
    api_router.include_router(domain_router)

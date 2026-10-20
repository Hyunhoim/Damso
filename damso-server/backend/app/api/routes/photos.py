import io
import uuid
import warnings
from typing import Annotated, Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.domain_models import Answer, StoryPhoto
from app.domain_service import active_family, library_query, visible_story
from app.rate_limit import enforce_limit

router = APIRouter(tags=["photos"])
MAX_PHOTO_BYTES = 10 * 1024 * 1024


def photo_view(photo: StoryPhoto) -> dict[str, Any]:
    return {
        "id": photo.id,
        "answer_id": photo.answer_id,
        "width": photo.width,
        "height": photo.height,
        "created_at": photo.created_at,
        "content_url": f"/api/v1/photos/{photo.id}/content",
    }


@router.post("/library/{answer_id}/photos", status_code=201)
def upload_photo(
    answer_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    file: Annotated[UploadFile, File()],
) -> Any:
    enforce_limit(f"photo:{current_user.id}", limit=20)
    family = active_family(session, current_user.id, lock=True)
    story = visible_story(session, answer_id, current_user, lock=True)
    if story.author_id != current_user.id:
        raise HTTPException(403, "Only the author can add photos")
    if story.status != "submitted" or story.family_id != family.id:
        raise HTTPException(409, "Publish the story in your current family first")
    if (
        len(
            session.exec(
                select(StoryPhoto.id).where(StoryPhoto.answer_id == story.id)
            ).all()
        )
        >= 12
    ):
        raise HTTPException(409, "A story can contain up to 12 photos")
    raw = file.file.read(MAX_PHOTO_BYTES + 1)
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Photo exceeds 10 MiB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as original:
                if (
                    original.format not in {"JPEG", "PNG", "WEBP"}
                    or original.width * original.height > 20_000_000
                ):
                    raise ValueError("Unsupported image or dimensions")
                original.load()
                image = ImageOps.exif_transpose(original).convert("RGB")
                image.thumbnail((4096, 4096))
                # Re-encode pixels only; original names and location/EXIF metadata are not stored.
                normalized = Image.new("RGB", image.size)
                normalized.paste(image)
                output = io.BytesIO()
                normalized.save(output, format="JPEG", quality=88)
    except (
        ValueError,
        OSError,
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise HTTPException(
            422, "Choose a valid JPEG, PNG or WebP photo up to 20 megapixels"
        ) from None
    photo = StoryPhoto(
        answer_id=story.id,
        owner_id=current_user.id,
        width=normalized.width,
        height=normalized.height,
        byte_size=output.tell(),
    )
    settings.STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    path = settings.STORAGE_ROOT / f"{photo.id}.jpg"
    committed = False
    try:
        with path.open("xb") as target:
            target.write(output.getvalue())
        session.add(photo)
        session.commit()
        committed = True
        return photo_view(photo)
    finally:
        if not committed:
            path.unlink(missing_ok=True)


@router.get("/library/{answer_id}/photos")
def story_photos(
    answer_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    story = visible_story(session, answer_id, current_user)
    if story.status != "submitted":
        raise HTTPException(404, "Shared story not found")
    return {
        "data": [
            photo_view(p)
            for p in session.exec(
                select(StoryPhoto)
                .where(StoryPhoto.answer_id == story.id)
                .order_by(col(StoryPhoto.created_at))
            ).all()
        ]
    }


@router.get("/photos/album")
def family_album(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(24, ge=1, le=50),
) -> Any:
    visible = library_query(session, current_user).with_only_columns(col(Answer.id))
    photos = session.exec(
        select(StoryPhoto)
        .where(col(StoryPhoto.answer_id).in_(visible))
        .order_by(col(StoryPhoto.created_at).desc())
        .offset(skip)
        .limit(limit + 1)
    ).all()
    return {
        "data": [photo_view(p) for p in photos[:limit]],
        "has_more": len(photos) > limit,
        "next_skip": skip + limit if len(photos) > limit else None,
    }


@router.get("/photos/{photo_id}/content")
def photo_content(
    photo_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> FileResponse:
    photo = session.get(StoryPhoto, photo_id)
    if not photo:
        raise HTTPException(404, "Photo not found")
    story = visible_story(session, photo.answer_id, current_user)
    path = settings.STORAGE_ROOT / f"{photo.id}.jpg"
    if story.status != "submitted" or not path.is_file():
        raise HTTPException(404, "Photo not found")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/photos/{photo_id}")
def delete_photo(
    photo_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    photo = session.get(StoryPhoto, photo_id)
    if not photo:
        raise HTTPException(404, "Photo not found")
    visible_story(session, photo.answer_id, current_user, lock=True)
    if photo.owner_id != current_user.id:
        raise HTTPException(403, "Only the author can delete photos")
    session.delete(photo)
    session.commit()
    (settings.STORAGE_ROOT / f"{photo.id}.jpg").unlink(missing_ok=True)
    return {"status": "deleted"}

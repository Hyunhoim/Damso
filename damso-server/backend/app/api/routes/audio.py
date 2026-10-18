import uuid
from typing import Annotated, Any

import av
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import col, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.domain_models import Answer, AudioAsset
from app.domain_service import visible_story
from app.rate_limit import enforce_limit

router = APIRouter(prefix="/audio", tags=["audio"])


@router.post("", status_code=201)
def upload_audio(
    session: SessionDep, current_user: CurrentUser, file: Annotated[UploadFile, File()]
) -> Any:
    enforce_limit(f"audio:{current_user.id}", limit=10)
    settings.STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
    asset_id = uuid.uuid4()
    staged = settings.STORAGE_ROOT / f"{asset_id}.part"
    final = settings.STORAGE_ROOT / f"{asset_id}.bin"
    size = 0
    committed = False
    try:
        with staged.open("xb") as target:
            while chunk := file.file.read(64 * 1024):
                size += len(chunk)
                if size > settings.MAX_AUDIO_BYTES:
                    raise HTTPException(
                        413, "Audio file exceeds the configured size limit"
                    )
                target.write(chunk)
        if not size:
            raise HTTPException(422, "Audio file is empty")
        try:
            with av.open(
                str(staged),
                options={
                    "protocol_whitelist": "file,pipe",
                    "format_whitelist": "wav,mp3,mov,matroska,webm,ogg,flac",
                },
            ) as container:
                if not container.streams.audio or container.streams.video:
                    raise ValueError("Only audio recordings are accepted")
                formats = container.format.name.split(",")
                media_types = {
                    "wav": "audio/wav",
                    "mp3": "audio/mpeg",
                    "mov": "audio/mp4",
                    "mp4": "audio/mp4",
                    "matroska": "audio/webm",
                    "webm": "audio/webm",
                    "ogg": "audio/ogg",
                    "flac": "audio/flac",
                }
                media_type = next(
                    (media_types[name] for name in formats if name in media_types), None
                )
                if not media_type:
                    raise ValueError("Unsupported recording format")
                duration = (
                    container.duration / av.time_base
                    if container.duration is not None
                    else None
                )
                if duration is not None and duration > settings.MAX_AUDIO_SECONDS:
                    raise HTTPException(413, "Audio recording is too long")
                if next(container.decode(audio=0), None) is None:
                    raise ValueError("Recording contains no decodable audio")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                422, "File is not a supported audio recording"
            ) from None
        staged.replace(final)
        item = AudioAsset(
            id=asset_id,
            owner_id=current_user.id,
            size_bytes=size,
            media_type=media_type,
            duration_seconds=duration,
        )
        session.add(item)
        session.commit()
        committed = True
        session.refresh(item)
        return {**item.model_dump(), "content_url": f"/api/v1/audio/{item.id}/content"}
    except Exception:
        session.rollback()
        if not committed:
            final.unlink(missing_ok=True)
        raise
    finally:
        staged.unlink(missing_ok=True)
        file.file.close()


def authorized_asset(
    session: SessionDep, current_user: CurrentUser, asset_id: uuid.UUID
) -> AudioAsset:
    item = session.get(AudioAsset, asset_id)
    if not item:
        raise HTTPException(404, "Audio not found")
    if item.owner_id != current_user.id:
        answer = session.exec(
            select(Answer).where(
                Answer.audio_id == item.id,
                Answer.status == "submitted",
                col(Answer.share_audio).is_(True),
            )
        ).first()
        if not answer:
            raise HTTPException(404, "Audio not found")
        visible_story(session, answer.id, current_user)
    return item


@router.get("/{asset_id}/content", response_class=FileResponse)
def audio_content(
    asset_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> FileResponse:
    item = authorized_asset(session, current_user, asset_id)
    path = settings.STORAGE_ROOT / f"{item.id}.bin"
    if not path.is_file():
        raise HTTPException(404, "Audio content unavailable")
    return FileResponse(
        path,
        media_type=item.media_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/{asset_id}")
def delete_audio(
    asset_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    item = session.get(AudioAsset, asset_id)
    if not item or item.owner_id != current_user.id:
        raise HTTPException(404, "Audio not found")
    if session.exec(select(Answer).where(Answer.audio_id == item.id)).first():
        raise HTTPException(
            409, "Delete the attached answer before removing its recording"
        )
    session.delete(item)
    session.commit()
    (settings.STORAGE_ROOT / f"{item.id}.bin").unlink(missing_ok=True)
    return {"status": "deleted"}

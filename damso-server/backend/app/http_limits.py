from fastapi import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class RequestSizeLimit:
    def __init__(self, app: ASGIApp, audio_limit: int) -> None:
        self.app = app
        self.audio_limit = audio_limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = (
            self.audio_limit + 1024 * 1024
            if scope.get("path", "").rstrip("/").endswith("/audio")
            else 1024 * 1024
        )
        headers = dict(scope.get("headers", []))
        try:
            too_large = int(headers.get(b"content-length", b"0")) > limit
        except ValueError:
            too_large = True
        if too_large:
            await JSONResponse(
                {"detail": "Request body is too large"}, status_code=413
            )(scope, receive, send)
            return
        size = 0

        async def limited_receive() -> Message:
            nonlocal size
            message = await receive()
            size += len(message.get("body", b""))
            if size > limit:
                raise HTTPException(413, "Request body is too large")
            return message

        await self.app(scope, limited_receive, send)

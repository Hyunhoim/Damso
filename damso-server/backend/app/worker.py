"""CLOVA Speech -> HCX-007 worker. TTS remains separate."""

import argparse
import logging
import signal
import threading

from sqlalchemy.exc import SQLAlchemyError

from app.llm import configured_provider
from app.processing import process_one
from app.speech import configured_provider as configured_speech_provider

logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    last_configured = None
    while not stop.is_set():
        provider = configured_provider()
        speech = configured_speech_provider()
        current = (bool(speech), bool(provider))
        if current != last_configured:
            logger.info(
                "CLOVA Speech %s; HCX-007 %s",
                "configured" if speech else "waiting for API settings",
                "configured" if provider else "waiting for API key",
            )
            last_configured = current
        try:
            processed = process_one(stt=speech, llm=provider)
        except SQLAlchemyError:
            # Avoid emitting SQL parameters, originals, or provider credentials.
            logger.warning("Database unavailable; worker will retry")
            processed = False
        if args.once:
            return
        if not processed:
            stop.wait(3)


if __name__ == "__main__":
    main()

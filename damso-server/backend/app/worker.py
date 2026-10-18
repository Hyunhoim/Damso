"""Worker entrypoint. Provider implementations will be added after model selection."""

import logging

from app.processing import process_one


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    # No provider is registered: queued records remain available across restarts.
    processed = process_one()
    logging.info("Providers are not configured; processed=%s", processed)


if __name__ == "__main__":
    main()

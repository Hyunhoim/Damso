"""Sequential real API calls with synthetic examples; never logs a key."""
import json
from datetime import UTC, datetime

from app.core.config import settings
from app.llm import MODEL, PROMPT_VERSION, ProviderError, configured_provider
from app.llm_cases import CASES

provider = configured_provider()
if provider is None:
    raise SystemExit("Register the key at http://127.0.0.1:8000/dev/llm first; no API was called.")
report = {"model": MODEL, "prompt_version": PROMPT_VERSION, "results": []}
failed = False
for case in CASES:
    try:
        value = provider.organize(question=case["question"], original_text=case["original_text"], author_name=case["author_name"])
        report["results"].append({**case, "output": value.model_dump(), "schema_valid": True, "semantic_review_required": True})
        print(case["id"], "schema OK; compare meaning with source")
    except ProviderError as exc:
        report["results"].append({"id": case["id"], "error_code": exc.code})
        print(case["id"], exc.code)
        failed = True
        break
target = settings.CLOVA_CONFIG_FILE.parent.parent / "llm-tests"
target.mkdir(parents=True, exist_ok=True)
path = target / (datetime.now(UTC).strftime("%Y%m%dT%H%M%S") + ".json")
path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print("Report:", path)
raise SystemExit(1 if failed else 0)

import io
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

from app.core.config import settings
from integration.test_flows import API, draft, pair, submit


def png():
    target = io.BytesIO()
    exif = Image.Exif()
    exif[0x010E] = "private location-like metadata"
    Image.new("RGB", (50, 30), "green").save(target, format="PNG", exif=exif)
    return target.getvalue()


def upload(client, user, story):
    return client.post(
        f"{API}/library/{story['id']}/photos",
        headers=user["headers"],
        files={"file": ("family.png", png(), "image/png")},
    )


def test_photo_story_album_permissions_and_metadata(client):
    parent, child = pair(client)
    outsider, _ = pair(client)
    story = draft(client, parent, text="오늘 가족과 공원에 다녀왔어요.")
    assert upload(client, parent, story).status_code == 409
    submit(client, parent, story)
    assert upload(client, child, story).status_code == 403
    assert upload(client, outsider, story).status_code == 404
    result = upload(client, parent, story)
    assert result.status_code == 201, result.text
    photo = result.json()
    assert photo["width"] == 50 and photo["height"] == 30
    content = client.get(photo["content_url"], headers=child["headers"])
    assert (
        content.status_code == 200
        and "no-store" in content.headers["cache-control"]
    )
    with Image.open(io.BytesIO(content.content)) as image:
        assert image.format == "JPEG" and not image.getexif()
    assert client.get(photo["content_url"]).status_code == 401
    assert (
        client.get(photo["content_url"], headers=outsider["headers"]).status_code == 404
    )
    album = client.get(f"{API}/photos/album", headers=child["headers"]).json()
    assert len(album["data"]) == 1 and album["data"][0]["id"] == photo["id"]
    assert (
        client.delete(
            f"{API}/photos/{photo['id']}", headers=child["headers"]
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"{API}/answers/{story['id']}", headers=parent["headers"]
        ).status_code
        == 200
    )
    assert not (settings.STORAGE_ROOT / f"{photo['id']}.jpg").exists()
    assert (
        client.get(photo["content_url"], headers=parent["headers"]).status_code == 404
    )


def test_invalid_photo_size_and_deleted_family_access(client):
    parent, child = pair(client)
    story = draft(client, parent, text="오늘 가족과 공원에 다녀왔어요.")
    submit(client, parent, story)
    invalid = client.post(
        f"{API}/library/{story['id']}/photos",
        headers=parent["headers"],
        files={"file": ("fake.jpg", b"<script>not an image</script>", "image/jpeg")},
    )
    assert invalid.status_code == 422
    too_large = client.post(
        f"{API}/library/{story['id']}/photos",
        headers=parent["headers"],
        files={"file": ("large.jpg", b"x" * (10 * 1024 * 1024 + 1), "image/jpeg")},
    )
    assert too_large.status_code == 413
    photo = upload(client, parent, story).json()
    assert (
        client.delete(f"{API}/families/me", headers=child["headers"]).status_code == 200
    )
    assert client.get(photo["content_url"], headers=child["headers"]).status_code == 404
    assert (
        client.get(photo["content_url"], headers=parent["headers"]).status_code == 200
    )


def test_daily_three_question_budget_under_concurrent_senders(client):
    parent, child = pair(client)

    def send(i):
        return client.post(
            f"{API}/questions/custom",
            headers=parent["headers"],
            json={"text": f"오늘 질문 {i}"},
        ).status_code

    with ThreadPoolExecutor(3) as pool:
        assert sorted(pool.map(send, range(3))) == [201, 201, 409]
    today = client.get(f"{API}/questions/today", headers=child["headers"]).json()
    assert today["daily_limit"] == 3 and len(today["custom"]) == 2
    first = today["custom"][0]
    assert (
        client.delete(
            f"{API}/questions/custom/{first['id']}", headers=parent["headers"]
        ).status_code
        == 200
    )
    assert send(4) == 409  # Canceling a question does not create a fresh send slot.


def test_daily_question_cannot_be_bypassed_by_future_answers(client):
    from datetime import timedelta

    from app.domain_service import today

    parent, child = pair(client)
    future = client.post(
        f"{API}/questions/custom",
        headers=parent["headers"],
        json={
            "text": "내일 물어볼 이야기",
            "available_date": str(today() + timedelta(days=1)),
        },
    ).json()
    result = client.post(
        f"{API}/answers",
        headers=child["headers"],
        json={"question_id": future["id"], "text": "미리 답하기"},
    )
    assert result.status_code in {404, 409}

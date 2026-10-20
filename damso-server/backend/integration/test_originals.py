from integration.test_flows import API, draft, pair, submit, upload


def original(client, user, answer):
    response = client.get(f"{API}/library/{answer['id']}", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()["original"]


def test_original_text_is_private_until_author_opts_in_and_can_be_revoked(client):
    parent, child = pair(client)
    outsider, _ = pair(client)
    answer = draft(client, parent, text="요약에서 빠진 개인적인 원문")
    submit(client, parent, answer, text="가족에게 공개한 요약")
    assert original(client, parent, answer)["text"] == "요약에서 빠진 개인적인 원문"
    assert original(client, child, answer)["text"] is None
    url = f"{API}/answers/{answer['id']}/sharing"
    assert (
        client.patch(
            url, headers=child["headers"], json={"share_original": True}
        ).status_code
        == 403
    )
    assert (
        client.patch(
            url, headers=outsider["headers"], json={"share_original": True}
        ).status_code
        == 404
    )
    assert (
        client.patch(
            url, headers=parent["headers"], json={"share_original": True}
        ).status_code
        == 200
    )
    assert original(client, child, answer)["text"] == "요약에서 빠진 개인적인 원문"
    assert (
        client.patch(
            url, headers=parent["headers"], json={"share_original": False}
        ).status_code
        == 200
    )
    assert original(client, child, answer)["text"] is None
    assert (
        client.get(
            f"{API}/library/{answer['id']}", headers=outsider["headers"]
        ).status_code
        == 404
    )


def test_original_audio_and_transcript_sharing_are_independent(client, db):
    import uuid

    from app.domain_models import Answer

    parent, child = pair(client)
    audio = upload(client, parent)
    answer = draft(client, parent, audio_id=audio["id"])
    row = db.get(Answer, uuid.UUID(answer["id"]))
    row.transcript = "녹음에서 옮긴 원문이에요."
    db.add(row)
    db.commit()
    submit(client, parent, answer, text="공개한 요약")
    assert original(client, parent, answer)["audio_url"] == audio["content_url"]
    assert original(client, child, answer)["audio_url"] is None
    url = f"{API}/answers/{answer['id']}/sharing"
    assert (
        client.patch(
            url, headers=parent["headers"], json={"share_audio": True}
        ).status_code
        == 200
    )
    shared = original(client, child, answer)
    assert shared["audio_url"] and shared["text"] is None
    assert (
        client.get(
            shared["audio_url"], headers={**child["headers"], "Range": "bytes=0-31"}
        ).status_code
        == 206
    )
    assert (
        client.patch(
            url,
            headers=parent["headers"],
            json={"share_original": True, "share_audio": False},
        ).status_code
        == 200
    )
    shared = original(client, child, answer)
    assert (
        shared["text"] == row.transcript
        and shared["kind"] == "transcript"
        and shared["audio_url"] is None
    )
    assert client.get(audio["content_url"], headers=child["headers"]).status_code == 404
    client.delete(f"{API}/families/me", headers=child["headers"])
    assert (
        client.get(
            f"{API}/library/{answer['id']}", headers=child["headers"]
        ).status_code
        == 404
    )
    assert (
        client.patch(
            url, headers=parent["headers"], json={"share_audio": True}
        ).status_code
        == 409
    )


def test_sharing_validation_and_submit_opt_in(client):
    parent, child = pair(client)
    answer = draft(client, parent, text="그대로 보관할 원문")
    url = f"{API}/answers/{answer['id']}/sharing"
    assert (
        client.patch(
            url, headers=parent["headers"], json={"share_original": True}
        ).status_code
        == 409
    )
    submit(client, parent, answer, share_original=True)
    assert original(client, child, answer)["text"] == "그대로 보관할 원문"
    assert (
        client.patch(
            url, headers=parent["headers"], json={"share_audio": True}
        ).status_code
        == 422
    )
    assert client.patch(url, headers=parent["headers"], json={}).status_code == 422

import pytest

from integration.test_flows import API, account, draft, pair, submit


@pytest.mark.parametrize("label", ["엄마", "아빠", "어머니", "아버지"])
def test_parent_label_is_viewer_specific_and_never_changes_story_text(client, label):
    parent, child = pair(client)
    source = "첫 월급으로 어머니께 내복을 사드렸다고 해요."
    answer = draft(client, parent, text=source)
    submit(client, parent, answer)
    changed = client.patch(
        f"{API}/families/me/settings",
        headers=child["headers"],
        json={"parent_label": label},
    )
    assert changed.status_code == 200
    assert changed.json()["settings"]["parent_label"] == label
    # Separate requests read the committed setting, not a request-local cache.
    saved = client.get(f"{API}/families/me", headers=child["headers"]).json()
    assert saved["settings"]["parent_label"] == label
    story = client.get(f"{API}/library/{answer['id']}", headers=child["headers"]).json()
    assert story["author_story_label"] == f"{label}의 이야기"
    assert story["author_display_name"] == label
    assert story["author_name"] == "parent"
    assert story["text"] == source
    own = client.get(f"{API}/library/{answer['id']}", headers=parent["headers"]).json()
    assert own["author_story_label"] == "나의 이야기" and own["text"] == source
    assert (
        client.get(f"{API}/families/me", headers=parent["headers"]).json()["settings"][
            "parent_label"
        ]
        == "부모님"
    )
    child_answer = draft(client, child, text="회사에서 발표했어요.")
    submit(client, child, child_answer)
    viewed = client.get(
        f"{API}/library/{child_answer['id']}", headers=parent["headers"]
    ).json()
    assert viewed["author_story_label"] == "child의 이야기"


def test_label_change_is_authenticated_role_limited_and_validated(client):
    parent, child = pair(client)
    endpoint = f"{API}/families/me/settings"
    assert client.patch(endpoint, json={"parent_label": "어머니"}).status_code == 401
    assert (
        client.patch(
            endpoint, headers=parent["headers"], json={"parent_label": "어머니"}
        ).status_code
        == 403
    )
    for body in (
        {"parent_label": "다른 이름"},
        {"parent_label": None},
        {"parent_label": "어머니", "user_id": str(parent["user"]["id"])},
    ):
        assert (
            client.patch(endpoint, headers=child["headers"], json=body).status_code
            == 422
        )
    other = account(client, "child")
    assert (
        client.patch(
            endpoint, headers=other["headers"], json={"parent_label": "어머니"}
        ).status_code
        == 409
    )


def test_new_family_does_not_inherit_former_parent_label(client):
    parent, child = pair(client)
    endpoint = f"{API}/families/me/settings"
    assert (
        client.patch(
            endpoint, headers=child["headers"], json={"parent_label": "어머니"}
        ).status_code
        == 200
    )
    assert (
        client.delete(f"{API}/families/me", headers=child["headers"]).status_code == 200
    )
    assert (
        client.patch(
            endpoint, headers=child["headers"], json={"parent_label": "아버지"}
        ).status_code
        == 409
    )
    new_parent = account(client)
    code = client.post(
        f"{API}/families/invitations", headers=new_parent["headers"]
    ).json()["code"]
    joined = client.post(
        f"{API}/families/join", headers=child["headers"], json={"code": code}
    )
    assert joined.status_code == 200
    assert joined.json()["settings"]["parent_label"] == "부모님"

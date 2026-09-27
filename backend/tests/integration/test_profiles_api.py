PROFILE = {
    "personal": {"name": "Ada", "education": "BSc CS", "experience_level": "1-2"},
    "target": {"role": "Software Engineer", "company": "Contoso"},
    "skills": ["python", "sql"],
    "preferences": {"input_mode": "text", "output_mode": "text", "preferred_difficulty": "adaptive"},
}


def test_get_profile_before_create_is_404(client, register):
    headers, _ = register()
    response = client.get("/api/v1/profiles/me", headers=headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "profile_missing"


def test_create_then_get_profile(client, register):
    headers, data = register()
    created = client.post("/api/v1/profiles", json=PROFILE, headers=headers)
    assert created.status_code == 201
    profile = created.json()["data"]
    assert profile["candidate_id"] == data["user"]["id"]
    assert profile["preparation_scores"]["dsa"] == 0.0
    assert client.get("/api/v1/profiles/me", headers=headers).json()["data"]["skills"] == ["python", "sql"]


def test_create_profile_twice_is_409(client, register):
    headers, _ = register()
    client.post("/api/v1/profiles", json=PROFILE, headers=headers)
    assert client.post("/api/v1/profiles", json=PROFILE, headers=headers).status_code == 409


def test_update_replaces_only_provided_sections(client, register):
    headers, _ = register()
    client.post("/api/v1/profiles", json=PROFILE, headers=headers)
    updated = client.put("/api/v1/profiles/me", json={"skills": ["go"], "target": {"role": "ML Engineer"}},
                         headers=headers).json()["data"]
    assert updated["skills"] == ["go"]
    assert updated["target"] == {"role": "ML Engineer", "company": None, "job_description": None}
    assert updated["personal"]["education"] == "BSc CS"  # untouched section kept
    assert updated["updated_at"] >= updated["created_at"]


def test_update_without_profile_is_404(client, register):
    headers, _ = register()
    assert client.put("/api/v1/profiles/me", json={"skills": ["x"]}, headers=headers).status_code == 404


def test_profiles_are_isolated_per_user(client, register):
    ada, _ = register(email="ada@example.com")
    bob, _ = register(email="bob@example.com", name="Bob")
    client.post("/api/v1/profiles", json=PROFILE, headers=ada)
    assert client.get("/api/v1/profiles/me", headers=bob).status_code == 404


def test_profile_rejects_invalid_enum(client, register):
    headers, _ = register()
    bad = {**PROFILE, "personal": {**PROFILE["personal"], "experience_level": "wizard"}}
    assert client.post("/api/v1/profiles", json=bad, headers=headers).status_code == 422


def test_profile_requires_auth(client):
    assert client.post("/api/v1/profiles", json=PROFILE).status_code == 401

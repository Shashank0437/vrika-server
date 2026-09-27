import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas.access import RoleBinding, UpdateBindingsIn
from app.services.access import effective_bindings, has_permission, session_filter


def user(role, scope_type, scope_id=None):
    return {
        "role_bindings": [
            {"role": role, "scope_type": scope_type, "scope_id": scope_id}
        ]
    }


@pytest.mark.parametrize(
    "action", ["execute", "edit", "manage_members", "manage_roles"]
)
def test_viewer_cannot_write(action):
    assert not has_permission(user("viewer", "global"), action, module="web_security")


@pytest.mark.parametrize("module", ["web_security", "cloud_security"])
def test_analyst_is_module_scoped(module):
    analyst = user("analyst", "module", module)
    assert has_permission(analyst, "execute", module=module)
    other = "web_security" if module == "cloud_security" else "cloud_security"
    assert not has_permission(analyst, "view", module=other)
    assert not has_permission(analyst, "manage_roles")
    assert not has_permission(analyst, "edit")


def test_project_lead_never_leaks_to_another_project_or_unassigned_resources():
    lead = user("lead", "project", "p1")
    assert has_permission(lead, "manage_members", project_id="p1")
    for project_id in ("p2", None):
        assert not has_permission(
            lead, "execute", module="cloud_security", project_id=project_id
        )
    assert not has_permission(lead, "manage_roles", project_id="p1")


def test_multiple_bindings_union_does_not_expand_write_scope():
    combined = user("viewer", "global")
    combined["role_bindings"] += user("lead", "project", "p1")["role_bindings"]
    assert has_permission(combined, "view", module="cloud_security", project_id="p2")
    assert not has_permission(
        combined, "edit", module="cloud_security", project_id="p2"
    )
    assert has_permission(combined, "edit", module="cloud_security", project_id="p1")


def test_existing_members_keep_both_modules_but_explicit_empty_overrides_legacy_roles():
    assert len(effective_bindings({"roles": ["tenant_member"]})) == 2
    assert has_permission({"roles": ["tenant_admin"]}, "manage_roles")
    assert not has_permission({"roles": ["tenant_admin"], "role_bindings": []}, "view")


def test_project_filters_always_include_organization():
    lead = {**user("lead", "project", "p1"), "organization_id": "org1"}
    assert session_filter(lead) == {
        "organization_id": "org1",
        "project_id": {"$in": ["p1"]},
    }


@pytest.mark.parametrize(
    "binding",
    [
        {"role": "lead", "scope_type": "global"},
        {"role": "admin", "scope_type": "project", "scope_id": "p1"},
        {"role": "analyst", "scope_type": "module", "scope_id": "admin"},
        {"role": "viewer", "scope_type": "global", "scope_id": "p1"},
    ],
)
def test_invalid_scope_rejected(binding):
    with pytest.raises(ValidationError):
        RoleBinding.model_validate(binding)


def test_duplicate_bindings_rejected():
    binding = {"role": "viewer", "scope_type": "global"}
    with pytest.raises(ValidationError):
        UpdateBindingsIn(role_bindings=[binding, binding], expected_version=0)

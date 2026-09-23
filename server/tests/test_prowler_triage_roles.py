"""Managed bridge roles preserve existing permissions and add scoped triage."""

from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from app.services.prowler_bridge import (
    _PROWLER_ROLE_PERMISSIONS,
    _resolve_prowler_role_ids,
)


class ProwlerTriageRoleTests(IsolatedAsyncioTestCase):
    def test_managed_role_permissions(self):
        admin = _PROWLER_ROLE_PERMISSIONS["admin"]
        member = _PROWLER_ROLE_PERMISSIONS["vrika_member"]
        self.assertTrue(admin["manage_triage"])
        self.assertTrue(admin["manage_triage_exceptions"])
        self.assertTrue(member["manage_triage"])
        self.assertFalse(member["manage_triage_exceptions"])
        self.assertTrue(member["manage_scans"])
        self.assertFalse(member["manage_users"])
        self.assertFalse(member["manage_account"])

    async def test_existing_role_reused_without_resetting_customizations(self):
        with (
            patch("app.services.prowler_bridge._prowler_roles_by_name",
                  new=AsyncMock(return_value={"vrika_member": "member-id"})),
            patch("app.services.prowler_bridge.prowler_client.create_role",
                  new=AsyncMock()) as create,
        ):
            result = await _resolve_prowler_role_ids(
                None, access_token="test", vrika_roles=["tenant_member"],
            )
        self.assertEqual(result, ["member-id"])
        create.assert_not_called()

    async def test_new_member_role_has_triage_without_exceptions(self):
        with (
            patch("app.services.prowler_bridge._prowler_roles_by_name",
                  new=AsyncMock(return_value={})),
            patch("app.services.prowler_bridge.prowler_client.create_role",
                  new=AsyncMock(return_value={"data": {"id": "member-id"}})) as create,
        ):
            await _resolve_prowler_role_ids(
                None, access_token="test", vrika_roles=["tenant_member"],
            )
        self.assertTrue(create.call_args.kwargs["permissions"]["manage_triage"])
        self.assertFalse(create.call_args.kwargs["permissions"]["manage_triage_exceptions"])

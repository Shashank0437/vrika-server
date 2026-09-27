"""Replace legacy global Viewer grants with explicit Web and Cloud Viewer bindings."""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import init_db, get_database, close_db
from app.redis_client import close_redis
from app.services.access import effective_bindings, has_permission
from app.services.access_management import object_id, update_bindings


def expand_viewers(bindings):
    result = []
    for binding in bindings:
        replacements = (
            [
                {"role": "viewer", "scope_type": "module", "scope_id": module}
                for module in ("web_security", "cloud_security")
            ]
            if binding["role"] == "viewer" and binding["scope_type"] == "global"
            else [binding]
        )
        for replacement in replacements:
            if replacement not in result:
                result.append(replacement)
    return result


async def migrate(db, organization_id, apply=False):
    users = await db.users.find({"organization_id": organization_id}).to_list(None)
    actor = next((user for user in users if has_permission(user, "manage_roles")), None)
    if not actor:
        raise RuntimeError("An organization administrator is required")
    changed = 0
    for user in users:
        before = effective_bindings(user)
        after = expand_viewers(before)
        if before == after:
            continue
        changed += 1
        if apply:
            await update_bindings(
                db, actor, str(user["_id"]), after, user.get("access_version", 0)
            )
    invitations = await db.organization_invitations.find(
        {"organization_id": organization_id, "status": "pending"}
    ).to_list(None)
    pending = 0
    for invitation in invitations:
        before = effective_bindings(invitation)
        after = expand_viewers(before)
        if before == after:
            continue
        pending += 1
        if apply:
            await db.access_audit.update_one(
                {"_id": f"explicit-viewer-invitation:{invitation['_id']}"},
                {"$setOnInsert": {
                    "organization_id": organization_id,
                    "invitation_id": invitation["_id"],
                    "event": "explicit_viewer_invitation_migration",
                    "before": before, "after": after,
                }},
                upsert=True,
            )
            result = await db.organization_invitations.update_one(
                {"_id": invitation["_id"], "status": "pending",
                 "role_bindings": invitation.get("role_bindings")},
                {"$set": {"role_bindings": after}},
            )
            if result.matched_count != 1:
                raise RuntimeError("Invitation changed concurrently; review and retry")
    print(f"Global Viewers: {changed}; pending invitations: {pending}; apply={apply}")


async def main(args):
    await init_db()
    try:
        await migrate(await get_database(), object_id(args.organization_id), args.apply)
    finally:
        await close_redis()
        await close_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organization-id", required=True)
    parser.add_argument("--apply", action="store_true")
    asyncio.run(main(parser.parse_args()))

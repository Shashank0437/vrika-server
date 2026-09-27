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
from app.services import access_management


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
    lock = access_management.get_redis().lock(
        f"rbac:{organization_id}", timeout=120, blocking_timeout=5
    )
    if not await lock.acquire():
        raise RuntimeError("Another access change is in progress; retry migration")
    roster_additions = 0
    try:
        current_users = await db.users.find(
            {"organization_id": organization_id}
        ).to_list(None)
        for user in current_users:
            for binding in effective_bindings(user):
                if binding["scope_type"] != "project":
                    continue
                project = await db.projects.find_one({
                    "_id": object_id(binding["scope_id"]),
                    "organization_id": organization_id,
                })
                if not project:
                    raise RuntimeError("A project binding references a missing project")
                if str(user["_id"]) in project.get("member_ids", []):
                    continue
                roster_additions += 1
                if apply:
                    await db.projects.update_one(
                        {"_id": project["_id"], "organization_id": organization_id},
                        {"$addToSet": {"member_ids": str(user["_id"])}},
                    )
    finally:
        await lock.release()
    print(
        f"Global Viewers: {changed}; pending invitations: {pending}; "
        f"project roster additions: {roster_additions}; apply={apply}"
    )


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

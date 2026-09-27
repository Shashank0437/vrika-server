"""Run after Cloud Security migration 0103; use --apply to persist legacy bindings."""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.db import close_db, get_database, init_db
from app.redis_client import close_redis
from app.services.access import compatibility_roles, effective_bindings
from app.services.access_management import resume_pending_access
from app.services.cloud_access import sync_cloud_access


async def migrate(apply: bool):
    await init_db()
    try:
        db = await get_database()
        users = await db.users.find({}).to_list(length=None)
        legacy = [user for user in users if "role_bindings" not in user]
        print(
            f"Users: {len(users)}; legacy bindings to persist: {len(legacy)}; apply={apply}"
        )
        if not apply:
            return
        for user in users:
            user = await resume_pending_access(db, user)
            bindings = effective_bindings(user)
            await sync_cloud_access(
                db, get_settings(), {**user, "role_bindings": bindings}
            )
            if "role_bindings" not in user:
                await db.users.update_one(
                    {
                        "_id": user["_id"],
                        "organization_id": user["organization_id"],
                        "role_bindings": {"$exists": False},
                    },
                    {
                        "$set": {
                            "role_bindings": bindings,
                            "roles": compatibility_roles(bindings),
                            "access_version": 0,
                        }
                    },
                )
        print("All user bindings persisted and linked cloud accounts synchronized.")
    finally:
        await close_redis()
        await close_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    asyncio.run(migrate(parser.parse_args().apply))

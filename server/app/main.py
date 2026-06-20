from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import close_db, init_db
from app.redis_client import close_redis
from app.routers import admin, agent_chat, auth, contact, invitations, license_admin, license_status, tenant, workspace_tools
from app.services.license_runtime import license_runtime

import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()

    # --- License validation at startup ---
    settings = get_settings()
    try:
        await license_runtime.initialize()
        # Start background license monitor (re-validates every N minutes)
        await license_runtime.start_monitor()
    except RuntimeError as e:
        logger.critical(str(e))
        if settings.license_enforce_on_startup:
            raise

    yield

    await license_runtime.stop_monitor()
    await close_db()
    await close_redis()


app = FastAPI(title="CipherStrike API", lifespan=lifespan)

settings = get_settings()
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(tenant.router)
app.include_router(invitations.router)
app.include_router(admin.router)
app.include_router(contact.router)
app.include_router(agent_chat.router)
app.include_router(workspace_tools.router)
app.include_router(workspace_tools.api_tools_router)
app.include_router(license_admin.router)
app.include_router(license_status.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

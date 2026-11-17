from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.security import decode_token
from app.database.session import SessionLocal
from app.models import Organization, OrganizationStaff, QueueToken, User
from app.websocket.manager import queue_connections

router = APIRouter(tags=["real-time queue"])


@router.websocket("/ws/organizations/{organization_id}/queue")
async def organization_queue(websocket: WebSocket, organization_id: UUID):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(token, "access")
        user_id = UUID(payload["sub"])
    except (HTTPException, ValueError, KeyError, TypeError):
        await websocket.close(code=4401)
        return

    with SessionLocal() as db:
        user = db.get(User, user_id)
        organization = db.get(Organization, organization_id)
        if user is None or not user.is_active or organization is None:
            await websocket.close(code=4401)
            return
        if user.role != "super_admin":
            membership = db.scalar(
                select(OrganizationStaff.id).where(
                    OrganizationStaff.organization_id == organization_id,
                    OrganizationStaff.user_id == user_id,
                    OrganizationStaff.status == "active",
                )
            )
            is_customer_with_queue = user.role == "customer" and db.scalar(
                select(QueueToken.id).where(
                    QueueToken.organization_id == organization_id,
                    QueueToken.customer_id == user_id,
                    QueueToken.service_date >= datetime.now(timezone.utc).date(),
                )
            ) is not None
            if (
                user.role == "customer" and not is_customer_with_queue
            ) or (
                user.role != "customer"
                and membership is None
                and organization.owner_admin_id != user_id
            ):
                await websocket.close(code=4403)
                return

    await queue_connections.connect(organization_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await queue_connections.disconnect(organization_id, websocket)

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel


class HapticPattern(str, Enum):
    WORD_A = "S-S-S-L"
    WORD_B = "S-S-L-L"
    WARNING = "rapid_short"
    RESULT_WIN = "3short"
    RESULT_LOSE = "1long"


class Audience(str, Enum):
    ALL = "ALL"
    PLAYER = "PLAYER"


class VibrateRequest(BaseModel):
    pattern: HapticPattern
    audience: Audience = Audience.ALL
    playerName: Optional[str] = None


class LedEffect(str, Enum):
    STEADY = "steady"
    BREATHE = "breathe"


class LedRequest(BaseModel):
    color: str
    effect: LedEffect = LedEffect.BREATHE
    audience: Audience = Audience.ALL
    playerName: Optional[str] = None
    groupName: Optional[str] = None


router = APIRouter(prefix="/api/hardware", tags=["hardware"])


@router.post("/vibrate", status_code=200)
async def vibrate(_req: VibrateRequest):
    """
    预留的震动指令接口。
    当前实现为 no-op，后续可接入 MQTT / WebSocket 推送到 ESP32。
    """
    return {"status": "ok"}


@router.post("/led", status_code=200)
async def led(_req: LedRequest):
    """
    预留的 LED 颜色指令接口。
    当前实现为 no-op，后续可接入 MQTT / WebSocket 推送到 ESP32。
    """
    print(f"[Hardware] LED Request: color={_req.color}, audience={_req.audience}, player={_req.playerName}")
    return {"status": "ok"}


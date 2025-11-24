from __future__ import annotations

import asyncio
import secrets
import string
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Dict, Optional


class GameStatus(str, Enum):
    WAITING_FOR_PLAYERS = "WAITING_FOR_PLAYERS"
    IN_PROGRESS = "IN_PROGRESS"
    VOTING = "VOTING"
    FINISHED = "FINISHED"


class Team(str, Enum):
    CIVILIANS = "CIVILIANS"
    UNDERCOVER = "UNDERCOVER"


@dataclass
class Participant:
    participant_id: str
    token: str
    name: str
    undercover: bool = False
    word: Optional[str] = None
    has_voted: bool = False


@dataclass
class UndercoverGame:
    civilian_word: str
    undercover_word: str
    civilian_image: Optional[str] = None
    undercover_image: Optional[str] = None
    participants: Dict[str, Participant] = field(default_factory=dict)
    status: GameStatus = GameStatus.WAITING_FOR_PLAYERS
    undercover_participant_id: Optional[str] = None
    countdown_ends_at: Optional[datetime] = None
    voting_started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    votes: Dict[str, str] = field(default_factory=dict)
    warning_triggered: bool = False
    winning_team: Optional[Team] = None

    def reset_votes(self) -> None:
        self.votes.clear()
        for p in self.participants.values():
            p.has_voted = False


class LegoSenseStatus(str, Enum):
    IDLE = "IDLE"
    COLLECTING = "COLLECTING"
    GROUPING = "GROUPING"
    APPLIED = "APPLIED"


@dataclass
class EmotionSubmission:
    participant_id: str
    participant_token: str
    name: str
    emotion: str
    submitted_at: datetime
    group_id: Optional[str] = None


@dataclass
class LegoSenseGroup:
    group_id: str
    name: str
    color: str


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def random_code(length: int = 8) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def random_token(length: int = 28) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))

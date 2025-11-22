from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .models import GameStatus, LegoSenseStatus, Team


class CreateGameRequest(BaseModel):
    civilianWord: str = Field(..., min_length=1)
    undercoverWord: str = Field(..., min_length=1)


class JoinGameRequest(BaseModel):
    name: str = Field(..., min_length=1)


class JoinGameResponse(BaseModel):
    participantId: str
    participantToken: str


class ParticipantListItem(BaseModel):
    participantId: str
    name: str


class VoteSummaryItem(BaseModel):
    participantId: str
    name: str
    votes: int


class HostParticipantView(BaseModel):
    participantId: str
    name: str
    word: Optional[str]
    undercover: bool
    hasVoted: bool


class HostGameView(BaseModel):
    civilianWord: str
    undercoverWord: str
    status: GameStatus
    countdownActive: bool
    secondsToVoting: int
    totalParticipants: int
    participants: List[HostParticipantView]
    undercoverParticipantId: Optional[str]
    voteSummary: List[VoteSummaryItem]


class ParticipantView(BaseModel):
    participantId: str
    name: str
    status: GameStatus
    word: Optional[str]
    civilianWord: str
    undercoverWord: str
    countdownActive: bool
    secondsToVoting: int
    canVote: bool
    hasVoted: bool
    participants: List[ParticipantListItem]
    voteSummary: List[VoteSummaryItem]


class VoteRequest(BaseModel):
    voterToken: str
    targetParticipantId: str


class LegoSenseSubmissionView(BaseModel):
    participantId: str
    participantToken: str
    name: str
    emotion: str
    groupId: Optional[str]
    submittedAt: datetime


class LegoSenseGroupView(BaseModel):
    id: str
    name: str
    color: str
    memberTokens: List[str]
    memberNames: List[str]


class LegoSenseHostView(BaseModel):
    status: LegoSenseStatus
    submissions: List[LegoSenseSubmissionView]
    groups: List[LegoSenseGroupView]
    participants: List[str]


class LegoSensePlayerView(BaseModel):
    status: LegoSenseStatus
    participantId: str
    name: str
    submitted: bool
    emotion: Optional[str]
    groupName: Optional[str]
    color: Optional[str]


class EmotionSubmitRequest(BaseModel):
    participantToken: str
    emotion: str


class ApplyGroupsRequest(BaseModel):
    class GroupDefinition(BaseModel):
        id: Optional[str] = None
        name: str
        color: str
        memberTokens: List[str] = Field(default_factory=list)

    groups: List[GroupDefinition] = Field(default_factory=list)

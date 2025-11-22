from __future__ import annotations

import itertools
from datetime import timedelta
from typing import Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .models import GameStatus, LegoSenseGroup, LegoSenseStatus, Team, now_utc, random_code
from .schemas import (
    ApplyGroupsRequest,
    CreateGameRequest,
    EmotionSubmitRequest,
    HostGameView,
    JoinGameRequest,
    JoinGameResponse,
    LegoSenseGroupView,
    LegoSenseHostView,
    LegoSensePlayerView,
    LegoSenseSubmissionView,
    ParticipantListItem,
    ParticipantView,
    VoteRequest,
    VoteSummaryItem,
    HostParticipantView,
)
from .state import state

app = FastAPI(title="Lego Backend (FastAPI)")

# Allow local dev front-ends
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Game 1 APIs ----
@app.post("/api/game", response_model=HostGameView)
async def create_game(payload: CreateGameRequest):
    game = await state.create_game(payload.civilianWord.strip(), payload.undercoverWord.strip())
    return to_host_view(game)


@app.get("/api/game/host", response_model=HostGameView)
async def host_view():
    game = state.game
    if not game:
        raise HTTPException(status_code=404, detail="暂无游戏，请先创建")
    return to_host_view(game)


@app.post("/api/game/participants", response_model=JoinGameResponse)
async def join_game(payload: JoinGameRequest):
    participant = await state.join(payload.name.strip())
    return JoinGameResponse(participantId=participant.participant_id, participantToken=participant.token)


@app.post("/api/game/start", status_code=202)
async def start_game():
    try:
        await state.start_game()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/game/finish", status_code=202)
async def finish_voting():
    await state.finish_game()


@app.post("/api/game/votes", status_code=202)
async def vote(payload: VoteRequest):
    try:
        await state.record_vote(payload.voterToken, payload.targetParticipantId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/participants/{token}", response_model=ParticipantView)
async def participant_view(token: str):
    game = state.game
    if not game:
        raise HTTPException(status_code=404, detail="暂无游戏，请先创建")
    participant = next((p for p in game.participants.values() if p.token == token), None)
    if not participant:
        raise HTTPException(status_code=404, detail="找不到对应玩家，请重新加入")
    return to_participant_view(game, participant)


# ---- LegoSense APIs ----
@app.post("/api/legosense/start", status_code=204)
async def start_legosense():
    await state.set_lego_sense_started()


@app.get("/api/legosense/host", response_model=LegoSenseHostView)
async def legosense_host():
    game = state.game
    participants = sorted([p.name for p in game.participants.values()], key=str.lower) if game else []
    submissions = list(state.submissions_by_token.values())
    groups = list(state.groups.values())
    return LegoSenseHostView(
        status=state.lego_sense_status,
        submissions=[
            LegoSenseSubmissionView(
                participantId=s.participant_id,
                participantToken=s.participant_token,
                name=s.name,
                emotion=s.emotion,
                groupId=s.group_id,
                submittedAt=s.submitted_at,
            )
            for s in submissions
        ],
        groups=[
            LegoSenseGroupView(
                id=g.group_id,
                name=g.name,
                color=g.color,
                memberTokens=[s.participant_token for s in submissions if s.group_id == g.group_id],
                memberNames=sorted(
                    [s.name for s in submissions if s.group_id == g.group_id],
                    key=str.lower,
                ),
            )
            for g in groups
        ],
        participants=participants,
    )


@app.get("/api/legosense/player/{token}", response_model=LegoSensePlayerView)
async def legosense_player(token: str):
    submission = state.submissions_by_token.get(token)
    group = state.groups.get(submission.group_id) if submission and submission.group_id else None
    game = state.game
    participant = next((p for p in game.participants.values() if p.token == token), None) if game else None
    if not participant:
        raise HTTPException(status_code=404, detail="玩家不存在，请重新加入")
    return LegoSensePlayerView(
        status=state.lego_sense_status,
        participantId=participant.participant_id,
        name=participant.name,
        submitted=submission is not None,
        emotion=submission.emotion if submission else None,
        groupName=group.name if group else None,
        color=group.color if group else None,
    )


@app.post("/api/legosense/submit", status_code=204)
async def legosense_submit(payload: EmotionSubmitRequest):
    try:
        await state.submit_emotion(payload.participantToken, payload.emotion.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/legosense/groups", response_model=LegoSenseHostView)
async def legosense_groups(payload: ApplyGroupsRequest):
    groups: List[LegoSenseGroup] = []
    assignments: Dict[str, str] = {}
    for g in payload.groups:
        if not g.memberTokens:
            continue
        group_id = g.id.strip() if g.id else random_code(6)
        groups.append(LegoSenseGroup(group_id=group_id, name=g.name.strip(), color=g.color.strip()))
        for token in g.memberTokens:
            assignments[token] = group_id
    await state.apply_groups(groups, assignments)
    return await legosense_host()


# ---- Mapping helpers ----
def to_host_view(game) -> HostGameView:
    countdown_active = game.status == GameStatus.IN_PROGRESS and game.countdown_ends_at is not None
    seconds_to_voting = 0
    if countdown_active:
        seconds_to_voting = max(0, int((game.countdown_ends_at - now_utc()).total_seconds()))
    vote_summary = build_vote_summary(game)
    participants = [
        HostParticipantView(
            participantId=p.participant_id,
            name=p.name,
            word=p.word,
            undercover=p.undercover,
            hasVoted=p.has_voted,
        )
        for p in game.participants.values()
    ]
    return HostGameView(
        civilianWord=game.civilian_word,
        undercoverWord=game.undercover_word,
        status=game.status,
        countdownActive=countdown_active,
        secondsToVoting=seconds_to_voting,
        totalParticipants=len(game.participants),
        participants=participants,
        undercoverParticipantId=game.undercover_participant_id,
        voteSummary=vote_summary,
    )


def to_participant_view(game, participant) -> ParticipantView:
    countdown_active = game.status == GameStatus.IN_PROGRESS and game.countdown_ends_at is not None
    seconds_to_voting = 0
    if countdown_active:
        seconds_to_voting = max(0, int((game.countdown_ends_at - now_utc()).total_seconds()))
    vote_summary = build_vote_summary(game)
    return ParticipantView(
        participantId=participant.participant_id,
        name=participant.name,
        status=game.status,
        word=participant.word,
        civilianWord=game.civilian_word,
        undercoverWord=game.undercover_word,
        countdownActive=countdown_active,
        secondsToVoting=seconds_to_voting,
        canVote=game.status == GameStatus.VOTING and not participant.has_voted,
        hasVoted=participant.has_voted,
        participants=[
            ParticipantListItem(participantId=p.participant_id, name=p.name)
            for p in sorted(game.participants.values(), key=lambda p: p.name.lower())
        ],
        voteSummary=vote_summary,
    )


def build_vote_summary(game) -> List[VoteSummaryItem]:
    tallies: Dict[str, int] = {}
    for target in game.votes.values():
        tallies[target] = tallies.get(target, 0) + 1
    return [
        VoteSummaryItem(
            participantId=p.participant_id,
            name=p.name,
            votes=tallies.get(p.participant_id, 0),
        )
        for p in game.participants.values()
    ]


# Serve static assets (built JS/CSS/HTML)
app.mount("/", StaticFiles(directory="static", html=True), name="static")

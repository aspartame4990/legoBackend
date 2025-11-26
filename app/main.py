from __future__ import annotations

import itertools
from datetime import timedelta
from typing import Dict, List
from pathlib import Path

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import schemas
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
from .hardware import router as hardware_router

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
TOPIC_IMAGES_DIR = BASE_DIR / "public" / "topic_images"

# Ensure static folders exist so mount won't crash if build hasn't run yet
STATIC_DIR.mkdir(parents=True, exist_ok=True)
TOPIC_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

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
    c_word = payload.civilianWord.strip() if payload.civilianWord else None
    u_word = payload.undercoverWord.strip() if payload.undercoverWord else None
    game = await state.create_game(c_word, u_word)
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


@app.delete("/api/game/participants/{participant_id}", status_code=204)
async def remove_participant(participant_id: str):
    await state.remove_participant(participant_id)



@app.post("/api/game/start", status_code=202)
async def start_game(mockMode: bool = False):
    try:
        await state.start_game(mock_mode=mockMode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/game/switch-topic", status_code=202)
async def switch_topic():
    try:
        await state.switch_topic()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/game/timer", status_code=202)
async def start_timer():
    try:
        await state.start_timer()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/game/finish", status_code=202)
async def finish_voting():
    await state.finish_game()


@app.post("/api/game/vote-start", status_code=202)
async def start_voting():
    await state.start_voting()


@app.post("/api/game/votes", status_code=202)
async def vote(payload: VoteRequest):
    try:
        await state.record_vote(payload.voterToken, payload.targetParticipantId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/participants/{token}", response_model=ParticipantView)
async def participant_view_path(token: str):
    return await participant_view(token)


@app.get("/api/game/participant", response_model=ParticipantView)
async def participant_view(token: str):
    game = state.game
    if not game:
        raise HTTPException(status_code=404, detail="暂无游戏，请先创建")
    participant = next((p for p in game.participants.values() if p.token == token), None)
    if not participant:
        raise HTTPException(status_code=404, detail="找不到对应玩家，请重新加入")
    return to_participant_view(game, participant)


# ---- LegoSense APIs ----
@app.post("/api/legosense/start", status_code=200)
async def start_legosense():
    await state.set_lego_sense_started()
    return {"status": "ok"}


@app.get("/api/legosense/host", response_model=LegoSenseHostView)
async def legosense_host():
    game = state.game
    submissions = list(state.submissions_by_token.values())
    groups = list(state.groups.values())
    participants_view = [
        HostParticipantView(
            participantId=p.participant_id,
            name=p.name,
            word=p.word,
            undercover=p.undercover,
            hasVoted=p.has_voted,
            workImage=p.work_image,
            mood=p.mood,
        )
        for p in game.participants.values()
    ] if game else []

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
        participants=participants_view,
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


@app.post("/api/legosense/submit", status_code=200)
async def legosense_submit(payload: EmotionSubmitRequest):
    try:
        await state.submit_emotion(payload.participantToken, payload.emotion.strip())
        return {"status": "ok"}
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
            workImage=p.work_image,
            mood=p.mood,
        )
        for p in game.participants.values()
    ]
    undercover_name = (
        game.participants.get(game.undercover_participant_id).name
        if game.undercover_participant_id and game.undercover_participant_id in game.participants
        else None
    )
    return HostGameView(
        civilianWord=game.civilian_word,
        undercoverWord=game.undercover_word,
        civilianImage=game.civilian_image,
        undercoverImage=game.undercover_image,
        status=game.status,
        countdownActive=countdown_active,
        secondsToVoting=seconds_to_voting,
        warningTriggered=bool(getattr(game, "warning_triggered", False)),
        totalParticipants=len(game.participants),
        participants=participants,
        undercoverParticipantId=game.undercover_participant_id,
        undercoverName=undercover_name,
        winningTeam=game.winning_team,
        voteSummary=vote_summary,
        resultsRevealed=game.results_revealed,
    )


def to_participant_view(game, participant) -> ParticipantView:
    countdown_active = game.status == GameStatus.IN_PROGRESS and game.countdown_ends_at is not None
    seconds_to_voting = 0
    if countdown_active:
        seconds_to_voting = max(0, int((game.countdown_ends_at - now_utc()).total_seconds()))
    vote_summary = build_vote_summary(game)
    undercover_name = (
        game.participants.get(game.undercover_participant_id).name
        if game.undercover_participant_id and game.undercover_participant_id in game.participants
        else None
    )
    return ParticipantView(
        participantId=participant.participant_id,
        name=participant.name,
        status=game.status,
        word=participant.word,
        civilianWord=game.civilian_word,
        undercoverWord=game.undercover_word,
        civilianImage=game.civilian_image,
        undercoverImage=game.undercover_image,
        countdownActive=countdown_active,
        secondsToVoting=seconds_to_voting,
        warningTriggered=bool(getattr(game, "warning_triggered", False)),
        canVote=game.status == GameStatus.VOTING and not participant.has_voted,
        hasVoted=participant.has_voted,
        participants=[
            ParticipantListItem(
                participantId=p.participant_id,
                name=p.name,
                workImage=p.work_image
            )
            for p in sorted(game.participants.values(), key=lambda p: p.name.lower())
        ],
        undercoverName=undercover_name,
        winningTeam=game.winning_team,
        voteSummary=vote_summary,
        latestVibrationId=state.latest_vibration["id"] if state.latest_vibration else None,
        latestVibrationPattern=state.latest_vibration["pattern"] if state.latest_vibration else None,
        resultsRevealed=game.results_revealed,
    )


@app.post("/api/game/vibrate", status_code=202)
async def trigger_vibration(pattern: str):
    await state.trigger_vibration(pattern)


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


@app.post("/api/game/upload-work", status_code=200)
async def upload_work(payload: schemas.UploadWorkRequest = Body(...)):
    try:
        await state.upload_work(payload.participantToken, payload.image)
        return {"status": "ok"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/game/submit-mood", status_code=200)
async def submit_mood(payload: schemas.SubmitMoodRequest):
    try:
        await state.submit_mood(payload.participantToken, payload.mood)
        return {"status": "ok"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/game/reveal", status_code=200)
async def reveal_results():
    try:
        await state.reveal_results()
        return {"status": "ok"}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/debug/images")
async def debug_images():
    from .state import load_word_pairs
    pairs = load_word_pairs()
    base_path = state.base_path_debug if hasattr(state, "base_path_debug") else "Unknown"
    return {
        "pairs": pairs,
        "base_path_resolved": str(base_path),
        "cwd": str(Path.cwd())
    }

# Serve static assets (built JS/CSS/HTML)
app.mount("/topic_images", StaticFiles(directory=TOPIC_IMAGES_DIR), name="topic_images")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

app.include_router(hardware_router)

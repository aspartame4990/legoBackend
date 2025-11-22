from __future__ import annotations

import asyncio
import random
from datetime import timedelta
from typing import Dict, List, Optional

from .models import (
    EmotionSubmission,
    GameStatus,
    LegoSenseGroup,
    LegoSenseStatus,
    Participant,
    Team,
    UndercoverGame,
    now_utc,
    random_code,
    random_token,
)


class GameState:
    """In-memory state for both games (lightweight, single-process)."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self.game: Optional[UndercoverGame] = None
        self.warning_task: Optional[asyncio.Task] = None
        self.voting_task: Optional[asyncio.Task] = None

        self.submissions_by_token: Dict[str, EmotionSubmission] = {}
        self.groups: Dict[str, LegoSenseGroup] = {}
        self.lego_sense_status: LegoSenseStatus = LegoSenseStatus.IDLE

    async def create_game(self, civilian_word: str, undercover_word: str) -> UndercoverGame:
        async with self._lock:
            await self._cancel_tasks()
            self.submissions_by_token.clear()
            self.groups.clear()
            self.lego_sense_status = LegoSenseStatus.IDLE
            self.game = UndercoverGame(civilian_word=civilian_word, undercover_word=undercover_word)
            return self.game

    async def join(self, name: str) -> Participant:
        async with self._lock:
            game = self._require_game()
            participant_id = self._unique_participant_id()
            token = self._unique_token()
            participant = Participant(participant_id, token, name)
            game.participants[participant_id] = participant
            return participant

    async def start_game(self) -> UndercoverGame:
        async with self._lock:
            game = self._require_game()
            if len(game.participants) < 3:
                raise ValueError("至少需要 3 名玩家才能开始游戏")
            if game.status != GameStatus.WAITING_FOR_PLAYERS:
                return game
            undercover = random.choice(list(game.participants.values()))
            game.undercover_participant_id = undercover.participant_id
            for p in game.participants.values():
                is_undercover = p.participant_id == undercover.participant_id
                p.undercover = is_undercover
                p.word = game.undercover_word if is_undercover else game.civilian_word
                p.has_voted = False
            game.reset_votes()
            game.status = GameStatus.IN_PROGRESS
            game.countdown_ends_at = now_utc() + timedelta(minutes=2, seconds=30)
            game.warning_triggered = False
            await self._schedule_tasks()
            return game

    async def start_voting(self) -> UndercoverGame:
        async with self._lock:
            game = self._require_game()
            if game.status != GameStatus.IN_PROGRESS:
                return game
            game.status = GameStatus.VOTING
            game.voting_started_at = now_utc()
            game.reset_votes()
            await self._cancel_tasks()
            return game

    async def finish_game(self) -> UndercoverGame:
        async with self._lock:
            game = self._require_game()
            if game.status == GameStatus.FINISHED:
                return game
            if game.status == GameStatus.IN_PROGRESS:
                # force into voting without auto tally
                game.status = GameStatus.VOTING
            game.status = GameStatus.FINISHED
            game.finished_at = now_utc()
            game.winning_team = self._determine_winner(game)
            await self._cancel_tasks()
            return game

    async def record_vote(self, voter_token: str, target_id: str) -> UndercoverGame:
        async with self._lock:
            game = self._require_game()
            voter = self._get_by_token(voter_token)
            if game.status != GameStatus.VOTING:
                raise ValueError("当前阶段不允许投票")
            if voter.has_voted:
                raise ValueError("你已经投过票了")
            if target_id not in game.participants:
                raise ValueError("目标玩家不存在")
            if voter.participant_id == target_id:
                raise ValueError("不能投给自己")
            game.votes[voter.participant_id] = target_id
            voter.has_voted = True
            all_voted = all(p.has_voted for p in game.participants.values())
            if all_voted:
                await self.finish_game()
            return game

    async def set_lego_sense_started(self) -> None:
        async with self._lock:
            self.submissions_by_token.clear()
            self.groups.clear()
            self.lego_sense_status = LegoSenseStatus.COLLECTING

    async def submit_emotion(self, token: str, emotion: str) -> None:
        async with self._lock:
            participant = self._get_by_token(token)
            self.submissions_by_token[token] = EmotionSubmission(
                participant_id=participant.participant_id,
                participant_token=token,
                name=participant.name,
                emotion=emotion,
                submitted_at=now_utc(),
            )
            if self.lego_sense_status == LegoSenseStatus.IDLE:
                self.lego_sense_status = LegoSenseStatus.COLLECTING

    async def apply_groups(self, groups: List[LegoSenseGroup], assignments: Dict[str, str]) -> None:
        async with self._lock:
            self.groups = {g.group_id: g for g in groups}
            for token, group_id in assignments.items():
                if token in self.submissions_by_token and group_id in self.groups:
                    self.submissions_by_token[token].group_id = group_id
            if groups:
                self.lego_sense_status = LegoSenseStatus.APPLIED
            elif self.submissions_by_token:
                self.lego_sense_status = LegoSenseStatus.GROUPING
            else:
                self.lego_sense_status = LegoSenseStatus.COLLECTING

    async def _schedule_tasks(self) -> None:
        await self._cancel_tasks()
        if not self.game or not self.game.countdown_ends_at:
            return
        seconds = (self.game.countdown_ends_at - now_utc()).total_seconds()
        warning_delay = max(0, seconds - 30)
        self.warning_task = asyncio.create_task(self._warning_after(warning_delay))
        self.voting_task = asyncio.create_task(self._voting_after(seconds))

    async def _warning_after(self, delay: float) -> None:
        await asyncio.sleep(delay)
        async with self._lock:
            if self.game and self.game.status == GameStatus.IN_PROGRESS:
                self.game.warning_triggered = True

    async def _voting_after(self, delay: float) -> None:
        await asyncio.sleep(delay)
        await self.start_voting()

    async def _cancel_tasks(self) -> None:
        for task in (self.warning_task, self.voting_task):
            if task and not task.done():
                task.cancel()
        self.warning_task = None
        self.voting_task = None

    def _require_game(self) -> UndercoverGame:
        if not self.game:
            raise ValueError("当前没有进行中的游戏，请先创建")
        return self.game

    def _unique_participant_id(self) -> str:
        while True:
            pid = random_code(8)
            if not self.game or pid not in self.game.participants:
                return pid

    def _unique_token(self) -> str:
        while True:
            token = random_token()
            duplicate = any(
                token == p.token for p in (self.game.participants.values() if self.game else [])
            )
            if token not in self.submissions_by_token and not duplicate:
                return token

    def _get_by_token(self, token: str) -> Participant:
        if not self.game:
            raise ValueError("当前没有进行中的游戏，请先创建")
        for p in self.game.participants.values():
            if p.token == token:
                return p
        raise ValueError("未找到对应的玩家 token")

    def _determine_winner(self, game: UndercoverGame) -> Team:
        if not game.votes or not game.undercover_participant_id:
            return Team.UNDERCOVER
        tallies: Dict[str, int] = {}
        for target in game.votes.values():
            tallies[target] = tallies.get(target, 0) + 1
        top_id, top_votes = max(tallies.items(), key=lambda kv: kv[1])
        duplicates = sum(1 for v in tallies.values() if v == top_votes)
        if duplicates > 1:
            return Team.UNDERCOVER
        if top_id == game.undercover_participant_id:
            return Team.CIVILIANS
        return Team.UNDERCOVER


state = GameState()

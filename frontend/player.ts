type GameStatus = "WAITING_FOR_PLAYERS" | "IN_PROGRESS" | "VOTING" | "FINISHED";
type LegoSenseStatus = "IDLE" | "COLLECTING" | "GROUPING" | "APPLIED";

interface JoinResponse {
    participantId: string;
    participantToken: string;
}

interface ParticipantListItem {
    participantId: string;
    name: string;
}

interface VoteSummaryItem {
    participantId: string;
    name: string;
    votes: number;
}

interface ParticipantView {
    participantId: string;
    name: string;
    status: GameStatus;
    word?: string | null;
    civilianWord: string;
    undercoverWord: string;
    countdownActive: boolean;
    secondsToVoting: number;
    canVote: boolean;
    hasVoted: boolean;
    participants: ParticipantListItem[];
    voteSummary: VoteSummaryItem[];
}

interface LegoSensePlayerView {
    status: LegoSenseStatus;
    participantId: string;
    name: string;
    submitted: boolean;
    emotion?: string | null;
    groupName?: string | null;
    color?: string | null;
}

const STORAGE_KEY = "undercover-participant";
const state: {
    participantId: string | null;
    token: string | null;
    name: string | null;
    pollHandle?: number;
    countdownTimer?: number;
    countdownTarget: number | null;
    legoSensePoll?: number;
} = {
    participantId: null,
    token: null,
    name: null,
    countdownTarget: null
};

document.addEventListener("DOMContentLoaded", () => {
    (document.getElementById("joinForm") as HTMLFormElement).addEventListener("submit", handleJoin);
    (document.getElementById("submitEmotionBtn") as HTMLButtonElement).addEventListener("click", submitEmotion);
    resumeSession();
});

function loadSession() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveSession(session: { participantId: string; token: string; name: string }) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSessionStorage() {
    sessionStorage.removeItem(STORAGE_KEY);
}

async function handleJoin(event: Event) {
    event.preventDefault();
    hideJoinError();
    const name = (document.getElementById("playerName") as HTMLInputElement).value.trim();
    if (!name) {
        showJoinError("请填写昵称");
        return;
    }
    try {
        const response = await fetch(`/api/game/participants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "加入失败");
        }
        const data = (await response.json()) as JoinResponse;
        const session = { participantId: data.participantId, token: data.participantToken, name };
        saveSession(session);
        activateSession(session);
    } catch (err: any) {
        showJoinError(err.message);
    }
}

function resumeSession() {
    const saved = loadSession();
    if (saved) activateSession(saved);
}

function activateSession(session: { participantId: string; token: string; name: string }) {
    state.participantId = session.participantId;
    state.token = session.token;
    state.name = session.name;
    (document.getElementById("panelName") as HTMLElement).textContent = session.name;
    setJoinButtonDisabled(true);
    (document.getElementById("joinCard") as HTMLElement).hidden = true;
    (document.getElementById("playerPanel") as HTMLElement).hidden = false;
    startPolling();
    startLegoSensePolling();
}

function startPolling() {
    if (state.pollHandle) clearInterval(state.pollHandle);
    fetchParticipantView();
    state.pollHandle = window.setInterval(fetchParticipantView, 4000);
}

async function fetchParticipantView() {
    if (!state.token) return;
    try {
        const response = await fetch(`/api/participants/${state.token}`);
        if (!response.ok) throw new Error("获取玩家信息失败");
        const data = (await response.json()) as ParticipantView;
        state.name = data.name;
        renderParticipant(data);
    } catch (err) {
        console.error(err);
        alert("当前游戏已失效或被重置，请重新加入。");
        resetSession();
    }
}

function renderParticipant(view: ParticipantView) {
    (document.getElementById("panelStatus") as HTMLElement).textContent = statusLabel(view.status);
    (document.getElementById("panelName") as HTMLElement).textContent = view.name;
    updateWords(view);
    updateParticipantCountdown(view);
    renderPlayers(view.participants, view.participantId);
    renderVoteSection(view);
    renderVoteResults(view.voteSummary);
}

function renderPlayers(players: ParticipantListItem[], selfId: string) {
    const list = document.getElementById("playersList") as HTMLElement;
    list.innerHTML = "";
    if (!players?.length) {
        list.innerHTML = "<li>暂无玩家</li>";
        return;
    }
    players.forEach((player) => {
        const li = document.createElement("li");
        li.textContent = player.name + (player.participantId === selfId ? "（我）" : "");
        list.appendChild(li);
    });
}

function renderVoteSection(view: ParticipantView) {
    const box = document.getElementById("voteSection") as HTMLElement;
    if (view.status !== "VOTING") {
        box.innerHTML = `<div class="hint">等待房主开启投票</div>`;
        return;
    }
    if (!view.canVote) {
        box.innerHTML = `<div class="hint">本轮无需你投票，请等待结果。</div>`;
        return;
    }
    if (view.hasVoted) {
        box.innerHTML = `<div class="hint">已提交投票，请等待房主公布结果。</div>`;
        return;
    }
    const options = view.participants
        .filter((player) => player.participantId !== view.participantId)
        .map((player) => `<option value="${player.participantId}">${player.name}</option>`)
        .join("");
    if (!options) {
        box.innerHTML = `<div class="hint">暂无可投票的对象</div>`;
        return;
    }
    box.innerHTML = `
        <div class="vote-area">
            <select id="voteTarget">${options}</select>
            <button type="button" id="voteBtn">提交投票</button>
        </div>
    `;
    (document.getElementById("voteBtn") as HTMLButtonElement).addEventListener("click", submitVote);
}

function renderVoteResults(summary: VoteSummaryItem[]) {
    const tbody = document.getElementById("participantVoteTable") as HTMLElement;
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!summary?.length) {
        tbody.innerHTML = `<tr><td colspan="2" class="empty">暂无投票</td></tr>`;
        return;
    }
    summary.forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${item.name}</td><td>${item.votes}</td>`;
        tbody.appendChild(tr);
    });
}

function updateWords(view: ParticipantView) {
    (document.getElementById("wordOneText") as HTMLElement).textContent = view.civilianWord ?? "-";
    (document.getElementById("wordTwoText") as HTMLElement).textContent = view.undercoverWord ?? "-";
}

function updateParticipantCountdown(view: ParticipantView) {
    const el = document.getElementById("participantCountdown") as HTMLElement;
    if (view.countdownActive) {
        state.countdownTarget = Date.now() + view.secondsToVoting * 1000;
        if (!state.countdownTimer) {
            state.countdownTimer = window.setInterval(() => tickParticipantCountdown(el), 1000);
        }
        el.textContent = formatSeconds(view.secondsToVoting);
    } else {
        clearParticipantCountdown();
        el.textContent = view.status === "IN_PROGRESS" ? "等待自动进入投票" : "--";
    }
}

function tickParticipantCountdown(el: HTMLElement) {
    if (!state.countdownTarget) return;
    const remaining = Math.max(0, Math.round((state.countdownTarget - Date.now()) / 1000));
    el.textContent = formatSeconds(remaining);
    if (remaining <= 0) clearParticipantCountdown();
}

function clearParticipantCountdown() {
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = undefined;
    }
    state.countdownTarget = null;
}

async function submitVote() {
    const select = document.getElementById("voteTarget") as HTMLSelectElement;
    const target = select?.value;
    if (!target) return;
    try {
        const response = await fetch(`/api/game/votes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voterToken: state.token, targetParticipantId: target })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "投票失败");
        }
        await fetchParticipantView();
    } catch (err: any) {
        alert(err.message);
    }
}

function resetSession() {
    state.participantId = null;
    state.token = null;
    state.name = null;
    if (state.pollHandle) {
        clearInterval(state.pollHandle);
        state.pollHandle = undefined;
    }
    if (state.legoSensePoll) {
        clearInterval(state.legoSensePoll);
        state.legoSensePoll = undefined;
    }
    clearParticipantCountdown();
    clearSessionStorage();
    (document.getElementById("playerPanel") as HTMLElement).hidden = true;
    (document.getElementById("joinCard") as HTMLElement).hidden = false;
    setJoinButtonDisabled(false);
}

function showJoinError(message: string) {
    const box = document.getElementById("joinError") as HTMLElement;
    box.textContent = message;
    box.hidden = false;
}

function hideJoinError() {
    const box = document.getElementById("joinError") as HTMLElement;
    box.hidden = true;
    box.textContent = "";
}

function statusLabel(status: GameStatus) {
    switch (status) {
        case "WAITING_FOR_PLAYERS":
            return "等待开始";
        case "IN_PROGRESS":
            return "描述阶段";
        case "VOTING":
            return "投票阶段";
        case "FINISHED":
            return "游戏结束";
        default:
            return "未知";
    }
}

function formatSeconds(seconds: number) {
    const safe = Math.max(0, seconds);
    const mins = String(Math.floor(safe / 60)).padStart(2, "0");
    const secs = String(safe % 60).padStart(2, "0");
    return `${mins}:${secs}`;
}

function setJoinButtonDisabled(disabled: boolean) {
    const button = document.querySelector<HTMLButtonElement>("#joinForm button[type='submit']");
    if (button) button.disabled = disabled;
}

// ----- LegoSense -----
function startLegoSensePolling() {
    if (state.legoSensePoll) clearInterval(state.legoSensePoll);
    fetchLegoSenseView();
    state.legoSensePoll = window.setInterval(fetchLegoSenseView, 5000);
}

async function fetchLegoSenseView() {
    if (!state.token) return;
    try {
        const response = await fetch(`/api/legosense/player/${state.token}`);
        if (!response.ok) return;
        const data = (await response.json()) as LegoSensePlayerView;
        renderLegoSense(data);
    } catch (err) {
        console.error(err);
    }
}

async function submitEmotion() {
    const emotionInput = document.getElementById("emotionInput") as HTMLInputElement;
    const emotion = emotionInput.value.trim();
    if (!emotion) {
        (document.getElementById("emotionHint") as HTMLElement).textContent = "请先输入一个情绪词";
        return;
    }
    try {
        const response = await fetch("/api/legosense/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ participantToken: state.token, emotion })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "提交失败");
        }
        (document.getElementById("emotionHint") as HTMLElement).textContent = "已提交，等待主持人分组。";
        fetchLegoSenseView();
    } catch (err: any) {
        alert(err.message);
    }
}

function renderLegoSense(view: LegoSensePlayerView) {
    (document.getElementById("legoSenseStatus") as HTMLElement).textContent = legoSenseStatusLabel(view.status);
    (document.getElementById("legoSenseGroup") as HTMLElement).textContent = view.groupName ?? "-";
    const colorEl = document.getElementById("legoSenseColor") as HTMLElement;
    if (view.color) {
        colorEl.textContent = view.color;
        colorEl.style.setProperty("--chip-color", view.color);
    } else {
        colorEl.textContent = "尚未下发";
        colorEl.style.removeProperty("--chip-color");
    }
    const hintEl = document.getElementById("emotionHint") as HTMLElement;
    if (view.submitted && view.emotion) {
        hintEl.textContent = `已提交：${view.emotion}`;
    } else {
        hintEl.textContent = "提交后房主会把你分入同色小组。";
    }
}

function legoSenseStatusLabel(status: LegoSenseStatus) {
    switch (status) {
        case "COLLECTING":
            return "收集中";
        case "GROUPING":
            return "分组中";
        case "APPLIED":
            return "已下发";
        default:
            return "未开始";
    }
}

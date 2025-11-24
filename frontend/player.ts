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
    civilianImage?: string | null;
    undercoverImage?: string | null;
    countdownActive: boolean;
    secondsToVoting: number;
    warningTriggered: boolean;
    canVote: boolean;
    hasVoted: boolean;
    participants: ParticipantListItem[];
    undercoverName?: string | null;
    winningTeam?: "CIVILIANS" | "UNDERCOVER" | null;
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

type VibeSample = 0 | 1;

const VIBE_PATTERN_A: VibeSample[] = [
    1, 1, 1, 1, 0, 0, 0,
    1, 1, 1, 1, 0, 0, 0,
    1, 1, 1, 1, 0, 0, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0
];

const VIBE_PATTERN_B: VibeSample[] = [
    1, 1, 1, 1, 0, 0, 0,
    1, 1, 1, 1, 0, 0, 0,
    1, 1, 1, 1, 1, 1, 1, 0, 0, 0,
    1, 1, 1, 1, 1, 1, 1, 0, 0, 0
];

export function initPlayer() {
    // Event Listeners
    const joinForm = document.getElementById("joinForm") as HTMLFormElement | null;
    if (joinForm) joinForm.addEventListener("submit", handleJoin);

    // const voteSection = document.getElementById("voteSection");
    // if (voteSection) voteSection.addEventListener("click", handleVoteClick);

    // Draw initial waves (empty or placeholder)
    // drawVibeWave("playerVibeWaveA", VIBE_PATTERN_A);
    // drawVibeWave("playerVibeWaveB", VIBE_PATTERN_B);

    // Check if we have a session
    const stored = localStorage.getItem("participantToken");
    if (stored) {
        state.token = stored;
        fetchParticipantView();
        startPolling();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initPlayer();
});

function drawVibeWave(canvasId: string, samples: VibeSample[]) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas || !samples.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 200;
    const height = canvas.clientHeight || 32;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const baseY = height * 0.8;
    const low = height * 0.15;
    const high = height * 0.6;
    const step = width / samples.length;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#f97316");
    gradient.addColorStop(1, "#facc15");
    ctx.strokeStyle = gradient;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, step * 0.7);

    const durationMs = 2000;
    let start: number | null = null;

    function frame(timestamp: number) {
        if (!ctx) return;
        if (start === null) start = timestamp;
        const elapsed = (timestamp - start) % durationMs;
        const ratio = elapsed / durationMs;
        const offset = Math.floor(ratio * samples.length);

        ctx.clearRect(0, 0, width, height);

        samples.forEach((_, index) => {
            const sampleIndex = (offset + index) % samples.length;
            const value = samples[sampleIndex];
            const px = index * step + step / 2;
            const barHeight = value ? high : low;
            const yTop = baseY - barHeight;
            ctx.beginPath();
            ctx.moveTo(px, baseY);
            ctx.lineTo(px, yTop);
            ctx.stroke();
        });

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

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
        showJoinError("Please enter a nickname");
        return;
    }
    setJoinButtonDisabled(true);
    try {
        const response = await fetch(`/api/game/participants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "Failed to join");
        }
        const data = (await response.json()) as JoinResponse;
        const session = { participantId: data.participantId, token: data.participantToken, name };
        saveSession(session);
        activateSession(session);
    } catch (err: any) {
        showJoinError(err.message);
        setJoinButtonDisabled(false);
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

    // Switch view
    (document.getElementById("joinCard") as HTMLElement).hidden = true;
    (document.getElementById("playerPanel") as HTMLElement).hidden = false;

    startPolling();
    // startLegoSensePolling();
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
        if (!response.ok) throw new Error("Failed to fetch player state");
        const data = (await response.json()) as ParticipantView;
        state.name = data.name;
        renderParticipant(data);
    } catch (err) {
        console.error(err);
        alert("The current round is no longer valid. Please join again.");
        resetSession();
    }
}

function renderParticipant(view: ParticipantView) {
    (document.getElementById("panelStatus") as HTMLElement).textContent = statusLabel(view.status);
    (document.getElementById("panelName") as HTMLElement).textContent = view.name;

    // Phase Switching
    const waitingPhase = document.getElementById("phase-waiting");
    const gamePhase = document.getElementById("phase-game");
    const votingPhase = document.getElementById("phase-voting");

    if (waitingPhase) waitingPhase.hidden = true;
    if (gamePhase) gamePhase.hidden = true;
    if (votingPhase) votingPhase.hidden = true;

    if (view.status === "WAITING_FOR_PLAYERS") {
        if (waitingPhase) waitingPhase.hidden = false;
    } else if (view.status === "IN_PROGRESS") {
        if (gamePhase) gamePhase.hidden = false;
    } else {
        if (votingPhase) votingPhase.hidden = false;
    }

    updateWords(view);
    updateParticipantCountdown(view);
    // renderPlayers(view.participants, view.participantId);
    renderVoteSection(view);
    renderVoteResults(view.voteSummary);
    // renderGameResult(view);
}

function renderVoteSection(view: ParticipantView) {
    const box = document.getElementById("voteSection") as HTMLElement;
    if (!box) return;

    if (view.status !== "VOTING") {
        box.innerHTML = `<p class="hint">Waiting for the host to start voting.</p>`;
        return;
    }
    if (!view.canVote) {
        box.innerHTML = `<p class="hint">You don't need to vote this round. Please wait for the result.</p>`;
        return;
    }
    if (view.hasVoted) {
        box.innerHTML = `<p class="hint">Vote submitted. Wait for the host to reveal the result.</p>`;
        return;
    }
    const options = view.participants
        .filter((player) => player.participantId !== view.participantId)
        .map((player) => `<option value="${player.participantId}">${player.name}</option>`)
        .join("");
    if (!options) {
        box.innerHTML = `<p class="hint">No one to vote for yet.</p>`;
        return;
    }
    box.innerHTML = `
        <div class="stack">
            <select id="voteTarget">${options}</select>
            <button type="button" id="voteBtn" class="btn btn-primary">Submit Vote</button>
        </div>
    `;
    (document.getElementById("voteBtn") as HTMLButtonElement).addEventListener("click", submitVote);
}

function renderVoteResults(summary: VoteSummaryItem[]) {
    const tbody = document.getElementById("participantVoteTable") as HTMLElement;
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!summary?.length) {
        tbody.innerHTML = `<tr><td colspan="2" class="hint">No votes yet</td></tr>`;
        return;
    }
    summary.forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${item.name}</td><td>${item.votes}</td>`;
        tbody.appendChild(tr);
    });
}

function updateWords(view: ParticipantView) {
    const w1 = document.getElementById("wordOneText");
    const w2 = document.getElementById("wordTwoText");
    if (w1) w1.textContent = view.civilianWord ?? "-";
    if (w2) w2.textContent = view.undercoverWord ?? "-";

    const img1 = document.getElementById("playerImageA") as HTMLImageElement;
    const img2 = document.getElementById("playerImageB") as HTMLImageElement;
    if (img1 && view.civilianImage) img1.src = `/topic_images/${view.civilianImage}`;
    if (img2 && view.undercoverImage) img2.src = `/topic_images/${view.undercoverImage}`;
}

function updateParticipantCountdown(view: ParticipantView) {
    const el = document.getElementById("participantCountdown") as HTMLElement;
    if (!el) return;

    if (view.countdownActive) {
        state.countdownTarget = Date.now() + view.secondsToVoting * 1000;
        if (!state.countdownTimer) {
            state.countdownTimer = window.setInterval(() => tickParticipantCountdown(el), 1000);
        }
        el.textContent = formatSeconds(view.secondsToVoting);
        if (view.warningTriggered) {
            el.style.color = "var(--danger)";
        } else {
            el.style.color = "";
        }
    } else {
        clearParticipantCountdown();
        el.textContent = view.status === "IN_PROGRESS" ? "Waiting..." : "--:--";
        el.style.color = "";
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
            throw new Error(error.detail || "Failed to submit vote");
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
        case "WAITING_FOR_PLAYERS": return "Waiting";
        case "IN_PROGRESS": return "Building";
        case "VOTING": return "Voting";
        case "FINISHED": return "Finished";
        default: return "Unknown";
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

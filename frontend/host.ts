type GameStatus = "WAITING_FOR_PLAYERS" | "IN_PROGRESS" | "VOTING" | "FINISHED";
type LegoSenseStatus = "IDLE" | "COLLECTING" | "GROUPING" | "APPLIED";

interface HostParticipantView {
    participantId: string;
    name: string;
    word?: string | null;
    undercover: boolean;
    hasVoted: boolean;
    workImage?: string | null;
    mood?: string | null;
}

interface VoteSummaryItem {
    participantId: string;
    name: string;
    votes: number;
}

interface HostGameView {
    civilianWord: string;
    undercoverWord: string;
    civilianImage?: string | null;
    undercoverImage?: string | null;
    status: GameStatus;
    countdownActive: boolean;
    secondsToVoting: number;
    warningTriggered: boolean;
    totalParticipants: number;
    participants: HostParticipantView[];
    undercoverParticipantId?: string | null;
    undercoverName?: string | null;
    winningTeam?: "CIVILIANS" | "UNDERCOVER" | null;
    voteSummary: VoteSummaryItem[];
    resultsRevealed: boolean;
}

interface LegoSenseSubmissionView {
    participantId: string;
    participantToken: string;
    name: string;
    emotion: string;
    groupId?: string | null;
}

interface LegoSenseGroupView {
    id: string;
    name: string;
    color: string;
    memberTokens: string[];
    memberNames: string[];
}

interface LegoSenseHostView {
    status: LegoSenseStatus;
    submissions: LegoSenseSubmissionView[];
    groups: LegoSenseGroupView[];
    participants: HostParticipantView[];
}

type GroupDraft = { id: string; name: string; color: string; memberTokens: string[] };

type VibeSample = 0 | 1;

const VIBE_PATTERN_A: VibeSample[] = [
    // S
    1, 1, 1, 1, 0, 0, 0,
    // S
    1, 1, 1, 1, 0, 0, 0,
    // S
    1, 1, 1, 1, 0, 0, 0,
    // L
    1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0
];

const VIBE_PATTERN_B: VibeSample[] = [
    // S
    1, 1, 1, 1, 0, 0, 0,
    // S
    1, 1, 1, 1, 0, 0, 0,
    // L
    1, 1, 1, 1, 1, 1, 1, 0, 0, 0,
    // L
    1, 1, 1, 1, 1, 1, 1, 0, 0, 0
];

const state = {
    pollHandle: 0 as number | undefined,
    countdownTimer: 0 as number | undefined,
    countdownTarget: 0 as number | null,
    lastStatus: null as GameStatus | null,
    viewOverride: null as GameStatus | null,
    lastView: null as HostGameView | null
};

const legoSenseState: {
    pollHandle?: number;
    serverGroups: LegoSenseGroupView[];
    customGroups: GroupDraft[];
    submissions: LegoSenseSubmissionView[];
} = {
    serverGroups: [],
    customGroups: [],
    submissions: []
};

// --- Bluetooth Configuration ---
const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleDevice: BluetoothDevice | null = null;
let bleCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

// Polyfill types for Web Bluetooth if not present
interface BluetoothDevice extends EventTarget {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
}
interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}
interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}
interface BluetoothRemoteGATTCharacteristic {
    writeValue(value: BufferSource): Promise<void>;
}


export function initHost() {
    // Initial Setup
    setupNav();
    setupPhaseTabs();

    // Event Listeners
    // const createForm = document.getElementById("createForm") as HTMLFormElement | null;
    // if (createForm) createForm.addEventListener("submit", handleCreate);

    const startBtn = document.getElementById("btnStartGame") as HTMLButtonElement | null;
    if (startBtn) startBtn.addEventListener("click", () => startGame(false));

    const forceStartBtn = document.getElementById("btnForceStart") as HTMLButtonElement | null;
    if (forceStartBtn) forceStartBtn.addEventListener("click", () => startGame(true));

    const mockModeCheck = document.getElementById("mockModeCheck");
    if (mockModeCheck) {
        mockModeCheck.addEventListener("change", () => {
            // Re-evaluate button state based on current view data if available, 
            // or just wait for next poll. To be responsive, we can trigger a quick check if we had the data.
            // For simplicity, let's just wait for the next poll or trigger a fetch.
            fetchHostView();
        });
    }

    const finishBtn = document.getElementById("finishBtn") as HTMLButtonElement | null;
    if (finishBtn) finishBtn.addEventListener("click", finishVoting);

    const newGameBtn = document.getElementById("btnNewGame") as HTMLButtonElement | null;
    if (newGameBtn) newGameBtn.addEventListener("click", createNewGame);

    const switchTopicBtn = document.getElementById("btnSwitchTopic") as HTMLButtonElement | null;
    if (switchTopicBtn) switchTopicBtn.addEventListener("click", switchTopic);

    const startTimerBtn = document.getElementById("btnStartTimer") as HTMLButtonElement | null;
    if (startTimerBtn) startTimerBtn.addEventListener("click", startTimer);

    const startVotingBtn = document.getElementById("btnStartVoting") as HTMLButtonElement | null;
    if (startVotingBtn) startVotingBtn.addEventListener("click", startVoting);

    const nextPhaseBtn = document.getElementById("btnNextPhase") as HTMLButtonElement | null;
    if (nextPhaseBtn) nextPhaseBtn.addEventListener("click", startVoting);

    const refreshDevicesBtn = document.getElementById("refreshDevicesBtn");
    if (refreshDevicesBtn) refreshDevicesBtn.addEventListener("click", connectToBleDevice);


    // LegoSense Listeners (if elements exist)
    const startSenseBtn = document.getElementById("startSenseBtn");
    if (startSenseBtn) startSenseBtn.addEventListener("click", startLegoSense);

    const applyGroupBtn = document.getElementById("applyGroupBtn");
    if (applyGroupBtn) applyGroupBtn.addEventListener("click", applyLegoSenseGroups);

    const addGroupForm = document.getElementById("addGroupForm");
    if (addGroupForm) addGroupForm.addEventListener("submit", addLegoSenseGroup);

    // Draw initial waves
    drawVibeWave("vibeWaveA", VIBE_PATTERN_A);
    drawVibeWave("vibeWaveB", VIBE_PATTERN_B);
    drawVibeWave("vibeWaveAPlay", VIBE_PATTERN_A);
    drawVibeWave("vibeWaveBPlay", VIBE_PATTERN_B);

    // Bind preview buttons
    (window as any).previewPattern = previewPattern;

    // Start Polling
    startLegoSensePolling();
    // Check if game exists, if not create it
    checkAndCreateGame();

    // Expose kick function globally
    (window as any).kickParticipant = kickParticipant;
}


function setupNav() {
    const tabs = document.querySelectorAll<HTMLButtonElement>(".nav-tab");
    const viewGame1 = document.getElementById("view-game1") as HTMLElement | null;
    const viewGame2 = document.getElementById("view-game2") as HTMLElement | null;

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.view;
            if (target === "game1" || target === "game2") {
                tabs.forEach((t) => t.classList.toggle("active", t === tab));

                if (viewGame1 && viewGame2) {
                    viewGame1.hidden = target !== "game1";
                    viewGame2.hidden = target !== "game2";
                }
            }
        });
    });
}

function setupPhaseTabs() {
    const mapping: Record<string, GameStatus> = {
        "step-setup": "WAITING_FOR_PLAYERS",
        "step-play": "IN_PROGRESS",
        "step-wrap": "FINISHED"
    };

    Object.entries(mapping).forEach(([id, status]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add("clickable");
        el.addEventListener("click", () => {
            state.viewOverride = state.viewOverride === status ? null : status;
            rerenderLastView();
        });
    });
}

function rerenderLastView() {
    if (state.lastView) {
        renderHostView(state.lastView);
    }
}

async function checkAndCreateGame() {
    try {
        const response = await fetch(`/api/game/host`);
        if (response.ok) {
            const data = (await response.json()) as HostGameView;
            renderHostView(data);
            startPolling();
        } else {
            // No game exists, create one automatically
            console.log("No active game found, creating new game...");
            await createNewGame();
        }
    } catch (err) {
        console.error("Failed to check game status:", err);
        // Retry after delay? Or just alert?
        // alert("Failed to connect to server. Please check if backend is running.");
    }
}

async function autoCreateGame() {
    try {
        const response = await fetch("/api/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ civilianWord: "", undercoverWord: "" })
        });
        if (!response.ok) {
            throw new Error("Failed to auto-create game");
        }
        const data = (await response.json()) as HostGameView;
        renderHostView(data);
        startPolling();
    } catch (err: any) {
        showError(err.message);
    }
}

async function fetchHostView() {
    try {
        const response = await fetch(`/api/game/host`);
        if (!response.ok) {
            // If 404 or error, maybe no game created yet
            return;
        }
        const data = (await response.json()) as HostGameView;
        renderHostView(data);
    } catch (err) {
        console.error(err);
    }
}

function renderHostView(data: HostGameView) {
    if (state.lastStatus && state.lastStatus !== data.status) {
        // Status changed
    }
    state.lastStatus = data.status;
    state.lastView = data;

    const effectiveStatus = state.viewOverride ?? data.status;

    // Always render gallery so uploads show up in all phases (including Voting)
    renderGallery(data);

    // Update Phase Indicator
    updatePhaseIndicator(effectiveStatus);
    updateTopicCards(data);

    // Switch Sections
    const setupSection = document.getElementById("game1-setup");
    const playSection = document.getElementById("game1-play");
    const wrapSection = document.getElementById("game1-wrap");
    const previewPanel = document.getElementById("previewPanel");

    if (setupSection) setupSection.hidden = true;
    if (playSection) playSection.hidden = true;
    if (wrapSection) wrapSection.hidden = true;

    if (effectiveStatus === "WAITING_FOR_PLAYERS") {
        if (setupSection) setupSection.hidden = false;
        if (previewPanel) previewPanel.hidden = false;
    } else if (effectiveStatus === "IN_PROGRESS") {
        if (playSection) playSection.hidden = false;
    } else if (data.status === "FINISHED") {
        if (setupSection) setupSection.hidden = true; // waitingPanel
        if (playSection) playSection.hidden = true; // gamePanel
        if (wrapSection) { // resultPanel
            wrapSection.hidden = false;

            // Hide "End Voting" button
            const finishBtn = document.getElementById("finishBtn");
            if (finishBtn) finishBtn.hidden = true;

            // Show Reveal Button if not revealed
            const revealBtn = document.getElementById("btnRevealResults");
            if (revealBtn) {
                revealBtn.hidden = data.resultsRevealed;
                revealBtn.onclick = revealResults;
            }
        }
    } else {
        // VOTING Phase
        if (wrapSection) {
            wrapSection.hidden = false;

            // Show "End Voting" button
            const finishBtn = document.getElementById("finishBtn");
            if (finishBtn) finishBtn.hidden = false;

            // Hide Reveal Button
            const revealBtn = document.getElementById("btnRevealResults");
            if (revealBtn) revealBtn.hidden = true;

            // Render Gallery so host can see uploads during voting
            renderGallery(data);
        }
    }

    // Update Text Content
    const civA = document.getElementById("civilianWordText");
    const civPlay = document.getElementById("civilianWordTextPlay");
    const undercoverA = document.getElementById("undercoverWordText");
    const undercoverPlay = document.getElementById("undercoverWordTextPlay");

    if (civA) {
        civA.textContent = data.civilianWord;
        civA.style.display = "block";
    }
    if (civPlay) {
        civPlay.textContent = data.civilianWord;
        civPlay.style.display = data.status === "IN_PROGRESS" ? "none" : "block";
    }
    if (undercoverA) {
        undercoverA.textContent = data.undercoverWord;
        undercoverA.style.display = "block";
    }
    if (undercoverPlay) {
        undercoverPlay.textContent = data.undercoverWord;
        undercoverPlay.style.display = data.status === "IN_PROGRESS" ? "none" : "block";
    }

    // Update Images
    const civImg = document.getElementById("civilianImage") as HTMLImageElement;
    const civImgPlay = document.getElementById("civilianImagePlay") as HTMLImageElement;
    const underImg = document.getElementById("undercoverImage") as HTMLImageElement;
    const underImgPlay = document.getElementById("undercoverImagePlay") as HTMLImageElement;

    if (civImg) {
        if (data.civilianImage) {
            // Show card back during IN_PROGRESS, real image otherwise (e.g. FINISHED)
            const src = data.status === "IN_PROGRESS" ? "/card_back.png" : `/topic_images/${data.civilianImage}`;
            civImg.src = src;
            civImg.style.display = "block";
        } else {
            civImg.style.display = "none";
        }
    }
    if (civImgPlay) {
        if (data.civilianImage) {
            const src = data.status === "IN_PROGRESS" ? "/card_back.png" : `/topic_images/${data.civilianImage}`;
            civImgPlay.src = src;
            civImgPlay.style.display = "block";
        } else {
            civImgPlay.style.display = "none";
        }
    }
    if (underImg) {
        if (data.undercoverImage) {
            const src = data.status === "IN_PROGRESS" ? "/card_back.png" : `/topic_images/${data.undercoverImage}`;
            underImg.src = src;
            underImg.style.display = "block";
        } else {
            underImg.style.display = "none";
        }
    }
    if (underImgPlay) {
        if (data.undercoverImage) {
            const src = data.status === "IN_PROGRESS" ? "/card_back.png" : `/topic_images/${data.undercoverImage}`;
            underImgPlay.src = src;
            underImgPlay.style.display = "block";
        } else {
            underImgPlay.style.display = "none";
        }
    }

    const playerCountBadge = document.getElementById("playerCountBadge");
    if (playerCountBadge) playerCountBadge.textContent = `${data.totalParticipants} Players`;

    updateButtons(data);
    updateCountdown(data);
    renderParticipants(data.participants, data.status, data.resultsRevealed);
    renderVotes(data.voteSummary);
}

function updatePhaseIndicator(status: GameStatus) {
    const steps = {
        setup: document.getElementById("step-setup"),
        play: document.getElementById("step-play"),
        wrap: document.getElementById("step-wrap")
    };

    // Reset all
    Object.values(steps).forEach(el => el?.classList.remove("active"));

    if (status === "WAITING_FOR_PLAYERS") {
        steps.setup?.classList.add("active");
    } else if (status === "IN_PROGRESS") {
        steps.play?.classList.add("active");
    } else {
        steps.wrap?.classList.add("active");
    }
}

function renderParticipants(participants: HostParticipantView[], status: GameStatus, revealed: boolean) {
    const listContainer = document.getElementById("playerListWait");
    if (listContainer) {
        // Render for Waiting Phase (Card List)
        if (!participants?.length) {
            listContainer.innerHTML = `<div class="empty-state">Waiting for players to join...</div>`;
        } else {
            listContainer.innerHTML = participants.map(p => `
                <div class="player-item row between center">
                    <div class="row center gap-sm">
                        <span class="icon">👤</span>
                        <span class="player-name">${p.name}</span>
                    </div>
                    <button class="btn-icon-danger" onclick="kickParticipant('${p.participantId}')" title="Kick Player">
                        ✕
                    </button>
                </div>
            `).join("");
        }
    }

    // Render for Table (In-Game / Post-Game)
    const tbody = document.getElementById("playersTable") as HTMLElement;
    if (tbody) {
        tbody.innerHTML = "";
        if (!participants?.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="hint">No players joined yet</td></tr>`;
            return;
        }
        participants.forEach((player) => {
            const tr = document.createElement("tr");
            const role = status === "FINISHED" ? (player.undercover ? "Undercover" : "Civilian") : player.word ? "Ready" : "Joined";
            const roleClass = status === "FINISHED" ? (player.undercover ? "badge badge-danger" : "badge badge-success") : "badge badge-neutral";

            tr.innerHTML = `
                <td>
                    <div class="row center gap-sm">
                        ${player.name}
                        ${player.workImage ? '<span title="Work Uploaded">📷</span>' : ''}
                        ${player.mood ? `<span class="badge badge-neutral">${player.mood}</span>` : ''}
                    </div>
                </td>
                <td>${revealed ? (player.word ?? "-") : "Hidden"}</td>
                <td>${player.hasVoted ? "<span class='badge badge-success'>Voted</span>" : "-"}</td>
                <td><span class="${roleClass}">${role}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
}



function renderVotes(summary: VoteSummaryItem[]) {
    const tbody = document.getElementById("voteTable") as HTMLElement;
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

async function startGame(force: boolean) {
    try {
        const mockMode = force || (document.getElementById("mockModeCheck") as HTMLInputElement)?.checked || false;
        const response = await fetch(`/api/game/start?mockMode=${mockMode}`, { method: "POST" });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "Failed to start");
        }
        await fetchHostView();
    } catch (err: any) {
        alert(err.message);
    }
}

function updateButtons(view: HostGameView) {
    const startBtn = document.getElementById("btnStartGame") as HTMLButtonElement | null;
    const mockModeCheck = document.getElementById("mockModeCheck") as HTMLInputElement;

    if (startBtn) {
        const isMock = mockModeCheck?.checked;
        const canStart = isMock || (view.status === "WAITING_FOR_PLAYERS" && view.totalParticipants >= 3);
        startBtn.disabled = !canStart;
    }

    const forceStartBtn = document.getElementById("btnForceStart") as HTMLButtonElement;
    if (forceStartBtn) {
        forceStartBtn.disabled = view.status !== "WAITING_FOR_PLAYERS";
    }

    const finishBtn = document.getElementById("finishBtn") as HTMLButtonElement;
    if (finishBtn) {
        finishBtn.disabled = view.status !== "VOTING";
        finishBtn.textContent = view.status === "FINISHED" ? "Game Finished" : "Reveal & End";
    }
}

function updateTopicCards(view: HostGameView) {
    const reveal = view.resultsRevealed;

    const civilianWordEl = document.getElementById("civilianWordTextPlay");
    const undercoverWordEl = document.getElementById("undercoverWordTextPlay");
    const civilianWordSetupEl = document.getElementById("civilianWordText");
    const undercoverWordSetupEl = document.getElementById("undercoverWordText");

    const hiddenText = "Hidden until reveal";

    if (civilianWordEl) civilianWordEl.textContent = reveal ? view.civilianWord : hiddenText;
    if (undercoverWordEl) undercoverWordEl.textContent = reveal ? view.undercoverWord : hiddenText;
    if (civilianWordSetupEl) civilianWordSetupEl.textContent = reveal ? view.civilianWord : hiddenText;
    if (undercoverWordSetupEl) undercoverWordSetupEl.textContent = reveal ? view.undercoverWord : hiddenText;

    const civilianImage = document.getElementById("civilianImagePlay") as HTMLImageElement | null;
    const undercoverImage = document.getElementById("undercoverImagePlay") as HTMLImageElement | null;
    const civilianImageSetup = document.getElementById("civilianImage") as HTMLImageElement | null;
    const undercoverImageSetup = document.getElementById("undercoverImage") as HTMLImageElement | null;

    const setImg = (el: HTMLImageElement | null, src?: string | null) => {
        if (!el) return;
        if (reveal && src) {
            el.src = `/topic_images/${src}`;
            el.hidden = false;
        } else {
            el.hidden = true;
        }
    };

    setImg(civilianImage, view.civilianImage);
    setImg(undercoverImage, view.undercoverImage);
    setImg(civilianImageSetup, view.civilianImage);
    setImg(undercoverImageSetup, view.undercoverImage);
}

async function finishVoting() {
    try {
        const response = await fetch("/api/game/finish", { method: "POST" });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "Failed to finish voting");
        }
        await fetchHostView();
    } catch (err: any) {
        alert(err.message);
    }
}

async function createNewGame() {
    try {
        state.viewOverride = null;
        clearCountdownTimer();
        const response = await fetch("/api/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ civilianWord: "", undercoverWord: "" })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "Failed to create game");
        }
        const data = (await response.json()) as HostGameView;
        renderHostView(data);
        startPolling();
    } catch (err: any) {
        alert(err.message);
    }
}

interface HostParticipantView {
    participantId: string;
    name: string;
    word?: string | null;
    undercover: boolean;
    hasVoted: boolean;
    workImage?: string | null;
    mood?: string | null;
}

function renderGallery(view: HostGameView) {
    const ids = ["galleryGrid", "galleryGridPlay"];
    ids.forEach(id => {
        const gallery = document.getElementById(id);
        if (!gallery) return;

        gallery.innerHTML = view.participants.map(p => `
            <div class="vibe-card">
                <div class="vibe-card-content">
                    <div class="row between center" style="width: 100%; margin-bottom: 0.5rem;">
                        <strong>${p.name}</strong>
                        ${p.mood ? `<span style="font-size: 1.5rem;">${p.mood}</span>` : ''}
                    </div>
                    <div style="width: 100%; aspect-ratio: 1; background: #eee; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                        ${p.workImage
                ? `<img src="${p.workImage}" style="width: 100%; height: 100%; object-fit: cover;">`
                : `<span class="hint">No Image</span>`}
                    </div>
                    <div class="hint" style="margin-top: 0.5rem;">
                        ${view.status === "FINISHED" ? (p.undercover ? "Undercover" : "Civilian") : ""}
                    </div>
                </div>
            </div>
        `).join("");
    });
}

async function revealResults() {
    try {
        await fetch("/api/game/reveal", { method: "POST" });
        await fetchHostView();
    } catch (err) {
        alert("Failed to reveal results");
    }
}

async function startVoting() {
    try {
        const response = await fetch("/api/game/vote-start", { method: "POST" });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "Failed to start voting");
        }
        await fetchHostView();
    } catch (err: any) {
        alert(err.message);
    }
}

async function switchTopic() {
    try {
        const response = await fetch("/api/game/switch-topic", { method: "POST" });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "Failed to switch topic");
        }
        await fetchHostView();
    } catch (err: any) {
        alert(err.message);
    }
}

async function startTimer() {
    try {
        const response = await fetch("/api/game/timer", { method: "POST" });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "Failed to start timer");
        }
        await fetchHostView();
    } catch (err: any) {
        alert(err.message);
    }
}

async function kickParticipant(participantId: string) {
    if (!confirm("Are you sure you want to kick this player?")) return;
    try {
        const response = await fetch(`/api/game/participants/${participantId}`, { method: "DELETE" });
        if (!response.ok) {
            throw new Error("Failed to kick player");
        }
        await fetchHostView();
    } catch (err: any) {
        alert(err.message);
    }
}


function updateCountdown(view: HostGameView) {
    if (view.countdownActive) {
        state.countdownTarget = Date.now() + view.secondsToVoting * 1000;
        if (!state.countdownTimer) {
            state.countdownTimer = window.setInterval(tickCountdown, 1000);
        }
        const text = formatSeconds(view.secondsToVoting);
        setCountdownText(text, view.warningTriggered);
    } else {
        clearCountdownTimer();
        const text = view.status === "IN_PROGRESS" ? "Waiting..." : "--:--";
        setCountdownText(text, false);
    }
}

function updateCountdownUI(view: HostGameView) {
    const countdownTextEl = document.getElementById("countdownText");
    const startTimerBtn = document.getElementById("btnStartTimer");
    const startVotingBtn = document.getElementById("btnStartVoting");

    if (view.status === "IN_PROGRESS") {
        if (startVotingBtn) startVotingBtn.hidden = false;

        if (view.countdownActive) {
            if (countdownTextEl) {
                countdownTextEl.style.color = view.secondsToVoting <= 30 ? "var(--danger)" : "var(--primary)";
            }
            if (startTimerBtn) startTimerBtn.hidden = true;
        } else {
            // Timer not active (or finished if we consider backend logic, but backend keeps it active)
            // If backend keeps it active, we fall into the block above.
            // If we are here, it means countdown_ends_at is None.
            if (countdownTextEl) {
                countdownTextEl.textContent = "--:--";
                countdownTextEl.style.color = "var(--text-muted)";
            }
            if (startTimerBtn) startTimerBtn.hidden = false;
        }
    } else {
        if (startVotingBtn) startVotingBtn.hidden = true;
        if (startTimerBtn) startTimerBtn.hidden = true;
    }
}

function tickCountdown() {
    if (!state.countdownTarget) return;
    const remaining = Math.max(0, Math.round((state.countdownTarget - Date.now()) / 1000));
    setCountdownText(formatSeconds(remaining), false);
    if (remaining <= 0) clearCountdownTimer();
}

function clearCountdownTimer() {
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = undefined;
    }
    state.countdownTarget = null;
}

function setCountdownText(text: string, warning: boolean = false) {
    const el = document.getElementById("countdownText");
    if (!el) return;
    el.textContent = text;
    if (warning) {
        el.style.color = "var(--danger)";
    } else {
        el.style.color = "";
    }
}

function formatSeconds(seconds: number) {
    const safe = Math.max(0, seconds);
    const mins = String(Math.floor(safe / 60)).padStart(2, "0");
    const secs = String(safe % 60).padStart(2, "0");
    return `${mins}:${secs}`;
}

function startPolling() {
    if (state.pollHandle) clearInterval(state.pollHandle);
    fetchHostView();
    state.pollHandle = window.setInterval(fetchHostView, 4000);
}

function statusLabel(status: GameStatus) {
    switch (status) {
        case "WAITING_FOR_PLAYERS": return "Waiting for players";
        case "IN_PROGRESS": return "Building";
        case "VOTING": return "Voting";
        case "FINISHED": return "Finished";
        default: return "Unknown";
    }
}

function showError(message: string) {
    const box = document.getElementById("formError") as HTMLElement;
    box.textContent = message;
    box.hidden = false;
}

function hideError() {
    const box = document.getElementById("formError") as HTMLElement;
    box.hidden = true;
    box.textContent = "";
}

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

    const durationMs = 2000; // 2s cycle
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

async function previewPattern(type: 'A' | 'B') {
    console.log(`Triggering global vibration ${type}`);
    try {
        const response = await fetch(`/api/game/vibrate?pattern=${type}`, { method: "POST" });
        if (!response.ok) {
            throw new Error("Failed to trigger vibration");
        }
        // alert(`Triggered Pattern ${type} for all players`);
    } catch (err: any) {
        console.error(err);
        alert("Failed to trigger vibration");
    }
}

// --- Bluetooth Functions ---

async function connectToBleDevice() {
    try {
        const nav = navigator as any;
        if (!nav.bluetooth) {
            alert("Web Bluetooth is not supported in this browser. Please use Chrome or Edge.");
            return;
        }

        console.log("Requesting Bluetooth Device...");
        const device = await nav.bluetooth.requestDevice({
            filters: [
                { name: "X-Block_Band" },
                { name: "X-Block-1" },
                { name: "X-Block-2" },
                { name: "X-Block-3" }
            ],
            optionalServices: [BLE_SERVICE_UUID]
        });

        console.log("Connecting to GATT Server...");
        const server = await device.gatt.connect();

        console.log("Getting Service...");
        const service = await server.getPrimaryService(BLE_SERVICE_UUID);

        console.log("Getting Characteristic...");
        bleCharacteristic = await service.getCharacteristic(BLE_CHAR_UUID);

        bleDevice = device;
        // alert("Connected to LegoSense Band!");

        // Update UI to show connected state
        const btn = document.getElementById("refreshDevicesBtn");
        if (btn) {
            btn.textContent = "Device Connected";
            btn.classList.remove("btn-outline");
            btn.classList.add("btn-success");
        }

        // Update Host Bracelet Status Display
        const statusEl = document.getElementById("connectedDeviceName");
        if (statusEl) {
            statusEl.textContent = `Connected: ${device.name || "Unknown Device"}`;
            statusEl.style.color = "var(--success)";
            if (statusEl.parentElement) {
                statusEl.parentElement.style.borderStyle = "solid";
                statusEl.parentElement.style.borderColor = "var(--success)";
            }
        }

        device.addEventListener('gattserverdisconnected', onDisconnected);

    } catch (error) {
        console.error("Argh! " + error);
        alert("Failed to connect: " + error);
    }
}

function onDisconnected(event: any) {
    const device = event.target;
    console.log(`Device ${device.name} is disconnected.`);
    bleDevice = null;
    bleCharacteristic = null;

    const btn = document.getElementById("refreshDevicesBtn");
    if (btn) {
        btn.textContent = "Connect Bracelet";
        btn.classList.remove("btn-success");
        btn.classList.add("btn-outline");
    }

    // Reset Host Bracelet Status Display
    const statusEl = document.getElementById("connectedDeviceName");
    if (statusEl) {
        statusEl.textContent = "No Host Bracelet Connected";
        statusEl.style.color = "var(--text-muted)";
        if (statusEl.parentElement) {
            statusEl.parentElement.style.borderStyle = "dashed";
            statusEl.parentElement.style.borderColor = "var(--border)";
        }
    }

    alert("Bracelet disconnected.");
}


// ----- LegoSense (Minimal Implementation for now) -----
function startLegoSensePolling() {
    if (legoSenseState.pollHandle) clearInterval(legoSenseState.pollHandle);
    fetchLegoSenseHostView();
    legoSenseState.pollHandle = window.setInterval(fetchLegoSenseHostView, 4000);
}

async function startLegoSense() {
    try {
        const response = await fetch("/api/legosense/start", { method: "POST" });
        if (!response.ok) throw new Error("Failed to start");
        legoSenseState.customGroups = [];
        await fetchLegoSenseHostView();
    } catch (err: any) {
        alert(err.message);
    }
}

async function applyLegoSenseGroups() {
    // Implementation for applying groups
}

async function addLegoSenseGroup(event: Event) {
    event.preventDefault();
    // Implementation for adding groups
}

async function fetchLegoSenseHostView() {
    try {
        const response = await fetch("/api/legosense/host");
        if (!response.ok) return;
        const data = (await response.json()) as LegoSenseHostView;
        legoSenseState.serverGroups = data.groups ?? [];
        legoSenseState.submissions = data.submissions ?? [];
        renderLegoSense(data);
    } catch (err) {
        // console.error(err);
    }
}

function renderLegoSense(data: LegoSenseHostView) {
    const container = document.getElementById("view-game2");
    if (!container) return;

    // Basic Layout
    container.innerHTML = `
        <div class="row between center" style="margin-bottom: 2rem;">
            <div class="stack">
                <h1>LegoSense Gallery</h1>
            </div>
            <div class="row gap-sm">
                <button class="btn btn-primary" onclick="triggerMoodLights()">
                    💡 Light Up Bracelets
                </button>
            </div>
        </div>

        <div class="vibe-grid">
            ${data.participants.map(p => `
                <div class="vibe-card">
                    <div class="vibe-card-content">
                        <div class="row between center" style="width: 100%; margin-bottom: 0.5rem;">
                            <strong>${p.name}</strong>
                            ${p.mood ? `<span style="font-size: 1.5rem;">${p.mood}</span>` : ''}
                        </div>
                        <div style="width: 100%; aspect-ratio: 1; background: #eee; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
                            ${p.workImage
            ? `<img src="${p.workImage}" style="width: 100%; height: 100%; object-fit: cover;">`
            : `<span class="hint">No Image</span>`}
                        </div>
                        <div class="hint" style="margin-top: 0.5rem;">
                            ${p.undercover ? "Undercover" : "Civilian"}
                        </div>
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

// Expose triggerMoodLights
(window as any).triggerMoodLights = async () => {
    if (!state.lastView?.participants) return;

    const MOOD_COLORS: Record<string, string> = {
        "😊": "#FACC15", // Yellow
        "😢": "#3B82F6", // Blue
        "😡": "#EF4444", // Red
        "😎": "#22C55E", // Green
        "😍": "#EC4899", // Pink
        "😲": "#A855F7"  // Purple
    };

    console.log("Triggering mood lights...");

    for (const p of state.lastView.participants) {
        if (p.mood && MOOD_COLORS[p.mood]) {
            try {
                // Send individual LED command
                await fetch("/api/hardware/led", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        color: MOOD_COLORS[p.mood],
                        audience: "PLAYER",
                        playerName: p.name
                    })
                });
            } catch (err) {
                console.error(`Failed to light up for ${p.name}`, err);
            }
        }
    }
    alert("Lights triggered!");
};

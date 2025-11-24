type GameStatus = "WAITING_FOR_PLAYERS" | "IN_PROGRESS" | "VOTING" | "FINISHED";
type LegoSenseStatus = "IDLE" | "COLLECTING" | "GROUPING" | "APPLIED";

interface HostParticipantView {
    participantId: string;
    name: string;
    word?: string | null;
    undercover: boolean;
    hasVoted: boolean;
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
    participants: string[];
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
            // No game, create one
            await autoCreateGame();
        }
    } catch (err) {
        console.error(err);
        // Try creating anyway if fetch failed
        await autoCreateGame();
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

    // Update Phase Indicator
    updatePhaseIndicator(effectiveStatus);

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
    } else {
        if (wrapSection) wrapSection.hidden = false;
    }

    // Update Text Content
    const civA = document.getElementById("civilianWordText");
    const civPlay = document.getElementById("civilianWordTextPlay");
    const undercoverA = document.getElementById("undercoverWordText");
    const undercoverPlay = document.getElementById("undercoverWordTextPlay");

    if (civA) civA.textContent = data.civilianWord;
    if (civPlay) civPlay.textContent = data.civilianWord;
    if (undercoverA) undercoverA.textContent = data.undercoverWord;
    if (undercoverPlay) undercoverPlay.textContent = data.undercoverWord;

    // Update Images
    const civImg = document.getElementById("civilianImage") as HTMLImageElement;
    const civImgPlay = document.getElementById("civilianImagePlay") as HTMLImageElement;
    const underImg = document.getElementById("undercoverImage") as HTMLImageElement;
    const underImgPlay = document.getElementById("undercoverImagePlay") as HTMLImageElement;

    if (civImg && data.civilianImage) civImg.src = `/topic_images/${data.civilianImage}`;
    if (civImgPlay && data.civilianImage) civImgPlay.src = `/topic_images/${data.civilianImage}`;
    if (underImg && data.undercoverImage) underImg.src = `/topic_images/${data.undercoverImage}`;
    if (underImgPlay && data.undercoverImage) underImgPlay.src = `/topic_images/${data.undercoverImage}`;

    const playerCountBadge = document.getElementById("playerCountBadge");
    if (playerCountBadge) playerCountBadge.textContent = `${data.totalParticipants} Players`;

    updateButtons(data);
    updateCountdown(data);
    renderParticipants(data.participants, data.status);
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

function renderParticipants(participants: HostParticipantView[], status: GameStatus) {
    const tbody = document.getElementById("playersTable") as HTMLElement;
    if (!tbody) return;
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
            <td>${player.name}</td>
            <td>${player.word ?? "-"}</td>
            <td>${player.hasVoted ? "<span class='badge badge-success'>Voted</span>" : "-"}</td>
            <td><span class="${roleClass}">${role}</span></td>
        `;
        tbody.appendChild(tr);
    });
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

function setCountdownText(text: string, warning: boolean) {
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
    console.log(`Previewing pattern ${type}`);

    // Send to BLE device if connected
    if (bleCharacteristic) {
        try {
            const encoder = new TextEncoder();
            await bleCharacteristic.writeValue(encoder.encode(type));
            console.log(`Sent command ${type} to bracelet`);
        } catch (err) {
            console.error("Failed to send BLE command:", err);
            alert("Failed to send command to bracelet. Check connection.");
        }
    } else {
        alert(`Previewing Pattern ${type} (No device connected)`);
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
            filters: [{ name: "LegoSense_Band" }],
            optionalServices: [BLE_SERVICE_UUID]
        });

        console.log("Connecting to GATT Server...");
        const server = await device.gatt.connect();

        console.log("Getting Service...");
        const service = await server.getPrimaryService(BLE_SERVICE_UUID);

        console.log("Getting Characteristic...");
        bleCharacteristic = await service.getCharacteristic(BLE_CHAR_UUID);

        bleDevice = device;
        alert("Connected to LegoSense Band!");

        // Update UI to show connected state
        const btn = document.getElementById("refreshDevicesBtn");
        if (btn) {
            btn.textContent = "Device Connected";
            btn.classList.remove("btn-outline");
            btn.classList.add("btn-success");
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
    // Placeholder for LegoSense rendering
}

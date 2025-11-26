type GameStatus = "WAITING_FOR_PLAYERS" | "IN_PROGRESS" | "VOTING" | "FINISHED";
type LegoSenseStatus = "IDLE" | "COLLECTING" | "GROUPING" | "APPLIED";

interface JoinResponse {
    participantId: string;
    participantToken: string;
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
    winningTeam?: "CIVILIANS" | "UNDERCOVER" | null;
    voteSummary: VoteSummaryItem[];
    latestVibrationId?: string | null;
    latestVibrationPattern?: string | null;
    resultsRevealed: boolean;
    undercoverName?: string | null;
}

interface ParticipantListItem {
    participantId: string;
    name: string;
    workImage?: string | null;
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
    lastVibrationId: string | null;
    selectionMade: boolean;
    lastStatus: GameStatus | null;
} = {
    participantId: null,
    token: null,
    name: null,
    countdownTarget: null,
    lastVibrationId: null,
    selectionMade: false,
    lastStatus: null
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

// --- Bluetooth Configuration ---
const BLE_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const BLE_CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleDevice: BluetoothDevice | null = null;
let bleCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

// Polyfill types
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

// --- Random Name Generator ---
const ADJECTIVES = ["Happy", "Lucky", "Sunny", "Clever", "Brave", "Calm", "Swift", "Cool", "Neon", "Cyber"];
const NOUNS = ["Lion", "Tiger", "Bear", "Eagle", "Panda", "Wolf", "Fox", "Hawk", "Bot", "Pilot"];

function generateRandomName() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}${noun}${num}`;
}


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
    } else if (!resumeSession()) {
        // Pre-fill random name
        const nameInput = document.getElementById("playerName") as HTMLInputElement;
        if (nameInput) nameInput.value = generateRandomName();
    }

    // Bluetooth Listener
    const connectBtn = document.getElementById("playerConnectBtn");
    if (connectBtn) connectBtn.addEventListener("click", connectToBleDevice);
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
    localStorage.setItem("participantToken", session.token);
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
        // If the error is "No active game", it means the host hasn't started one.
        if (err.message.includes("No active game")) {
            showJoinError("No active game found. Please ask the Host to open the game.");
        } else {
            showJoinError(err.message);
        }
        setJoinButtonDisabled(false);
    }
}

function resumeSession() {
    const saved = loadSession();
    if (saved) {
        activateSession(saved);
        return true;
    }
    return false;
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
        const response = await fetch(`/api/game/participant?token=${state.token}`);
        if (response.status === 404 || response.status === 400) {
            // Game invalid or token invalid
            alert("The current round is no longer valid. Please join again.");
            resetSession();
            return;
        }
        if (!response.ok) {
            // Other errors, maybe transient
            return;
        }
        const data = (await response.json()) as ParticipantView;
        state.name = data.name;
        (window as any).lastParticipantView = data;
        renderParticipantView(data);
    } catch (err) {
        console.error(err);
    }
}

function renderParticipantView(view: ParticipantView) {
    const statusChanged = view.status !== state.lastStatus;
    if (statusChanged && (view.status === "WAITING_FOR_PLAYERS" || view.status === "IN_PROGRESS")) {
        // New round or returned to lobby, allow a fresh selection
        resetCardSelection();
    }

    (document.getElementById("panelStatus") as HTMLElement).textContent = statusLabel(view.status);
    (document.getElementById("panelName") as HTMLElement).textContent = view.name;

    // Phase Switching
    const waitingPhase = document.getElementById("phase-waiting");
    const gamePhase = document.getElementById("phase-game");
    const votingPhase = document.getElementById("phase-voting");
    const resultPhase = document.getElementById("phase-result");

    if (waitingPhase) waitingPhase.hidden = true;
    if (gamePhase) gamePhase.hidden = true;
    if (votingPhase) votingPhase.hidden = true;
    if (resultPhase) resultPhase.hidden = true;

    if (view.status === "WAITING_FOR_PLAYERS") {
        if (waitingPhase) waitingPhase.hidden = false;
    } else if (view.status === "IN_PROGRESS") {
        if (gamePhase) gamePhase.hidden = false;

        // Upload Section (Only show if not uploaded yet? Or allow re-upload?)
        // For simplicity, let's add an upload button in the game phase
        let uploadContainer = document.getElementById("uploadContainer");
        if (!uploadContainer && gamePhase) {
            const container = document.createElement("div");
            container.id = "uploadContainer";
            container.className = "card stack";
            container.style.marginTop = "1rem";
            container.innerHTML = `
                <h3>Upload Your Work</h3>
                <input type="file" id="workUpload" accept="image/*" style="display: none">
                <button class="btn btn-outline" onclick="document.getElementById('workUpload').click()">
                    📷 Take Photo / Upload
                </button>
                <div id="uploadPreview" style="margin-top: 0.5rem;"></div>
            `;
            gamePhase.appendChild(container);

            const input = container.querySelector("input");
            input?.addEventListener("change", (window as any).handleImageUpload);
        }
    } else if (view.status === "VOTING") {
        // Voting Phase
        if (votingPhase) votingPhase.hidden = false;
        renderVoteSection(view);
        renderVoteResults(view.voteSummary);

        // Allow upload in voting phase too if not uploaded
        let uploadContainer = document.getElementById("uploadContainerVoting");
        if (!uploadContainer && votingPhase) {
            console.log("Creating upload container for voting phase");
            const container = document.createElement("div");
            container.id = "uploadContainerVoting";
            container.className = "card stack";
            container.style.marginBottom = "1rem"; // Add spacing
            container.innerHTML = `
                <h3>Your Work</h3>
                <input type="file" id="workUploadVoting" accept="image/*" style="display: none">
                <button class="btn btn-outline" onclick="document.getElementById('workUploadVoting').click()">
                    📷 Take Photo / Upload
                </button>
                <div id="uploadPreviewVoting" style="margin-top: 0.5rem;"></div>
            `;
            // Insert at the top
            votingPhase.insertBefore(container, votingPhase.firstChild);

            const input = container.querySelector("input");
            input?.addEventListener("change", (window as any).handleImageUpload);
        }
    } else if (view.status === "FINISHED") {
        // Result Phase
        if (resultPhase) resultPhase.hidden = false;
        renderGameResult(view);


    }

    updateWords(view);
    updateParticipantCountdown(view);
    // renderPlayers(view.participants, view.participantId);
    // renderVoteSection(view); // This is now handled inside the status blocks
    // renderVoteResults(view.voteSummary); // This is now handled inside the status blocks
    // renderGameResult(view); // This is now handled inside the status blocks

    // Check for vibration trigger
    if (view.latestVibrationId && view.latestVibrationId !== state.lastVibrationId) {
        state.lastVibrationId = view.latestVibrationId;
        if (view.latestVibrationPattern) {
            triggerBleVibration(view.latestVibrationPattern);
        }
    }

    state.lastStatus = view.status;
}

async function triggerBleVibration(pattern: string) {
    if (!bleCharacteristic) return;
    try {
        const encoder = new TextEncoder();
        await bleCharacteristic.writeValue(encoder.encode(pattern));
        console.log(`Triggered vibration ${pattern} on bracelet`);
    } catch (err) {
        console.error("Failed to trigger vibration on bracelet:", err);
    }
}


function renderGameResult(view: ParticipantView) {
    const container = document.getElementById("resultContent");
    if (!container) return;

    if (!view.resultsRevealed) {
        container.innerHTML = `
            <div class="stack center">
                <h2>Game Over</h2>
                <p>Waiting for host to reveal results...</p>
                <div class="animate-pulse" style="width: 40px; height: 40px; background: var(--surface-hover); border-radius: 50%;"></div>
            </div>
        `;
        return;
    }

    const isWinner = (view.winningTeam === "CIVILIANS" && view.civilianWord === view.word) ||
        (view.winningTeam === "UNDERCOVER" && view.undercoverWord === view.word);

    container.innerHTML = `
        <div class="stack center">
            <div class="result-icon">${isWinner ? "👑" : "💀"}</div>
            <h2>${isWinner ? "Victory!" : "Defeat"}</h2>
            <p>The Undercover was: <strong>${view.undercoverName || "Unknown"}</strong></p>
            <p class="hint">Civilian Word: ${view.civilianWord}</p>
            <p class="hint">Undercover Word: ${view.undercoverWord}</p>
            
            <div class="card stack" style="width: 100%; margin-top: 1rem;">
                <h3>How do you feel?</h3>
                <div class="row center gap-sm">
                    <input type="text" id="moodInput" placeholder="Enter one word (e.g. Excited)" class="input" style="flex: 1;">
                    <button class="btn btn-primary" onclick="submitMood()">Submit</button>
                </div>
            </div>
        </div>
    `;

    // Expose submitMood
    (window as any).submitMood = async () => {
        const input = document.getElementById("moodInput") as HTMLInputElement;
        if (!input || !input.value.trim()) return;
        try {
            await fetch("/api/game/submit-mood", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ participantToken: state.token, mood: input.value.trim() })
            });
            alert("Mood submitted!");
            input.disabled = true;
        } catch (err) {
            alert("Failed to submit mood");
        }
    };
}

function renderVoteSection(view: ParticipantView) {
    const box = document.getElementById("voteSection") as HTMLElement;
    if (!box) return;

    if (view.hasVoted) {
        box.innerHTML = `<div class="hint">Waiting for others to vote...</div>`;
        return;
    }

    if (!view.canVote) {
        box.innerHTML = `<div class="hint">Voting is not open yet</div>`;
        return;
    }

    box.innerHTML = `
        <div class="card stack center" style="background: var(--surface); border: 1px solid var(--border); padding: 1.5rem;">
            <h3 style="margin-bottom: 1rem; color: var(--text-main);">🗳️ Vote for the Undercover</h3>
            <p class="hint" style="margin-bottom: 1.5rem;">Tap on the player you suspect!</p>
            <div class="vote-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 1rem; width: 100%;">
                ${view.participants
            .filter(p => p.participantId !== view.participantId)
            .map(p => `
                    <div class="vote-card" onclick="castVote('${p.participantId}')" style="cursor: pointer; transition: transform 0.2s;">
                        <div class="vote-img-container" style="width: 80px; height: 80px; margin: 0 auto 0.5rem; border-radius: 50%; overflow: hidden; border: 3px solid var(--primary); background: var(--surface-hover);">
                            ${p.workImage
                    ? `<img src="${p.workImage}" class="vote-img" style="width: 100%; height: 100%; object-fit: cover;">`
                    : `<div class="vote-img-placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 2rem; color: var(--text-muted);">?</div>`}
                        </div>
                        <div class="vote-name" style="font-weight: 600; color: var(--text-main);">${p.name}</div>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
    // Expose castVote globally for onclick
    (window as any).castVote = async (targetParticipantId: string) => {
        try {
            const response = await fetch(`/api/game/votes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ voterToken: state.token, targetParticipantId: targetParticipantId })
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.detail || "Failed to submit vote");
            }
            await fetchParticipantView();
        } catch (err: any) {
            alert(err.message);
        }
    };
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

    const timerEl = el; // Renaming for clarity based on the new snippet's variable name
    if (view.countdownActive) {
        state.countdownTarget = Date.now() + view.secondsToVoting * 1000; // Keep this for consistency if state.countdownTarget is used elsewhere
        if (!state.countdownTimer) { // Keep this if a timer is still needed for ticking down
            state.countdownTimer = window.setInterval(() => tickParticipantCountdown(el), 1000);
        }
        const mins = Math.floor(view.secondsToVoting / 60);
        const secs = view.secondsToVoting % 60;
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
        if (view.secondsToVoting <= 30) {
            timerEl.style.color = "var(--danger)";
            timerEl.classList.add("pulse");
        } else {
            timerEl.style.color = "";
            timerEl.classList.remove("pulse");
        }
    } else {
        clearParticipantCountdown(); // Clear existing timer if countdown is no longer active
        timerEl.textContent = "Waiting for host...";
        timerEl.style.color = "var(--text-muted)";
        timerEl.classList.remove("pulse");
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

async function handleImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (!state.token) {
            alert("Please join the game again before uploading.");
            return;
        }
        try {
            const base64 = await compressImage(file);
            if (!base64) {
                throw new Error("Image encoding failed");
            }

            // Show preview in all possible containers
            const ids = ["uploadPreview", "uploadPreviewVoting", "uploadPreviewResult"];
            ids.forEach(id => {
                const preview = document.getElementById(id);
                if (preview) {
                    preview.innerHTML = `<img src="${base64}" style="width: 100%; border-radius: 8px;">`;
                }
            });

            console.debug("Uploading work", { token: state.token, imageLength: base64.length });

            // Upload
            const response = await fetch("/api/game/upload-work", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ participantToken: state.token, image: base64 })
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                const detail = err?.detail;
                let message = "Upload failed";
                if (typeof detail === "string") {
                    message = detail;
                } else if (Array.isArray(detail)) {
                    message = detail.map((d: any) => {
                        const loc = Array.isArray(d?.loc) ? d.loc.join(".") : "";
                        const msg = d?.msg || JSON.stringify(d);
                        return loc ? `${loc}: ${msg}` : msg;
                    }).join("; ");
                } else if (detail) {
                    message = JSON.stringify(detail);
                } else if (response.status) {
                    message = `Upload failed (${response.status})`;
                }
                throw new Error(message);
            }
            alert("Upload successful!");
        } catch (err) {
            console.error("Upload failed", err);
            alert((err as any)?.message || "Upload failed");
        }
    }
}

// Expose handleImageUpload to window
(window as any).handleImageUpload = handleImageUpload;

// Reveal Card Logic
(window as any).revealCard = (pattern: 'A' | 'B') => {
    const cardId = pattern === 'A' ? 'flipCardA' : 'flipCardB';
    const card = document.getElementById(cardId);

    if (!card) return;

    // Only allow the first selection to flip; afterwards, just warn.
    if (state.selectionMade) {
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 500);
        showToast("You already picked a card.", "warning");
        return;
    }

    card.classList.add('flipped');
    state.selectionMade = true;
};

function resetCardSelection() {
    state.selectionMade = false;
    const cards = ["flipCardA", "flipCardB"];
    cards.forEach(id => {
        const el = document.getElementById(id);
        el?.classList.remove("flipped", "shake");
    });
}

// Downscale large images before uploading to avoid oversized payloads
async function compressImage(file: File, maxSize: number = 1024, quality: number = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const width = Math.max(1, Math.round(img.width * scale));
            const height = Math.max(1, Math.round(img.height * scale));
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Canvas not supported"));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(objectUrl);
            try {
                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                resolve(dataUrl);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = (err) => {
            URL.revokeObjectURL(objectUrl);
            reject(err);
        };
        img.src = objectUrl;
    });
}

function showToast(message: string, type: "success" | "error" | "warning" | "info" = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.left = "50%";
        container.style.transform = "translateX(-50%)";
        container.style.zIndex = "1000";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "10px";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `badge badge-${type === "error" ? "danger" : type === "success" ? "success" : "neutral"}`;
    toast.style.padding = "1rem 2rem";
    toast.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
    toast.style.fontSize = "1rem";
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function resetSession() {
    state.participantId = null;
    state.token = null;
    state.name = null;
    state.selectionMade = false;
    state.lastStatus = null;
    localStorage.removeItem("participantToken");
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

// --- Bluetooth Functions ---

async function connectToBleDevice() {
    try {
        const nav = navigator as any;
        if (!nav.bluetooth) {
            console.warn("navigator.bluetooth is undefined. This usually means you are not using HTTPS or Localhost.");
            alert("Web Bluetooth API is missing. If you are using Chrome on PC, please ensure you are accessing via 'localhost' or HTTPS, or have enabled the 'Insecure origins treated as secure' flag for this IP.");
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
        // alert("Connected to LegoSense Band!");

        updateBleUI(true, device.name);

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

    updateBleUI(false);
    alert("Bracelet disconnected.");
}

function updateBleUI(connected: boolean, deviceName?: string) {
    const btn = document.getElementById("playerConnectBtn");
    const status = document.getElementById("playerBraceletStatus");

    if (connected) {
        if (btn) {
            btn.textContent = "Bracelet Connected";
            btn.classList.remove("btn-outline");
            btn.classList.add("btn-success");
        }
        if (status) {
            status.textContent = `Connected to ${deviceName || "Device"}`;
            status.style.color = "var(--success)";
        }
    } else {
        if (btn) {
            btn.textContent = "Connect Bracelet";
            btn.classList.remove("btn-success");
            btn.classList.add("btn-outline");
        }
        if (status) {
            status.textContent = "No bracelet connected";
            status.style.color = "";
        }
    }
}

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
    status: GameStatus;
    countdownActive: boolean;
    secondsToVoting: number;
    totalParticipants: number;
    participants: HostParticipantView[];
    undercoverParticipantId?: string | null;
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

const state = {
    pollHandle: 0 as number | undefined,
    countdownTimer: 0 as number | undefined,
    countdownTarget: 0 as number | null
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

document.addEventListener("DOMContentLoaded", () => {
    (document.getElementById("createForm") as HTMLFormElement).addEventListener("submit", handleCreate);
    (document.getElementById("startBtn") as HTMLButtonElement).addEventListener("click", startGame);
    (document.getElementById("finishBtn") as HTMLButtonElement).addEventListener("click", finishVoting);
    (document.getElementById("startSenseBtn") as HTMLButtonElement).addEventListener("click", startLegoSense);
    (document.getElementById("applyGroupBtn") as HTMLButtonElement).addEventListener("click", applyLegoSenseGroups);
    (document.getElementById("addGroupForm") as HTMLFormElement).addEventListener("submit", addLegoSenseGroup);
    startLegoSensePolling();
});

async function handleCreate(event: Event) {
    event.preventDefault();
    hideError();
    const payload = {
        civilianWord: (document.getElementById("civilianWord") as HTMLInputElement).value.trim(),
        undercoverWord: (document.getElementById("undercoverWord") as HTMLInputElement).value.trim()
    };
    const submitBtn = document.querySelector<HTMLButtonElement>("#createForm button[type='submit']");
    try {
        const response = await fetch("/api/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || error.message || "创建失败");
        }
        const data = (await response.json()) as HostGameView;
        (document.getElementById("gamePanel") as HTMLElement).hidden = false;
        if (submitBtn) submitBtn.disabled = true;
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
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "无法获取游戏信息");
        }
        const data = (await response.json()) as HostGameView;
        renderHostView(data);
    } catch (err) {
        console.error(err);
    }
}

function renderHostView(data: HostGameView) {
    (document.getElementById("statusBadge") as HTMLElement).textContent = statusLabel(data.status);
    (document.getElementById("civilianWordText") as HTMLElement).textContent = data.civilianWord;
    (document.getElementById("undercoverWordText") as HTMLElement).textContent = data.undercoverWord;
    (document.getElementById("playerCount") as HTMLElement).textContent = String(data.totalParticipants);
    updateButtons(data);
    updateCountdown(data);
    renderParticipants(data.participants, data.status);
    renderVotes(data.voteSummary);
}

function renderParticipants(participants: HostParticipantView[], status: GameStatus) {
    const tbody = document.getElementById("playersTable") as HTMLElement;
    tbody.innerHTML = "";
    if (!participants?.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty">暂无玩家</td></tr>`;
        return;
    }
    participants.forEach((player) => {
        const tr = document.createElement("tr");
        const role = status === "FINISHED" ? (player.undercover ? "卧底" : "平民") : player.word ? (player.undercover ? "卧底" : "平民") : "-";
        tr.innerHTML = `
            <td>${player.name}</td>
            <td>${player.word ?? "-"}</td>
            <td>${player.hasVoted ? "已投票" : "-"}</td>
            <td>${role}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderVotes(summary: VoteSummaryItem[]) {
    const tbody = document.getElementById("voteTable") as HTMLElement;
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

async function startGame() {
    try {
        const response = await fetch(`/api/game/start`, { method: "POST" });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "操作失败");
        }
        await fetchHostView();
    } catch (err: any) {
        alert(err.message);
    }
}

function updateButtons(view: HostGameView) {
    const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
    startBtn.disabled = !(view.status === "WAITING_FOR_PLAYERS" && view.totalParticipants >= 3);
    const finishBtn = document.getElementById("finishBtn") as HTMLButtonElement;
    finishBtn.disabled = view.status !== "VOTING";
}

async function finishVoting() {
    try {
        const response = await fetch("/api/game/finish", { method: "POST" });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "操作失败");
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
        setCountdownText(formatSeconds(view.secondsToVoting));
    } else {
        clearCountdownTimer();
        const text = view.status === "IN_PROGRESS" ? "等待自动进入投票" : "--";
        setCountdownText(text);
    }
}

function tickCountdown() {
    if (!state.countdownTarget) return;
    const remaining = Math.max(0, Math.round((state.countdownTarget - Date.now()) / 1000));
    setCountdownText(formatSeconds(remaining));
    if (remaining <= 0) clearCountdownTimer();
}

function clearCountdownTimer() {
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = undefined;
    }
    state.countdownTarget = null;
}

function setCountdownText(text: string) {
    const el = document.getElementById("countdownText");
    if (el) el.textContent = text;
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
        case "WAITING_FOR_PLAYERS":
            return "等待玩家";
        case "IN_PROGRESS":
            return "描述阶段";
        case "VOTING":
            return "投票中";
        case "FINISHED":
            return "已结束";
        default:
            return "未知";
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

// ----- LegoSense -----
function startLegoSensePolling() {
    if (legoSenseState.pollHandle) clearInterval(legoSenseState.pollHandle);
    fetchLegoSenseHostView();
    legoSenseState.pollHandle = window.setInterval(fetchLegoSenseHostView, 4000);
}

async function startLegoSense() {
    try {
        const response = await fetch("/api/legosense/start", { method: "POST" });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "启动失败");
        }
        legoSenseState.customGroups = [];
        await fetchLegoSenseHostView();
    } catch (err: any) {
        alert(err.message);
    }
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
        console.error(err);
    }
}

function renderLegoSense(view: LegoSenseHostView) {
    const badge = document.getElementById("legoSenseStatus") as HTMLElement;
    badge.textContent = legoSenseStatusLabel(view.status);
    badge.dataset.status = view.status;
    renderGroupPills();
    renderLegoSenseTable(view.submissions);
}

function renderLegoSenseTable(submissions: LegoSenseSubmissionView[]) {
    const tbody = document.getElementById("legoSenseTable") as HTMLElement;
    tbody.innerHTML = "";
    if (!submissions?.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="empty">暂无提交</td></tr>`;
        return;
    }
    submissions.forEach((sub) => {
        const tr = document.createElement("tr");
        tr.dataset.token = sub.participantToken;
        tr.innerHTML = `<td>${sub.name}</td><td>${sub.emotion}</td><td></td>`;
        const select = buildGroupSelect(sub.groupId ?? "");
        tr.children[2].appendChild(select);
        tbody.appendChild(tr);
    });
}

function buildGroupSelect(selectedId: string) {
    const select = document.createElement("select");
    select.innerHTML = `<option value="">未分组</option>`;
    combinedGroups().forEach((group) => {
        const option = document.createElement("option");
        option.value = group.id;
        option.textContent = `${group.name} (${group.color})`;
        if (group.id === selectedId) option.selected = true;
        select.appendChild(option);
    });
    return select;
}

function addLegoSenseGroup(event: Event) {
    event.preventDefault();
    const name = (document.getElementById("groupName") as HTMLInputElement).value.trim();
    const color = (document.getElementById("groupColor") as HTMLInputElement).value || "#2b8cff";
    if (!name) return;
    legoSenseState.customGroups.push({ id: `local-${Date.now()}`, name, color, memberTokens: [] });
    (document.getElementById("groupName") as HTMLInputElement).value = "";
    renderGroupPills();
    renderLegoSenseTable(legoSenseState.submissions);
}

function combinedGroups(): GroupDraft[] {
    return [...legoSenseState.serverGroups, ...legoSenseState.customGroups];
}

async function applyLegoSenseGroups() {
    const rows = document.querySelectorAll<HTMLTableRowElement>("#legoSenseTable tr[data-token]");
    const groupDefs = new Map<string, GroupDraft>();
    const meta = new Map(combinedGroups().map((g) => [g.id, g]));
    rows.forEach((row) => {
        const token = row.dataset.token!;
        const select = row.querySelector("select");
        const groupId = select?.value;
        if (!groupId || !meta.has(groupId)) return;
        const g = meta.get(groupId)!;
        if (!groupDefs.has(groupId)) {
            groupDefs.set(groupId, { id: g.id, name: g.name, color: g.color, memberTokens: [] });
        }
        groupDefs.get(groupId)!.memberTokens.push(token);
    });
    const payload = { groups: Array.from(groupDefs.values()) };
    try {
        const response = await fetch("/api/legosense/groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || "应用失败");
        }
        legoSenseState.customGroups = [];
        const data = (await response.json()) as LegoSenseHostView;
        legoSenseState.serverGroups = data.groups ?? [];
        legoSenseState.submissions = data.submissions ?? [];
        renderLegoSense(data);
    } catch (err: any) {
        alert(err.message);
    }
}

function renderGroupPills() {
    const container = document.getElementById("groupPills") as HTMLElement;
    container.innerHTML = "";
    const groups = combinedGroups();
    if (!groups.length) {
        container.innerHTML = `<span class="hint">暂无分组，请先添加。</span>`;
        return;
    }
    groups.forEach((group) => {
        const pill = document.createElement("div");
        pill.className = "pill";
        pill.style.borderColor = group.color;
        pill.innerHTML = `<span class="swatch" style="background:${group.color}"></span>${group.name}`;
        if (group.id.startsWith("local-")) {
            pill.classList.add("pill-draft");
            pill.title = "尚未下发";
        }
        container.appendChild(pill);
    });
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

const STORAGE_KEY = "undercover-participant";
const state = {
    participantId: null,
    token: null,
    name: null,
    pollHandle: null,
    countdownTimer: null,
    countdownTarget: null
};

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("joinForm").addEventListener("submit", handleJoin);
    resumeSession();
});

function loadSession() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveSession(session) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSessionStorage() {
    sessionStorage.removeItem(STORAGE_KEY);
}

async function handleJoin(event) {
    event.preventDefault();
    hideJoinError();
    const name = document.getElementById("playerName").value.trim();
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
            throw new Error(error.message || "加入失败");
        }
        const data = await response.json();
        const session = {
            participantId: data.participantId,
            token: data.participantToken,
            name
        };
        saveSession(session);
        activateSession(session);
    } catch (err) {
        showJoinError(err.message);
    }
}

function resumeSession() {
    const saved = loadSession();
    if (saved) {
        activateSession(saved);
    }
}

function activateSession(session) {
    state.participantId = session.participantId;
    state.token = session.token;
    state.name = session.name;
    document.getElementById("panelName").textContent = session.name;
    setJoinButtonDisabled(true);
    document.getElementById("joinCard").hidden = true;
    document.getElementById("playerPanel").hidden = false;
    startPolling();
}

function startPolling() {
    if (state.pollHandle) {
        clearInterval(state.pollHandle);
    }
    fetchParticipantView();
    state.pollHandle = setInterval(fetchParticipantView, 4000);
}

async function fetchParticipantView() {
    if (!state.token) {
        return;
    }
    try {
        const response = await fetch(`/api/participants/${state.token}`);
        if (!response.ok) {
            throw new Error("获取玩家信息失败");
        }
        const data = await response.json();
        state.name = data.name;
        renderParticipant(data);
    } catch (err) {
        console.error(err);
        alert("当前游戏已失效或被重置，请重新加入。");
        resetSession();
    }
}

function renderParticipant(view) {
    document.getElementById("panelStatus").textContent = statusLabel(view.status);
    document.getElementById("panelName").textContent = view.name;
    updateWords(view);
    updateParticipantCountdown(view);
    renderPlayers(view.participants, view.participantId);
    renderVoteSection(view);
    renderVoteResults(view.voteSummary);
}

function renderPlayers(players, selfId) {
    const list = document.getElementById("playersList");
    list.innerHTML = "";
    if (!players || players.length === 0) {
        list.innerHTML = "<li>暂无玩家</li>";
        return;
    }
    players.forEach(player => {
        const li = document.createElement("li");
        li.textContent = player.name + (player.participantId === selfId ? "（我）" : "");
        list.appendChild(li);
    });
}

function renderVoteSection(view) {
    const box = document.getElementById("voteSection");
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
        .filter(player => player.participantId !== view.participantId)
        .map(player => `<option value="${player.participantId}">${player.name}</option>`)
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
    document.getElementById("voteBtn").addEventListener("click", submitVote);
}

function renderVoteResults(summary) {
    const tbody = document.getElementById("participantVoteTable");
    if (!tbody) {
        return;
    }
    tbody.innerHTML = "";
    if (!summary || summary.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="empty">暂无投票</td></tr>`;
        return;
    }
    summary.forEach(item => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${item.name}</td><td>${item.votes}</td>`;
        tbody.appendChild(tr);
    });
}

function updateWords(view) {
    const wordOne = document.getElementById("wordOneText");
    const wordTwo = document.getElementById("wordTwoText");
    if (wordOne) {
        wordOne.textContent = view.civilianWord ?? "-";
    }
    if (wordTwo) {
        wordTwo.textContent = view.undercoverWord ?? "-";
    }
}

function updateParticipantCountdown(view) {
    const el = document.getElementById("participantCountdown");
    if (!el) {
        return;
    }
    if (view.countdownActive) {
        state.countdownTarget = Date.now() + view.secondsToVoting * 1000;
        if (!state.countdownTimer) {
            state.countdownTimer = setInterval(() => tickParticipantCountdown(el), 1000);
        }
        el.textContent = formatSeconds(view.secondsToVoting);
    } else {
        clearParticipantCountdown();
        el.textContent = view.status === "IN_PROGRESS" ? "等待自动进入投票" : "--";
    }
}

function tickParticipantCountdown(el) {
    if (!state.countdownTarget) {
        return;
    }
    const remaining = Math.max(0, Math.round((state.countdownTarget - Date.now()) / 1000));
    el.textContent = formatSeconds(remaining);
    if (remaining <= 0) {
        clearParticipantCountdown();
    }
}

function clearParticipantCountdown() {
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }
    state.countdownTarget = null;
}

async function submitVote() {
    const target = document.getElementById("voteTarget").value;
    if (!target) {
        return;
    }
    try {
        const response = await fetch(`/api/game/votes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ voterToken: state.token, targetParticipantId: target })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || "投票失败");
        }
        await fetchParticipantView();
    } catch (err) {
        alert(err.message);
    }
}

function resetSession() {
    state.participantId = null;
    state.token = null;
    state.name = null;
    if (state.pollHandle) {
        clearInterval(state.pollHandle);
        state.pollHandle = null;
    }
    clearParticipantCountdown();
    clearSessionStorage();
    document.getElementById("playerPanel").hidden = true;
    document.getElementById("joinCard").hidden = false;
    setJoinButtonDisabled(false);
}

function showJoinError(message) {
    const box = document.getElementById("joinError");
    box.textContent = message;
    box.hidden = false;
}

function hideJoinError() {
    const box = document.getElementById("joinError");
    box.hidden = true;
    box.textContent = "";
}

function statusLabel(status) {
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

function formatSeconds(seconds) {
    const safe = Math.max(0, seconds);
    const mins = String(Math.floor(safe / 60)).padStart(2, "0");
    const secs = String(safe % 60).padStart(2, "0");
    return `${mins}:${secs}`;
}

function setJoinButtonDisabled(disabled) {
    const button = document.querySelector("#joinForm button[type='submit']");
    if (button) {
        button.disabled = disabled;
    }
}

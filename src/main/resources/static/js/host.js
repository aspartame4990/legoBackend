const state = {
    pollHandle: null,
    countdownTimer: null,
    countdownTarget: null
};

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("createForm").addEventListener("submit", handleCreate);
    document.getElementById("startBtn").addEventListener("click", startGame);
});

async function handleCreate(event) {
    event.preventDefault();
    hideError();
    const payload = {
        civilianWord: document.getElementById("civilianWord").value.trim(),
        undercoverWord: document.getElementById("undercoverWord").value.trim()
    };
    const submitBtn = document.querySelector("#createForm button[type='submit']");
    try {
        const response = await fetch("/api/game", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || "创建失败");
        }
        const data = await response.json();
        document.getElementById("gamePanel").hidden = false;
        if (submitBtn) {
            submitBtn.disabled = true;
        }
        renderHostView(data);
        startPolling();
    } catch (err) {
        showError(err.message);
    }
}

async function fetchHostView() {
    try {
        const response = await fetch(`/api/game/host`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || "无法获取游戏信息");
        }
        const data = await response.json();
        renderHostView(data);
    } catch (err) {
        console.error(err);
    }
}

function renderHostView(data) {
    document.getElementById("statusBadge").textContent = statusLabel(data.status);
    document.getElementById("civilianWordText").textContent = data.civilianWord;
    document.getElementById("undercoverWordText").textContent = data.undercoverWord;
    document.getElementById("playerCount").textContent = data.totalParticipants;
    updateButtons(data);
    updateCountdown(data);
    renderParticipants(data.participants, data.status);
    renderVotes(data.voteSummary);
}

function renderParticipants(participants, status) {
    const tbody = document.getElementById("playersTable");
    tbody.innerHTML = "";
    if (!participants || participants.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty">暂无玩家</td></tr>`;
        return;
    }
    participants.forEach(player => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${player.name}</td>
            <td>${player.word ?? "-"}</td>
            <td>${player.hasVoted ? "已投票" : "-"}</td>
            <td>${status === "FINISHED" ? (player.undercover ? "卧底" : "平民") : (player.word ? (player.undercover ? "卧底" : "平民") : "-")}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderVotes(summary) {
    const tbody = document.getElementById("voteTable");
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

async function startGame() {
    try {
        const response = await fetch(`/api/game/start`, {
            method: "POST"
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || "操作失败");
        }
        await fetchHostView();
    } catch (err) {
        alert(err.message);
    }
}

function updateButtons(view) {
    const startBtn = document.getElementById("startBtn");
    startBtn.disabled = !(view.status === "WAITING_FOR_PLAYERS" && view.totalParticipants >= 3);
}

function updateCountdown(view) {
    if (view.countdownActive) {
        state.countdownTarget = Date.now() + view.secondsToVoting * 1000;
        if (!state.countdownTimer) {
            state.countdownTimer = setInterval(tickCountdown, 1000);
        }
        setCountdownText(formatSeconds(view.secondsToVoting));
    } else {
        clearCountdownTimer();
        const text = view.status === "IN_PROGRESS" ? "等待自动进入投票" : "--";
        setCountdownText(text);
    }
}

function tickCountdown() {
    if (!state.countdownTarget) {
        return;
    }
    const remaining = Math.max(0, Math.round((state.countdownTarget - Date.now()) / 1000));
    setCountdownText(formatSeconds(remaining));
    if (remaining <= 0) {
        clearCountdownTimer();
    }
}

function clearCountdownTimer() {
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }
    state.countdownTarget = null;
}

function setCountdownText(text) {
    const el = document.getElementById("countdownText");
    if (el) {
        el.textContent = text;
    }
}

function formatSeconds(seconds) {
    const safe = Math.max(0, seconds);
    const mins = String(Math.floor(safe / 60)).padStart(2, "0");
    const secs = String(safe % 60).padStart(2, "0");
    return `${mins}:${secs}`;
}

function startPolling() {
    if (state.pollHandle) {
        clearInterval(state.pollHandle);
    }
    fetchHostView();
    state.pollHandle = setInterval(fetchHostView, 4000);
}

function statusLabel(status) {
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

function showError(message) {
    const box = document.getElementById("formError");
    box.textContent = message;
    box.hidden = false;
}

function hideError() {
    const box = document.getElementById("formError");
    box.hidden = true;
    box.textContent = "";
}

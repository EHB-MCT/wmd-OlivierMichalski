let currentSessionId = null;
let lastKeyTime = null;
let events = [];
let buffer = [];
let currentTextId = null;

function generateUid() {
  return `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOrCreateUid() {
  let uid = localStorage.getItem("uid");
  if (!uid) {
    uid = generateUid();
    localStorage.setItem("uid", uid);
  }
  return uid;
}

function setUidText(uid) {
  const el = document.getElementById("uid");
  if (el) el.textContent = uid;
}

function ensureAuthFlag() {
  if (localStorage.getItem("loggedIn") === null) {
    localStorage.setItem("loggedIn", "0");
  }
}

function isLoggedIn() {
  return localStorage.getItem("loggedIn") === "1";
}

function syncAuthUi() {
  const logged = isLoggedIn();

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = logged ? "inline-block" : "none";

  const profileCard = document.getElementById("profileCard");
  if (profileCard) profileCard.style.display = logged ? "block" : "none";

  const profileAnon = document.getElementById("profileAnon");
  if (profileAnon) profileAnon.style.display = logged ? "none" : "block";

  const profileLink = document.getElementById("profileLink");
  if (profileLink) profileLink.style.display = logged ? "inline-block" : "none";
}

async function checkHealth() {
  const res = await fetch("/api/health");
  const data = await res.json();
  document.getElementById("status").textContent = data.ok ? "ok" : "not ok";
}

async function identify(uid) {
  await fetch("/api/user/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid })
  });
}

async function loadNextText(uid) {
  const res = await fetch(`/api/text/next?uid=${encodeURIComponent(uid)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load text");

  currentTextId = data.textId;
  document.getElementById("currentText").textContent = data.text;
}

let uid = getOrCreateUid();
setUidText(uid);

function ensureAuthFlag() {
  if (localStorage.getItem("loggedIn") === null) {
    localStorage.setItem("loggedIn", "0");
  }
}

function isLoggedIn() {
  return localStorage.getItem("loggedIn") === "1";
}

function syncAuthUi() {
  const logged = isLoggedIn();

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = logged ? "inline-block" : "none";

  const profileCard = document.getElementById("profileCard");
  if (profileCard) profileCard.style.display = logged ? "block" : "none";

  const profileAnon = document.getElementById("profileAnon");
  if (profileAnon) profileAnon.style.display = logged ? "none" : "block";

  const profileLink = document.getElementById("profileLink");
  if (profileLink) profileLink.style.display = logged ? "inline-block" : "none";
}

function setAuthStatus(msg) {
  const el = document.getElementById("authStatus");
  if (el) el.textContent = msg;
}


async function applyUid(newUid) {
  uid = newUid;
  localStorage.setItem("uid", uid);

  setUidText(uid);
  await identify(uid);
  await loadNextText(uid);

  currentSessionId = null;
  buffer = [];
  events = [];
  lastKeyTime = null;

  document.getElementById("session").textContent = "none";
  document.getElementById("eventCount").textContent = "0";
  document.getElementById("syncStatus").textContent = "-";
  document.getElementById("result").textContent = "-";
  document.getElementById("weakBigrams").textContent = "-";
}

ensureAuthFlag();
syncAuthUi();


document.getElementById("regen").addEventListener("click", async () => {
  await applyUid(generateUid());
  localStorage.setItem("loggedIn", "0");
  syncAuthUi();
  setAuthStatus("anonymous profile");
});

async function startSession(uid) {
  if (!Number.isInteger(currentTextId)) throw new Error("No text loaded");

  const res = await fetch("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, textId: currentTextId })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to start session");

  const sessionId = Number.parseInt(data.sessionId, 10);
  if (!Number.isInteger(sessionId)) throw new Error("Bad sessionId from server");
  return sessionId;
}

document.getElementById("startSession").addEventListener("click", async () => {
  try {
    const sessionId = await startSession(uid);
    document.getElementById("session").textContent = sessionId;
    currentSessionId = sessionId;

    buffer = [];
    events = [];
    lastKeyTime = null;

    document.getElementById("syncStatus").textContent = "-";
    document.getElementById("eventCount").textContent = "0";
  } catch (e) {
    document.getElementById("session").textContent = e.message;
  }
});

async function flushEvents(uid) {
  if (!currentSessionId) return;
  if (buffer.length === 0) return;

  const payload = buffer;
  buffer = [];

  const res = await fetch("/api/events/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, sessionId: currentSessionId, events: payload })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to sync");

  document.getElementById("syncStatus").textContent = `stored ${data.stored}, dropped ${data.dropped}`;
}


checkHealth();
identify(uid).catch(() => {});
loadNextText(uid).catch((e) => {
  document.getElementById("currentText").textContent = e.message;
});

ensureAuthFlag();
syncAuthUi();

const input = document.getElementById("typingInput");
input.addEventListener("keydown", (e) => {
  if (!currentSessionId) return;

  const now = Date.now();
  const deltaMs = lastKeyTime === null ? 0 : now - lastKeyTime;
  lastKeyTime = now;

  const isBackspace = e.key === "Backspace";
  const isChar = e.key.length === 1;

  if (!isChar && !isBackspace) return;

  const idx = input.value.length;

  const ev = {
    idx,
    typed: isBackspace ? null : e.key,
    deltaMs,
    isBackspace
  };

  events.push(ev);
  buffer.push(ev);

  if (buffer.length >= 25) {
    flushEvents(uid).catch((err) => {
      document.getElementById("syncStatus").textContent = err.message;
    });
  }

  document.getElementById("eventCount").textContent = String(events.length);
});

async function finishSession(uid) {
  if (!currentSessionId) throw new Error("No active session");

  await flushEvents(uid);

  const res = await fetch(`/api/session/${currentSessionId}/finish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to finish session");
  return data;
}

document.getElementById("finishSession").addEventListener("click", async () => {
  try {
    const data = await finishSession(uid);

    document.getElementById("result").textContent =
      `WPM ${data.wpm} | Acc ${data.accuracy}% | Backspaces ${data.backspaces}`;

    if (Array.isArray(data.weakBigramsTop)) {
      document.getElementById("weakBigrams").textContent =
        data.weakBigramsTop.map(x => `${x.bg}:${x.errors}`).join("  ");
    }
  } catch (e) {
    document.getElementById("result").textContent = e.message;
  }
});

async function authRequest(path) {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Auth failed");
  return data.uid;
}

document.getElementById("registerBtn").addEventListener("click", async () => {
  try {
    setAuthStatus("registering...");
    const newUid = await authRequest("/api/auth/register");
    await applyUid(newUid);

    localStorage.setItem("loggedIn", "1");
    syncAuthUi();

    setAuthStatus("registered + logged in");
  } catch (e) {
    setAuthStatus(e.message);
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  try {
    setAuthStatus("logging in...");
    const newUid = await authRequest("/api/auth/login");
    await applyUid(newUid);

    localStorage.setItem("loggedIn", "1");
    syncAuthUi();

    setAuthStatus("logged in");
  } catch (e) {
    setAuthStatus(e.message);
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await applyUid(generateUid());

  localStorage.setItem("loggedIn", "0");
  syncAuthUi();

  setAuthStatus("logged out");
});


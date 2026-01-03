let currentSessionId = null;
let lastKeyTime = null;
let events = [];


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
  document.getElementById("uid").textContent = uid;
}

async function checkHealth() {
  const res = await fetch("/api/health");
  const data = await res.json();
  document.getElementById("status").textContent = data.ok ? "ok" : "not ok";
}

const uid = getOrCreateUid();
setUidText(uid);
identify(uid);

document.getElementById("regen").addEventListener("click", async () => {
  uid = generateUid();
  localStorage.setItem("uid", uid);
  setUidText(uid);
  await identify(uid);
  await loadNextText(uid);
  currentSessionId = null;
  document.getElementById("session").textContent = "none";
});

checkHealth();

async function identify(uid) {
  await fetch("/api/user/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid })
  });
}

async function startSession(uid) {

  if (!Number.isInteger(currentTextId)) {
    throw new Error("No text loaded");
  }

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
    document.getElementById("syncStatus").textContent = "-";

  events = [];
  lastKeyTime = null;
  document.getElementById("eventCount").textContent = "0";
  } catch (e) {
    document.getElementById("session").textContent = e.message;
  }
});

let buffer = [];

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

let currentTextId = null;

async function loadNextText(uid) {
  const res = await fetch(`/api/text/next?uid=${encodeURIComponent(uid)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load text");

  currentTextId = data.textId;
  document.getElementById("currentText").textContent = data.text;
}

loadNextText(uid);

const input = document.getElementById("typingInput");

input.addEventListener("keydown", (e) => {
  if (!currentSessionId) return;

  const now = Date.now();
  const deltaMs = lastKeyTime === null ? 0 : now - lastKeyTime;
  lastKeyTime = now;

  const isBackspace = e.key === "Backspace";

  const isChar = e.key.length === 1;

  if (!isChar && !isBackspace) return;

  //simple will be updated later
  const idx = input.value.length;

  events.push({
    idx,
    typed: isBackspace ? null : e.key,
    deltaMs,
    isBackspace
  });
  
  buffer.push({
  idx,
  typed: isBackspace ? null : e.key,
  deltaMs,
  isBackspace
});

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



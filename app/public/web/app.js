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

document.getElementById("regen").addEventListener("click", () => {
  const newUid = generateUid();
  localStorage.setItem("uid", newUid);
  setUidText(newUid);
  identify(uid);
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
  return data.sessionId;
}



document.getElementById("startSession").addEventListener("click", async () => {
  try {
    const sessionId = await startSession(uid);
    document.getElementById("session").textContent = sessionId;
    currentSessionId = sessionId;
  events = [];
  lastKeyTime = null;
  document.getElementById("eventCount").textContent = "0";
  } catch (e) {
    document.getElementById("session").textContent = e.message;
  }
});

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

  document.getElementById("eventCount").textContent = String(events.length);
});


let currentSessionId = null;
let lastKeyTime = null;
let buffer = [];
let currentTextId = null;
let currentTargetText = "";


function el(id) {
  return document.getElementById(id);
}
function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = String(value);
}

function escHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function charHtml(ch) {
  // keep spaces visible in overlay layout
  if (ch === " ") return "&nbsp;";
  if (ch === "\n") return "<br/>";
  return escHtml(ch);
}

function setTypingEnabled(enabled) {
  const input = el("typingInput");
  if (input) input.disabled = !enabled;

  const box = el("typeBox");
  if (box) box.classList.toggle("disabled", !enabled);
}

function renderOverlay() {
  const targetEl = el("targetOverlay");
  const typedEl = el("typedOverlay");
  const input = el("typingInput");

  if (!targetEl || !typedEl || !input) return;

  const target = String(currentTargetText || "");
  const typed = String(input.value || "");

  targetEl.textContent = target;

  let html = "";

  const n = target.length;
  const m = typed.length;

  for (let i = 0; i < n; i++) {
    if (i === m) html += `<span class="caret"></span>`;

    if (i < m) {
      const t = typed[i];
      const exp = target[i];
      html += `<span class="${t === exp ? "ok" : "bad"}">${charHtml(t)}</span>`;
    } else {
      html += `<span class="ghost">${charHtml(target[i])}</span>`;
    }
  }

  if (m >= n) {
    html += `<span class="caret"></span>`;
    const extra = typed.slice(n);
    if (extra.length) {
      for (const ch of extra) {
        html += `<span class="overflow">${charHtml(ch)}</span>`;
      }
    }
  }

  typedEl.innerHTML = html;
}

function generateUid() {
  return `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getStoredUid() {
  return localStorage.getItem("authUid")
    || localStorage.getItem("uid")
    || null;
}

function isLoggedIn() {
  return Boolean(localStorage.getItem("authUid"));
}

function syncAuthUi() {
  const logged = isLoggedIn();

  const logoutBtn = el("logoutBtn");
  if (logoutBtn) logoutBtn.style.display = logged ? "inline-block" : "none";

  const profileLink = el("profileLink");
  if (profileLink) profileLink.style.display = logged ? "inline-block" : "none";

  const profileAnon = el("profileAnon");
  if (profileAnon) profileAnon.style.display = logged ? "none" : "block";

  const profileCard = el("profileCard");
  if (profileCard) profileCard.style.display = logged ? "block" : "none";
}

async function identify(uid) {
  await fetch("/api/user/identify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid })
  });
}

async function checkHealth() {
  const res = await fetch("/api/health");
  const data = await res.json();
  setText("status", data.ok ? "ok" : "not ok");
}

async function loadNextText(uid) {
  const res = await fetch(`/api/text/next?uid=${encodeURIComponent(uid)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load text");

  currentTextId = data.textId;
  setText("currentText", data.text);
  currentTargetText = data.text || "";
  renderOverlay();


 if (data.meta) {
  const m = data.meta;
  const matches = Array.isArray(m.matchesTop) && m.matchesTop.length
    ? m.matchesTop.map(x => `${x.bg}(${x.weight})`).join(", ")
    : "none";

  const meta = `mode=${m.mode} | used=${m.used} | strength=${m.personalizationStrength} | stress=${m.stressMode} | score=${m.profileScore} | matches=${matches}`;
  setText("selectionMeta", meta);
}
  return data;
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

  setText("syncStatus", `stored ${data.stored}, dropped ${data.dropped}`);
}

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

async function authRequest(path) {
  const username = el("username")?.value || "";
  const password = el("password")?.value || "";

  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Auth failed");

  return { uid: data.uid, username };
}

let uid = getStoredUid();
if (!uid) {
  uid = generateUid();
  localStorage.setItem("uid", uid);
}

async function applyUid(newUid) {
  uid = newUid;
  localStorage.setItem("uid", uid);

  setText("uid", uid);

  await identify(uid);
  await loadNextText(uid);

  currentSessionId = null;
  buffer = [];
  lastKeyTime = null;

  setText("session", "none");
  setText("eventCount", "0");
  setText("syncStatus", "-");
  setText("result", "-");
  setText("weakBigrams", "-");
}

function setLoggedIn(newUid, username) {
  localStorage.setItem("authUid", newUid);
  localStorage.setItem("username", username);
  syncAuthUi();
}

function setLoggedOut() {
  localStorage.removeItem("authUid");
  localStorage.removeItem("username");
  syncAuthUi();
}

syncAuthUi();
checkHealth();
applyUid(uid).catch((e) => setText("result", e.message));

el("typeBox")?.addEventListener("click", () => {
  el("typingInput")?.focus();
});

el("typingInput")?.addEventListener("input", () => {
  renderOverlay();
});


const input = document.getElementById("typingInput");
 if (input) input.disabled = true;


el("regen")?.addEventListener("click", async () => {
  try {
    const authUid = localStorage.getItem("authUid");
    if (authUid) {
      await applyUid(authUid);
      setText("authStatus", "refreshed logged-in profile");
    } else {
      await applyUid(generateUid());
      setText("authStatus", "anonymous profile");
    }
  } catch (e) {
    setText("authStatus", e.message);
  }
});


el("startSession")?.addEventListener("click", async () => {
  try {
    const sessionId = await startSession(uid);
    currentSessionId = sessionId;

    const input = document.getElementById("typingInput");
if (input) {
  input.value = "";
  input.disabled = false;
  input.focus();
}

    buffer = [];
    lastKeyTime = null;
    setTypingEnabled(true);
    renderOverlay();


    setText("session", sessionId);
    setText("syncStatus", "-");
    setText("eventCount", "0");
    setText("weakBigrams", "-");
  } catch (e) {
    setText("session", e.message);
  }
});

el("typingInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
    e.preventDefault();
    el("finishSession")?.click();
    return;
  }

  if (!currentSessionId) return;

  const now = Date.now();
  const deltaMs = lastKeyTime === null ? 0 : now - lastKeyTime;
  lastKeyTime = now;

  const isBackspace = e.key === "Backspace";
  const isChar = e.key.length === 1;
  if (!isChar && !isBackspace) return;

  const input = el("typingInput");
  const idx = input ? input.value.length : 0;

  buffer.push({
    idx,
    typed: isBackspace ? null : e.key,
    deltaMs,
    isBackspace
  });

  setText("eventCount", buffer.length);

  if (buffer.length >= 25) {
    flushEvents(uid).catch((err) => setText("syncStatus", err.message));
  }
});

el("finishSession")?.addEventListener("click", async () => {
  try {
    setTypingEnabled(false);
    const data = await finishSession(uid);

    setText("result", `WPM ${data.wpm} | Acc ${data.accuracy}% | Backspaces ${data.backspaces}`);

    if (Array.isArray(data.weakBigramsTop)) {
      setText("weakBigrams", data.weakBigramsTop.map(x => `${x.bg}:${x.errors}`).join("  "));
      setText("focusBigrams", data.weakBigramsTop.map(x => x.bg).join(", "));
    }

    const input = document.getElementById("typingInput");
if (input) input.disabled = true;
currentSessionId = null;
setText("session", "none");

await loadNextText(uid);

const nextSessionId = await startSession(uid);
currentSessionId = nextSessionId;
setText("session", nextSessionId);

buffer = [];
lastKeyTime = null;
setText("eventCount", "0");
setText("syncStatus", "-");
setText("weakBigrams", "-");

const input2 = el("typingInput");
if (input2) {
  input2.value = "";
  input2.focus();
}

setTypingEnabled(true);
renderOverlay();




  } catch (e) {
    setText("result", e.message);
  }
});

el("registerBtn")?.addEventListener("click", async () => {
  try {
    setText("authStatus", "registering...");
    const r = await authRequest("/api/auth/register");
    setLoggedIn(r.uid, r.username);
    await applyUid(r.uid);
    setText("authStatus", "registered + logged in");
  } catch (e) {
    setText("authStatus", e.message);
  }
});

el("loginBtn")?.addEventListener("click", async () => {
  try {
    setText("authStatus", "logging in...");
    const r = await authRequest("/api/auth/login");

    setLoggedIn(r.uid, r.username);
    await applyUid(r.uid);
    setText("authStatus", "logged in");
  } catch (e) {
    setText("authStatus", e.message);
  }
});

el("logoutBtn")?.addEventListener("click", async () => {
  try {
    setLoggedOut();
    await applyUid(generateUid());
    setText("authStatus", "logged out");
  } catch (e) {
    setText("authStatus", e.message);
  }
});

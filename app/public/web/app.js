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
  const res = await fetch("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid, textId: 1 })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to start session");
  return data.sessionId;
}

document.getElementById("startSession").addEventListener("click", async () => {
  try {
    const sessionId = await startSession(uid);
    document.getElementById("session").textContent = sessionId;
  } catch (e) {
    document.getElementById("session").textContent = e.message;
  }
});


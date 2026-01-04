let wpmChart = null;
let accChart = null;
let bigramChart = null;

function adminFetch(url, pw, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      "x-admin-password": pw
    }
  });
}

function modeFromConfig(strength, stress) {
  if (strength === 0 && stress === false) return "easy";
  if (strength === 85 && stress === false) return "normal";
  if (strength === 100 && stress === true) return "hard";
  return "custom";
}

async function loadConfig(pw) {
  const res = await adminFetch("/api/admin/config", pw);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load config");

  const mode = modeFromConfig(
    Number(data.personalization_strength),
    Boolean(data.stress_mode)
  );

  document.getElementById("modeLabel").textContent = mode;
  document.getElementById("modeStatus").textContent = "loaded";
}

async function setMode(pw, mode) {
 
  let personalization_strength = 85;
  let stress_mode = false;

  if (mode === "easy") {
    personalization_strength = 0;
    stress_mode = false;
  } else if (mode === "normal") {
    personalization_strength = 85;
    stress_mode = false;
  } else if (mode === "hard") {
    personalization_strength = 100;
    stress_mode = true;
  }

  const res = await adminFetch("/api/admin/config", pw, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personalization_strength, stress_mode })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to save mode");

  document.getElementById("modeLabel").textContent = mode;
  document.getElementById("modeStatus").textContent = "saved";
}

async function loadUserSessions(pw, uid) {
  const res = await adminFetch(`/api/admin/users/${encodeURIComponent(uid)}/sessions`, pw);
  const data = await res.json();

  if (!res.ok) {
    document.getElementById("adminStatus").textContent = data.error || "error";
    return;
  }

  const labels = data.sessions.map(s => new Date(s.started_at).toLocaleString());
  const wpmValues = data.sessions.map(s => Number(s.wpm));
  const accValues = data.sessions.map(s => Number(s.accuracy));

  const wpmCtx = document.getElementById("wpmChart");
  if (wpmChart) wpmChart.destroy();
  wpmChart = new Chart(wpmCtx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "WPM", data: wpmValues }]
    }
  });

  const accCtx = document.getElementById("accChart");
  if (accChart) accChart.destroy();
  accChart = new Chart(accCtx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Accuracy (%)", data: accValues }]
    }
  });
}

async function loadUserProfile(pw, uid) {
  const res = await adminFetch(`/api/admin/users/${encodeURIComponent(uid)}/profile`, pw);
  const data = await res.json();

  if (!res.ok) {
    document.getElementById("adminStatus").textContent = data.error || "error";
    return;
  }

  const labels = (data.weakBigramsTop || []).map(x => x.bg);
  const values = (data.weakBigramsTop || []).map(x => Number(x.errors));

  const ctx = document.getElementById("bigramChart");
  if (bigramChart) bigramChart.destroy();
  bigramChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Errors", data: values }]
    }
  });
}

async function loadAllForUser(pw, uid) {
  await loadUserSessions(pw, uid);
  await loadUserProfile(pw, uid);
}

document.getElementById("loadUsers").addEventListener("click", async () => {
  const pw = document.getElementById("pw").value;
  const status = document.getElementById("adminStatus");
  status.textContent = "loading...";

  const res = await adminFetch("/api/admin/users", pw);
  const data = await res.json();

  if (!res.ok) {
    status.textContent = data.error || "error";
    return;
  }

  status.textContent = `loaded ${data.users.length} users`;

  const sel = document.getElementById("userSelect");
  sel.innerHTML = "";

  for (const u of data.users) {
    const opt = document.createElement("option");
    opt.value = u.uid;
    const label = u.username ? `${u.username} (${u.uid})` : u.uid;
    opt.textContent = `${label} (sessions: ${u.sessions})`;
    sel.appendChild(opt);
  }

  try {
    await loadConfig(pw);
  } catch (e) {
    document.getElementById("modeStatus").textContent = e.message;
  }

  if (data.users.length > 0) {
    await loadAllForUser(pw, data.users[0].uid);
  }
});

document.getElementById("userSelect").addEventListener("change", async (e) => {
  const pw = document.getElementById("pw").value;
  await loadAllForUser(pw, e.target.value);
});

document.getElementById("userFilter").addEventListener("input", () => {
  const q = document.getElementById("userFilter").value.toLowerCase();
  const sel = document.getElementById("userSelect");
  for (const opt of sel.options) {
    opt.hidden = q && !opt.textContent.toLowerCase().includes(q);
  }
});

document.getElementById("modeEasy").addEventListener("click", async () => {
  const pw = document.getElementById("pw").value;
  try { await setMode(pw, "easy"); } catch (e) { document.getElementById("modeStatus").textContent = e.message; }
});

document.getElementById("modeNormal").addEventListener("click", async () => {
  const pw = document.getElementById("pw").value;
  try { await setMode(pw, "normal"); } catch (e) { document.getElementById("modeStatus").textContent = e.message; }
});

document.getElementById("modeHard").addEventListener("click", async () => {
  const pw = document.getElementById("pw").value;
  try { await setMode(pw, "hard"); } catch (e) { document.getElementById("modeStatus").textContent = e.message; }
});

document.getElementById("deleteUser").addEventListener("click", async () => {
  const pw = document.getElementById("pw").value;
  const uid = document.getElementById("userSelect").value;
  const el = document.getElementById("deleteStatus");

  if (!uid) return;

  const ok = confirm(`Delete user ${uid}? This removes sessions/events/profile/account.`);
  if (!ok) return;

  el.textContent = "deleting...";

  const res = await adminFetch(`/api/admin/users/${encodeURIComponent(uid)}`, pw, { method: "DELETE" });
  const data = await res.json();

  if (!res.ok) {
    el.textContent = data.error || "error";
    return;
  }

  el.textContent = "deleted. reload users.";
});

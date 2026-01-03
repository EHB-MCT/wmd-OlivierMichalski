let chart = null;

function adminFetch(url, pw) {
  return fetch(url, {
    headers: { "x-admin-password": pw }
  });
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

  if (data.users.length > 0) {
    await loadUserSessions(pw, data.users[0].uid);
  }
});

document.getElementById("userSelect").addEventListener("change", async (e) => {
  const pw = document.getElementById("pw").value;
  await loadUserSessions(pw, e.target.value);
  await loadUserProfile(pw, e.target.value);
  if (data.users.length > 0) {
  await loadUserSessions(pw, data.users[0].uid);
  await loadUserProfile(pw, data.users[0].uid);
}

});

async function loadUserSessions(pw, uid) {
  const res = await adminFetch(`/api/admin/users/${encodeURIComponent(uid)}/sessions`, pw);
  const data = await res.json();

  if (!res.ok) {
    document.getElementById("adminStatus").textContent = data.error || "error";
    return;
  }

  const labels = data.sessions.map(s => new Date(s.started_at).toLocaleString());
  const values = data.sessions.map(s => Number(s.wpm));

  const ctx = document.getElementById("wpmChart");

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "WPM", data: values }]
    }
  });
}

document.getElementById("userFilter").addEventListener("input", () => {
  const q = document.getElementById("userFilter").value.toLowerCase();
  const sel = document.getElementById("userSelect");

  for (const opt of sel.options) {
    opt.hidden = q && !opt.textContent.toLowerCase().includes(q);
  }
});

let bigramChart = null;

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

let wpmChart = null;
let accChart = null;
let bigramChart = null;


function isLoggedIn() {
  return localStorage.getItem("loggedIn") === "1";
}

if (!isLoggedIn()) {
  document.body.innerHTML = `
    <main style="padding:20px;font-family:system-ui">
      <h2>Profile is only available when logged in.</h2>
      <p><a href="/">Go back and log in</a></p>
    </main>
  `;
  throw new Error("Not logged in");
}

function getUid() {
  return localStorage.getItem("uid");
}

async function loadProfile() {
  const uid = getUid();
  if (!uid) {
    document.getElementById("who").textContent = "no uid";
    return;
  }

  const res = await fetch(`/api/user/profile?uid=${encodeURIComponent(uid)}`);
  const data = await res.json();

  if (!res.ok) {
    document.getElementById("who").textContent = data.error || "error";
    return;
  }

  document.getElementById("who").textContent = data.username ? `${data.username} (${data.uid})` : data.uid;
  document.getElementById("mode").textContent = data.mode;

  document.getElementById("avg").textContent =
    `WPM ${Number(data.avgWpm || 0).toFixed(1)} | Acc ${Number(data.avgAccuracy || 0).toFixed(1)}%`;

  const labels = (data.sessions || []).map(s => new Date(s.started_at).toLocaleString());
  const wpmValues = (data.sessions || []).map(s => Number(s.wpm));
  const accValues = (data.sessions || []).map(s => Number(s.accuracy));

  const wpmCtx = document.getElementById("wpmChart");
  if (wpmChart) wpmChart.destroy();
  wpmChart = new Chart(wpmCtx, {
    type: "line",
    data: { labels, datasets: [{ label: "WPM", data: wpmValues }] }
  });

  const accCtx = document.getElementById("accChart");
  if (accChart) accChart.destroy();
  accChart = new Chart(accCtx, {
    type: "line",
    data: { labels, datasets: [{ label: "Accuracy (%)", data: accValues }] }
  });

  const bgLabels = (data.weakBigramsTop || []).map(x => x.bg);
  const bgValues = (data.weakBigramsTop || []).map(x => Number(x.errors));

  const bgCtx = document.getElementById("bigramChart");
  if (bigramChart) bigramChart.destroy();
  bigramChart = new Chart(bgCtx, {
    type: "bar",
    data: { labels: bgLabels, datasets: [{ label: "Errors", data: bgValues }] }
  });
}

loadProfile();

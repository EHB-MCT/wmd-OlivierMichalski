const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const bcrypt = require("bcryptjs");

// API
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use(express.json());
app.use("/", express.static(path.join(__dirname, "..", "public", "web")));



const db = require("./db");

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-password"];
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
  `
  SELECT
    u.uid,
    a.username,
    MAX(s.started_at) AS last_seen,
    COUNT(s.id) AS sessions
  FROM users u
  LEFT JOIN accounts a ON a.uid = u.uid
  LEFT JOIN sessions s ON s.uid = u.uid
  GROUP BY u.uid, a.username
  ORDER BY last_seen DESC NULLS LAST
  LIMIT 200
  `
);

    return res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/admin/users/:uid/sessions", requireAdmin, async (req, res) => {
  const uid = req.params.uid;

  if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
    return res.status(400).json({ error: "Invalid uid" });
  }

  try {
    const result = await db.query(
      `
      SELECT id, started_at, ended_at, wpm, accuracy, backspaces
      FROM sessions
      WHERE uid = $1 AND ended_at IS NOT NULL
      ORDER BY started_at ASC
      LIMIT 200
      `,
      [uid]
    );
    return res.json({ sessions: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.use("/admin", express.static(path.join(__dirname, "..", "public", "admin")));

app.get("/api/admin/users/:uid/profile", requireAdmin, async (req, res) => {
  const uid = req.params.uid;

  if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
    return res.status(400).json({ error: "Invalid uid" });
  }

  try {
    const result = await db.query(
      `
      SELECT p.uid, p.avg_wpm, p.avg_accuracy, p.weak_bigrams, a.username
      FROM profiles p
      LEFT JOIN accounts a ON a.uid = p.uid
      WHERE p.uid = $1
      `,
      [uid]
    );

    if (result.rowCount === 0) {
      return res.json({ uid, username: null, avg_wpm: 0, avg_accuracy: 0, weakBigramsTop: [] });
    }

    const row = result.rows[0];

    let weak = row.weak_bigrams || {};
    if (typeof weak === "string") {
      try { weak = JSON.parse(weak); } catch { weak = {}; }
    }
    if (!weak || typeof weak !== "object") weak = {};

    const weakBigramsTop = Object.entries(weak)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 12)
      .map(([bg, errors]) => ({ bg, errors: Number(errors) }));

    return res.json({
      uid: row.uid,
      username: row.username || null,
      avg_wpm: Number(row.avg_wpm || 0),
      avg_accuracy: Number(row.avg_accuracy || 0),
      weakBigramsTop
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/admin/config", requireAdmin, async (req, res) => {
  try {
    const r = await db.query(
      "SELECT personalization_strength, stress_mode, updated_at FROM admin_config WHERE id = 1"
    );

    if (r.rowCount === 0) {
      await db.query("INSERT INTO admin_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
      return res.json({ personalization_strength: 70, stress_mode: false });
    }

    return res.json({
      personalization_strength: Number(r.rows[0].personalization_strength),
      stress_mode: Boolean(r.rows[0].stress_mode),
      updated_at: r.rows[0].updated_at
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/admin/config", requireAdmin, async (req, res) => {
  const strengthRaw = req.body?.personalization_strength;
  const stressRaw = req.body?.stress_mode;

  const personalization_strength = Number.parseInt(strengthRaw, 10);
  const stress_mode = Boolean(stressRaw);

  if (!Number.isInteger(personalization_strength) || personalization_strength < 0 || personalization_strength > 100) {
    return res.status(400).json({ error: "Invalid personalization_strength" });
  }

  try {
    await db.query(
      "UPDATE admin_config SET personalization_strength = $1, stress_mode = $2, updated_at = NOW() WHERE id = 1",
      [personalization_strength, stress_mode]
    );

    return res.json({ ok: true, personalization_strength, stress_mode });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/user/identify", async (req, res) => {
  const { uid } = req.body;

  if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
    return res.status(400).json({ error: "Invalid uid" });
  }

  try {
    await db.query(
      "INSERT INTO users (uid) VALUES ($1) ON CONFLICT (uid) DO NOTHING",
      [uid]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

function isValidUsername(username) {
  return typeof username === "string"
    && username.length >= 3
    && username.length <= 24
    && /^[a-zA-Z0-9_]+$/.test(username);
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 72;
}

function generateUid() {
  return `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;

  if (!isValidUsername(username)) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Invalid password" });
  }

  const uid = generateUid();

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    await db.query("BEGIN");

    await db.query(
      "INSERT INTO users (uid) VALUES ($1) ON CONFLICT (uid) DO NOTHING",
      [uid]
    );

    await db.query(
      "INSERT INTO accounts (username, password_hash, uid) VALUES ($1, $2, $3)",
      [username, passwordHash, uid]
    );

    await db.query("COMMIT");

    return res.json({ ok: true, uid });
  } catch (err) {
    await db.query("ROLLBACK");

    // unique violation (username already exists / uid unique)
    if (err && err.code === "23505") {
      return res.status(409).json({ error: "Username already exists" });
    }

    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/user/profile", async (req, res) => {
  const uid = req.query.uid;

  if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
    return res.status(400).json({ error: "Invalid uid" });
  }

  try {
    const acc = await db.query(
      "SELECT username FROM accounts WHERE uid = $1",
      [uid]
    );

    const sess = await db.query(
      `
      SELECT started_at, wpm, accuracy
      FROM sessions
      WHERE uid = $1 AND ended_at IS NOT NULL
      ORDER BY started_at ASC
      LIMIT 200
      `,
      [uid]
    );

    const pr = await db.query(
      "SELECT weak_bigrams, avg_wpm, avg_accuracy FROM profiles WHERE uid = $1",
      [uid]
    );

    let weak = pr.rowCount ? pr.rows[0].weak_bigrams : {};
    if (typeof weak === "string") {
      try { weak = JSON.parse(weak); } catch { weak = {}; }
    }
    if (!weak || typeof weak !== "object") weak = {};

    const weakBigramsTop = Object.entries(weak)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 12)
      .map(([bg, errors]) => ({ bg, errors: Number(errors) }));

    const cfg = await db.query(
      "SELECT personalization_strength, stress_mode FROM admin_config WHERE id = 1"
    );

    let personalizationStrength = 70;
    let stressMode = false;
    if (cfg.rowCount > 0) {
      personalizationStrength = Number(cfg.rows[0].personalization_strength);
      stressMode = Boolean(cfg.rows[0].stress_mode);
    }

    const mode =
      (personalizationStrength <= 30 && !stressMode) ? "easy" :
      (personalizationStrength >= 90 && stressMode) ? "hard" :
      (personalizationStrength >= 60 && personalizationStrength <= 80 && !stressMode) ? "normal" :
      "custom";

    return res.json({
      uid,
      username: acc.rowCount ? acc.rows[0].username : null,
      mode,
      sessions: sess.rows,
      weakBigramsTop,
      avgWpm: pr.rowCount ? Number(pr.rows[0].avg_wpm || 0) : 0,
      avgAccuracy: pr.rowCount ? Number(pr.rows[0].avg_accuracy || 0) : 0
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});


app.delete("/api/admin/users/:uid", requireAdmin, async (req, res) => {
  const uid = req.params.uid;

  if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
    return res.status(400).json({ error: "Invalid uid" });
  }

  try {
    const r = await db.query("DELETE FROM users WHERE uid = $1 RETURNING uid", [uid]);
    if (r.rowCount === 0) return res.status(404).json({ error: "User not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});




app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!isValidUsername(username)) {
    return res.status(400).json({ error: "Invalid username" });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: "Invalid password" });
  }

  try {
    const result = await db.query(
      "SELECT uid, password_hash FROM accounts WHERE username = $1",
      [username]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);

    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    return res.json({ ok: true, uid: row.uid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});


app.post("/api/session/start", async (req, res) => {
  const { uid, textId } = req.body;

  if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
    return res.status(400).json({ error: "Invalid uid" });
  }
  if (!Number.isInteger(textId) || textId <= 0) {
    return res.status(400).json({ error: "Invalid textId" });
  }

  try {
    await db.query("INSERT INTO users (uid) VALUES ($1) ON CONFLICT (uid) DO NOTHING", [uid]);

    const textExists = await db.query("SELECT id FROM texts WHERE id = $1", [textId]);
    if (textExists.rowCount === 0) {
      return res.status(400).json({ error: "Unknown textId" });
    }

    const result = await db.query(
      "INSERT INTO sessions (uid, text_id) VALUES ($1, $2) RETURNING id",
      [uid, textId]
    );

    return res.json({ sessionId: result.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/text/next", async (req, res) => {
  const uid = req.query.uid;

  if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
    return res.status(400).json({ error: "Invalid uid" });
  }

  try {
    await db.query(
      "INSERT INTO users (uid) VALUES ($1) ON CONFLICT (uid) DO NOTHING",
      [uid]
    );

    await db.query("INSERT INTO admin_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING");

    const cfg = await db.query(
      "SELECT personalization_strength, stress_mode FROM admin_config WHERE id = 1"
    );

    let personalizationStrength = 70;
    let stressMode = false;

    if (cfg.rowCount > 0) {
      personalizationStrength = Number(cfg.rows[0].personalization_strength);
      stressMode = Boolean(cfg.rows[0].stress_mode);
    }

    function modeFromConfig(strength, stress) {
      if (strength <= 30 && stress === false) return "easy";
      if (strength >= 90 && stress === true) return "hard";
      if (strength >= 60 && strength <= 80 && stress === false) return "normal";
      return "custom";
    }
    
    let mode = modeFromConfig(personalizationStrength, stressMode);
    let modeSource = "admin";
    
    const reqMode = String(req.query.mode || "").toLowerCase();
    if (reqMode === "easy" || reqMode === "normal" || reqMode === "hard") {
      mode = reqMode;
      modeSource = "user";
}

    const pr = await db.query("SELECT weak_bigrams FROM profiles WHERE uid = $1", [uid]);
    let weak = pr.rowCount ? pr.rows[0].weak_bigrams : {};

    if (typeof weak === "string") {
      try { weak = JSON.parse(weak); } catch { weak = {}; }
    }
    if (!weak || typeof weak !== "object") weak = {};

    const all = await db.query("SELECT id, text FROM texts");
    if (all.rowCount === 0) return res.status(500).json({ error: "No texts" });

    function bigramSet(str) {
      const s = String(str || "").toLowerCase();
      const set = new Set();
      for (let i = 0; i < s.length - 1; i++) set.add(s[i] + s[i + 1]);
      return set;
    }

    const scored = all.rows.map((t) => {
      const set = bigramSet(t.text);

      let profileScore = 0;
      for (const [bg, count] of Object.entries(weak)) {
        if (set.has(bg)) profileScore += Number(count);
      }

      const stressBonus = stressMode ? (String(t.text).length / 20) : 0;

      return {
        id: t.id,
        text: t.text,
        profileScore,
        totalScore: profileScore + stressBonus,
        length: String(t.text).length,
        set
      };
    });


        const maxProfileScore = scored.reduce((m, x) => Math.max(m, x.profileScore), 0);
    const hasProfileSignal = Object.keys(weak).length > 0 && maxProfileScore > 0;

    const strength01 = Math.max(0, Math.min(100, Number(personalizationStrength))) / 100;

    function pickFromPool(items) {
      return items[Math.floor(Math.random() * items.length)];
    }

    function pickShortPool() {
      const byLen = [...scored].sort((a, b) => a.length - b.length);
      return byLen.slice(0, Math.min(10, byLen.length));
    }

    function pickLongPool() {
      const byLen = [...scored].sort((a, b) => b.length - a.length);
      return byLen.slice(0, Math.min(10, byLen.length));
    }

    function weightedPick(items, weightFn) {
      const weights = items.map((it) => Math.max(0, Number(weightFn(it) || 0)));
      const sum = weights.reduce((a, b) => a + b, 0);

      if (sum <= 0) return pickFromPool(items);

      let r = Math.random() * sum;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    }

    let pool = scored;
    if (mode === "easy") pool = pickShortPool();
    if (mode === "hard") pool = pickLongPool();

    let used = "random";
    let pick = pickFromPool(pool);

    const canPersonalize = hasProfileSignal && mode !== "easy";

    if (mode === "hard" && canPersonalize) {
      used = "weighted";
      const sorted = [...pool].sort((a, b) => b.totalScore - a.totalScore).slice(0, Math.min(10, pool.length));
      pick = weightedPick(sorted, (t) => t.totalScore);
    } else if (canPersonalize && Math.random() < strength01) {
      used = "weighted";
      const sorted = [...pool].sort((a, b) => b.totalScore - a.totalScore).slice(0, Math.min(10, pool.length));
      pick = weightedPick(sorted, (t) => t.totalScore);
    } else {
      used = "random";
      pick = pickFromPool(pool);
    }

    const matchesTop = Object.entries(weak)
      .filter(([bg, count]) => pick.set && pick.set.has(bg) && Number(count) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 8)
      .map(([bg, weight]) => ({ bg, weight: Number(weight) }));

    return res.json({
      textId: pick.id,
      text: pick.text,
      meta: {
        mode,
        modeSource,
        used,
        personalizationStrength,
        stressMode,
        profileScore: Number(pick.profileScore || 0),
        matchesTop
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});


app.post("/api/events/batch", async (req, res) => {
  const { uid, events } = req.body;
const sessionIdRaw = req.body.sessionId;
const sessionId = Number.parseInt(sessionIdRaw, 10);

if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
  return res.status(400).json({ error: "Invalid uid" });
}
if (!Number.isInteger(sessionId) || sessionId <= 0) {
  return res.status(400).json({ error: "Invalid sessionId" });
}
if (!Array.isArray(events) || events.length === 0 || events.length > 200) {
  return res.status(400).json({ error: "Invalid events" });
}

  try {
    const s = await db.query(
      "SELECT s.id, s.uid, s.text_id, t.text FROM sessions s JOIN texts t ON t.id = s.text_id WHERE s.id = $1",
      [sessionId]
    );

    if (s.rowCount === 0) return res.status(404).json({ error: "Unknown session" });
    if (s.rows[0].uid !== uid) return res.status(403).json({ error: "UID mismatch" });

    const text = s.rows[0].text || "";
    if (text.length === 0) return res.status(500).json({ error: "Text missing" });

    let stored = 0;
    let dropped = 0;

    for (const ev of events) {
      const idx = ev?.idx;
      const typed = ev?.typed;
      const deltaMs = ev?.deltaMs;
      const isBackspace = ev?.isBackspace;

      if (!Number.isInteger(idx) || idx < 0) { dropped++; continue; }
      if (!Number.isInteger(deltaMs) || deltaMs < 0 || deltaMs > 5000) { dropped++; continue; }
      if (typeof isBackspace !== "boolean") { dropped++; continue; }

      if (isBackspace) {
        if (typed !== null) { dropped++; continue; }
      } else {
        if (typeof typed !== "string" || typed.length !== 1) { dropped++; continue; }
      }

      const safeIdx = Math.min(Math.max(idx, 0), text.length - 1);
      const expected = text[safeIdx];

      const isCorrect = isBackspace ? false : typed === expected;

      await db.query(
        "INSERT INTO events (session_id, idx, expected, typed, delta_ms, is_backspace, is_correct) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [sessionId, safeIdx, expected, isBackspace ? null : typed, deltaMs, isBackspace, isCorrect]
      );

      stored++;
    }

    return res.json({ stored, dropped });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/session/:id/finish", async (req, res) => {
  const uid = req.body?.uid;
  const sessionId = Number.parseInt(req.params.id, 10);

  if (typeof uid !== "string" || uid.length < 5 || uid.length > 80) {
    return res.status(400).json({ error: "Invalid uid" });
  }
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: "Invalid sessionId" });
  }

  try {
    const sess = await db.query(
      "SELECT id, uid, started_at FROM sessions WHERE id = $1",
      [sessionId]
    );

    if (sess.rowCount === 0) return res.status(404).json({ error: "Unknown session" });
    if (sess.rows[0].uid !== uid) return res.status(403).json({ error: "UID mismatch" });

    const startedAt = new Date(sess.rows[0].started_at);
    const endedAt = new Date();
    const minutes = Math.max((endedAt - startedAt) / 60000, 0.0001);

    const stats = await db.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE is_backspace = false) AS total_chars,
        COUNT(*) FILTER (WHERE is_backspace = false AND is_correct = true) AS correct_chars,
        COUNT(*) FILTER (WHERE is_backspace = false AND is_correct = false) AS wrong_chars,
        COUNT(*) FILTER (WHERE is_backspace = true) AS backspaces,
        AVG(delta_ms)::numeric AS avg_delta_ms,
        COUNT(*) FILTER (WHERE delta_ms > 800)::numeric AS pauses,
        COUNT(*)::numeric AS total_events
      FROM events
      WHERE session_id = $1
      `,
      [sessionId]
    );

    const row = stats.rows[0];

    const totalChars = Number.parseInt(row.total_chars || "0", 10);
    const correctChars = Number.parseInt(row.correct_chars || "0", 10);
    const wrongChars = Number.parseInt(row.wrong_chars || "0", 10);
    const backspaces = Number.parseInt(row.backspaces || "0", 10);

    const avgDeltaMs = row.avg_delta_ms ? Math.round(Number(row.avg_delta_ms)) : 0;

    const pauses = row.pauses ? Number(row.pauses) : 0;
    const totalEvents = row.total_events ? Number(row.total_events) : 0;

    const accuracy = (correctChars + wrongChars) > 0
      ? (correctChars / (correctChars + wrongChars)) * 100
      : 0;

    const wpm = (correctChars / 5) / minutes;

    const pauseRate = totalEvents > 0 ? (pauses / totalEvents) * 100 : 0;

    await db.query(
      `
      UPDATE sessions
      SET ended_at = NOW(),
          wpm = $2,
          accuracy = $3,
          total_chars = $4,
          correct_chars = $5,
          wrong_chars = $6,
          backspaces = $7,
          avg_delta_ms = $8,
          pause_rate = $9
      WHERE id = $1
      `,
      [sessionId, wpm, accuracy, totalChars, correctChars, wrongChars, backspaces, avgDeltaMs, pauseRate]
    );

    const tx = await db.query(
  "SELECT t.text FROM sessions s JOIN texts t ON t.id = s.text_id WHERE s.id = $1",
  [sessionId]
);
const text = tx.rows[0]?.text || "";

const wrong = await db.query(
  "SELECT idx FROM events WHERE session_id = $1 AND is_backspace = false AND is_correct = false",
  [sessionId]
);

const sessionBigramCounts = {};
for (const r of wrong.rows) {
  const idx = Number.parseInt(r.idx, 10);
  if (!Number.isInteger(idx) || idx <= 0 || idx >= text.length) continue;
  const bg = (text[idx - 1] + text[idx]).toLowerCase();
  sessionBigramCounts[bg] = (sessionBigramCounts[bg] || 0) + 1;
}

const av = await db.query(
  "SELECT AVG(wpm) AS avg_wpm, AVG(accuracy) AS avg_accuracy FROM sessions WHERE uid = $1 AND ended_at IS NOT NULL",
  [uid]
);

const avgWpm = av.rows[0]?.avg_wpm ? Number(av.rows[0].avg_wpm) : 0;
const avgAcc = av.rows[0]?.avg_accuracy ? Number(av.rows[0].avg_accuracy) : 0;

const pr = await db.query("SELECT weak_bigrams FROM profiles WHERE uid = $1", [uid]);
let existing = pr.rowCount ? pr.rows[0].weak_bigrams : {};
if (typeof existing === "string") {
  try { existing = JSON.parse(existing); } catch { existing = {}; }
}
if (!existing || typeof existing !== "object") existing = {};

const merged = { ...existing };
for (const [bg, count] of Object.entries(sessionBigramCounts)) {
  const prev = Number(merged[bg] || 0);
  merged[bg] = prev + Number(count);
}

await db.query(
  `
  INSERT INTO profiles (uid, avg_wpm, avg_accuracy, weak_bigrams, updated_at)
  VALUES ($1, $2, $3, $4::jsonb, NOW())
  ON CONFLICT (uid)
  DO UPDATE SET
    avg_wpm = EXCLUDED.avg_wpm,
    avg_accuracy = EXCLUDED.avg_accuracy,
    weak_bigrams = EXCLUDED.weak_bigrams,
    updated_at = NOW()
  `,
  [uid, avgWpm, avgAcc, JSON.stringify(merged)]
);

const weakBigramsTop = Object.entries(merged)
  .sort((a, b) => Number(b[1]) - Number(a[1]))
  .slice(0, 5)
  .map(([bg, errors]) => ({ bg, errors: Number(errors) }));

  // --- NEW: top weak letters for this session (expected letters that were mistyped)
const wrongLetters = await db.query(
  `
  SELECT expected
  FROM events
  WHERE session_id = $1
    AND is_backspace = false
    AND is_correct = false
  `,
  [sessionId]
);

const letterCounts = {};
for (const r of wrongLetters.rows) {
  const ch = String(r.expected || "").toLowerCase();
  if (!/^[a-z]$/.test(ch)) continue; // letters only
  letterCounts[ch] = (letterCounts[ch] || 0) + 1;
}

const weakLettersTop = Object.entries(letterCounts)
  .sort((a, b) => Number(b[1]) - Number(a[1]))
  .slice(0, 8)
  .map(([ch, errors]) => ({ ch, errors: Number(errors) }));
  
  return res.json({
  wpm: Number(wpm.toFixed(1)),
  accuracy: Number(accuracy.toFixed(1)),
  totalChars,
  correctChars,
  wrongChars,
  backspaces,
  avgDeltaMs,
  pauseRate: Number(pauseRate.toFixed(1)),
  weakBigramsTop,
  weakLettersTop
});

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



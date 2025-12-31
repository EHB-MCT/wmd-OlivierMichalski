const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// API
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use(express.json());
app.use("/", express.static(path.join(__dirname, "..", "public", "web")));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const db = require("./db");

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

    // random text !!!! CHANGE LATER !!!!
    const result = await db.query(
      "SELECT id, text FROM texts ORDER BY random() LIMIT 1"
    );

    return res.json({ textId: result.rows[0].id, text: result.rows[0].text });
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

    return res.json({
      wpm: Number(wpm.toFixed(1)),
      accuracy: Number(accuracy.toFixed(1)),
      totalChars,
      correctChars,
      wrongChars,
      backspaces,
      avgDeltaMs,
      pauseRate: Number(pauseRate.toFixed(1))
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "DB error" });
  }
});


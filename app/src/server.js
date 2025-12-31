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


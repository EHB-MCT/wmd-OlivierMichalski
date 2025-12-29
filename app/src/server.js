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


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

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// API
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/", express.static(path.join(__dirname, "..", "public", "web")));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

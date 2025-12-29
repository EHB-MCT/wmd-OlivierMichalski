CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS texts (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL
);

INSERT INTO texts (text) VALUES
('She was sad to hear that fireflies are disappearing.'),
('A quick brown fox jumps over a lazy dog.')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  text_id INT NOT NULL REFERENCES texts(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);

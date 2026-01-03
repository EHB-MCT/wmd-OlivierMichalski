CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS texts (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL
);

INSERT INTO texts (id, text) VALUES
(1, 'She was sad to hear that fireflies are disappearing.'),
(2, 'A quick brown fox jumps over a lazy dog.'),
(3, 'Fifty five fish flutter fast in the fresh water.'),
(4, 'I fixed five files before lunch finished.'),
(5, 'Typing tests train focus and finger flow.')
ON CONFLICT (id) DO NOTHING;


CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  text_id INT NOT NULL REFERENCES texts(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  text_id INT NOT NULL REFERENCES texts(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  wpm NUMERIC,
  accuracy NUMERIC,
  total_chars INT,
  correct_chars INT,
  wrong_chars INT,
  backspaces INT,
  avg_delta_ms INT,
  pause_rate NUMERIC
);

CREATE TABLE IF NOT EXISTS profiles (
  uid TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  avg_wpm NUMERIC NOT NULL DEFAULT 0,
  avg_accuracy NUMERIC NOT NULL DEFAULT 0,
  weak_bigrams JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

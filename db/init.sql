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

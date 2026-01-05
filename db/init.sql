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

SELECT setval(pg_get_serial_sequence('texts','id'), (SELECT COALESCE(MAX(id), 1) FROM texts));

INSERT INTO texts (text) VALUES
('Five friends fixed a flaky Wi-Fi signal before class.'),
('The fireflies flickered above the field at midnight.'),
('I flipped the folder, then found the final file.'),
('A swift shift from F to I still feels tricky.'),
('The train slid past the platform, then stopped.'),
('Bright street lights blur when the rain falls fast.'),
('She typed the short phrase three times, then smiled.'),
('Fresh bread smells great, but it breaks focus.'),
('The clock struck twelve; the room stayed quiet.'),
('Quick sketches on paper help me plan a clean layout.'),
('The black keyboard clicks, then clacks, then calms down.'),
('A small glitch can crash a script in one second.'),
('Press backspace slowly; do not panic and spam it.'),
('The screen froze, so I refreshed and tried again.'),
('A calm pace beats a fast pace with many errors.'),
('I wrote a simple line, saved it, and pushed a commit.'),
('The cursor moved left, then right, then left again.'),
('The purple neon sign lit the wet street.'),
('Bring the brush, blend the grade, then export the clip.'),
('The admin panel shows trends, not feelings.'),
('Clean data in, clean charts out.'),
('A brief pause between keys can reveal hesitation.'),
('The typing test tracks time between letters and words.'),
('Two letters together can trip up even skilled typists.'),
('Try "th", "sh", "ch", and "qu" without rushing.'),
('The quick brown fox jumps over the lazy dog.'),
('Blue birds flew by, then vanished behind clouds.'),
('The bridge was broad, bright, and busy at noon.'),
('A crisp click from the switch feels satisfying.'),
('The script prints logs, then writes rows to the database.'),
('The dashboard filters users by name or UID.'),
('In hard mode, longer lines appear more often.'),
('In easy mode, shorter lines keep stress low.'),
('The profile updates after each finished session.'),
('I missed the "fi" in "file" and had to redo it.'),
('Flip the page, find the phrase, finish the task.'),
('The shop sign flashed; the street felt alive.'),
('A sharp breeze blew across the empty square.'),
('The class chat buzzed, but I kept typing.'),
('The mouse hovered, the menu opened, and I clicked.'),
('One wrong key can shift the whole word.'),
('The best fix is often the smallest change.'),
('Start the session, type the text, then end it.'),
('The system stores every event with a timestamped delta.'),
('I prefer clean code, not clever tricks.'),
('Test, adjust, repeat, then commit.'),
('The quiet room helps me focus on flow.'),
('A fresh cup of coffee can fool you into rushing.'),
('Keep your wrists relaxed and your eyes on the line.'),
('Slow down, stay accurate, and speed will follow.');


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

CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  idx INT NOT NULL,
  expected TEXT NOT NULL,
  typed TEXT,
  delta_ms INT NOT NULL,
  is_backspace BOOLEAN NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);

CREATE TABLE IF NOT EXISTS profiles (
  uid TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  avg_wpm NUMERIC NOT NULL DEFAULT 0,
  avg_accuracy NUMERIC NOT NULL DEFAULT 0,
  weak_bigrams JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  uid TEXT NOT NULL UNIQUE REFERENCES users(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_uid ON accounts(uid);

CREATE TABLE IF NOT EXISTS admin_config (
  id INT PRIMARY KEY,
  personalization_strength INT NOT NULL DEFAULT 70,
  stress_mode BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO admin_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
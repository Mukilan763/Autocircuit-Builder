-- AutoCircuit Builder community backend schema.
-- Applied idempotently at startup (see index.js) so a fresh Postgres
-- instance just works with no separate migration step.

CREATE TABLE IF NOT EXISTS builds (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author_name TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN ('elec', 'mech')),
  description TEXT NOT NULL DEFAULT '',
  circuit_json JSONB NOT NULL,
  edit_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS likes (
  id SERIAL PRIMARY KEY,
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (build_id, viewer_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  build_id INTEGER NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  edit_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_likes_build ON likes(build_id);
CREATE INDEX IF NOT EXISTS idx_comments_build ON comments(build_id);
CREATE INDEX IF NOT EXISTS idx_builds_created ON builds(created_at DESC);

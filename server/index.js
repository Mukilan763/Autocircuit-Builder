// index.js — the Community page's backend: a small REST API in front of
// Postgres. This is the one piece of AutoCircuit Builder that isn't a
// static file, because "other people can see your likes/comments" needs
// data that lives somewhere shared, not in one browser's localStorage.
//
// Deliberately minimal, matching the rest of the app's philosophy: no user
// accounts. Publishing a build or leaving a comment just asks for a display
// name (freely spoofable, like an old-school guestbook) and hands back a
// one-time `editToken` the browser stashes in localStorage so *you* can
// delete your own post later — nobody else can, since nobody else ever
// sees that token.
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set — refusing to start.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render's internal Postgres connection doesn't present a CA chain the
  // default TLS check trusts; this is Render's own documented pattern for
  // connecting from a service in the same account, not a general relaxation.
  ssl: { rejectUnauthorized: false },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '350kb' }));

// ---------------------------------------------------------------- limits
const MAX_TITLE = 80, MAX_NAME = 40, MAX_DESC = 300, MAX_COMMENT = 500;
const MAX_CIRCUIT_JSON_CHARS = 300000; // ~300KB — generous for any real build

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many submissions from this connection — try again in a bit.' } });

app.use('/api', readLimiter);

// ----------------------------------------------------------------- utils
function clean(str, max) {
  return String(str ?? '').trim().slice(0, max);
}
function badRequest(res, msg) { return res.status(400).json({ error: msg }); }

async function withBuild(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'Invalid build id.');
  req.buildId = id;
  next();
}

// -------------------------------------------------------------- /builds
app.get('/api/builds', async (req, res) => {
  const domain = req.query.domain === 'elec' || req.query.domain === 'mech' ? req.query.domain : null;
  const sort = req.query.sort === 'liked' ? 'like_count DESC, b.created_at DESC' : 'b.created_at DESC';
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const params = [];
  let where = '';
  if (domain) { params.push(domain); where = `WHERE b.domain = $${params.length}`; }
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT b.id, b.title, b.author_name, b.domain, b.description, b.circuit_json, b.created_at,
            COUNT(DISTINCT l.id)::int AS like_count,
            COUNT(DISTINCT c.id)::int AS comment_count
     FROM builds b
     LEFT JOIN likes l ON l.build_id = b.id
     LEFT JOIN comments c ON c.build_id = b.id
     ${where}
     GROUP BY b.id
     ORDER BY ${sort}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  res.json(rows);
});

app.get('/api/builds/:id', withBuild, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.id, b.title, b.author_name, b.domain, b.description, b.circuit_json, b.created_at,
            COUNT(DISTINCT l.id)::int AS like_count,
            COUNT(DISTINCT c.id)::int AS comment_count
     FROM builds b
     LEFT JOIN likes l ON l.build_id = b.id
     LEFT JOIN comments c ON c.build_id = b.id
     WHERE b.id = $1
     GROUP BY b.id`,
    [req.buildId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Build not found.' });
  res.json(rows[0]);
});

app.post('/api/builds', writeLimiter, async (req, res) => {
  const title = clean(req.body.title, MAX_TITLE);
  const authorName = clean(req.body.authorName, MAX_NAME);
  const domain = req.body.domain === 'elec' || req.body.domain === 'mech' ? req.body.domain : null;
  const description = clean(req.body.description, MAX_DESC);
  const circuit = req.body.circuitJson;

  if (!title) return badRequest(res, 'Title is required.');
  if (!authorName) return badRequest(res, 'Your name is required.');
  if (!domain) return badRequest(res, 'domain must be "elec" or "mech".');
  if (!circuit || !Array.isArray(circuit.components) || !Array.isArray(circuit.wires)) {
    return badRequest(res, 'circuitJson must have components[] and wires[] arrays.');
  }
  const circuitStr = JSON.stringify(circuit);
  if (circuitStr.length > MAX_CIRCUIT_JSON_CHARS) return badRequest(res, 'That build is too large to publish.');
  if (!circuit.components.length) return badRequest(res, "Can't publish an empty canvas.");

  const editToken = crypto.randomBytes(16).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO builds (title, author_name, domain, description, circuit_json, edit_token)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
    [title, authorName, domain, description, circuit, editToken]
  );
  res.status(201).json({ id: rows[0].id, createdAt: rows[0].created_at, editToken });
});

app.delete('/api/builds/:id', writeLimiter, withBuild, async (req, res) => {
  const editToken = clean(req.body.editToken, 64);
  if (!editToken) return badRequest(res, 'editToken is required.');
  const { rowCount } = await pool.query('DELETE FROM builds WHERE id = $1 AND edit_token = $2', [req.buildId, editToken]);
  if (!rowCount) return res.status(403).json({ error: "That build doesn't exist, or this browser didn't publish it." });
  res.status(204).end();
});

// --------------------------------------------------------------- /likes
// No accounts, so "who liked this" is just a random id the browser makes up
// once and keeps in localStorage — good enough to stop one click from
// counting twice, not meant to survive clearing your browser data.
app.post('/api/builds/:id/like', writeLimiter, withBuild, async (req, res) => {
  const viewerId = clean(req.body.viewerId, 64);
  if (!viewerId) return badRequest(res, 'viewerId is required.');

  const existing = await pool.query('SELECT id FROM likes WHERE build_id = $1 AND viewer_id = $2', [req.buildId, viewerId]);
  let liked;
  if (existing.rows.length) {
    await pool.query('DELETE FROM likes WHERE id = $1', [existing.rows[0].id]);
    liked = false;
  } else {
    try {
      await pool.query('INSERT INTO likes (build_id, viewer_id) VALUES ($1, $2)', [req.buildId, viewerId]);
      liked = true;
    } catch (e) {
      if (e.code === '23503') return res.status(404).json({ error: 'Build not found.' }); // FK violation
      throw e;
    }
  }
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM likes WHERE build_id = $1', [req.buildId]);
  res.json({ liked, likeCount: rows[0].count });
});

// ------------------------------------------------------------ /comments
app.get('/api/builds/:id/comments', withBuild, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, author_name, text, created_at FROM comments WHERE build_id = $1 ORDER BY created_at ASC',
    [req.buildId]
  );
  res.json(rows);
});

app.post('/api/builds/:id/comments', writeLimiter, withBuild, async (req, res) => {
  const authorName = clean(req.body.authorName, MAX_NAME);
  const text = clean(req.body.text, MAX_COMMENT);
  if (!authorName) return badRequest(res, 'Your name is required.');
  if (!text) return badRequest(res, 'Comment text is required.');

  const editToken = crypto.randomBytes(16).toString('hex');
  try {
    const { rows } = await pool.query(
      `INSERT INTO comments (build_id, author_name, text, edit_token)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [req.buildId, authorName, text, editToken]
    );
    res.status(201).json({ id: rows[0].id, authorName, text, createdAt: rows[0].created_at, editToken });
  } catch (e) {
    if (e.code === '23503') return res.status(404).json({ error: 'Build not found.' });
    throw e;
  }
});

app.delete('/api/comments/:id', writeLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'Invalid comment id.');
  const editToken = clean(req.body.editToken, 64);
  if (!editToken) return badRequest(res, 'editToken is required.');
  const { rowCount } = await pool.query('DELETE FROM comments WHERE id = $1 AND edit_token = $2', [id, editToken]);
  if (!rowCount) return res.status(403).json({ error: "That comment doesn't exist, or this browser didn't post it." });
  res.status(204).end();
});

// ------------------------------------------------------------------ misc
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.type('text').send('AutoCircuit Builder community API — see /api/builds'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

migrate()
  .then(() => {
    app.listen(PORT, () => console.log(`Community API listening on :${PORT}`));
  })
  .catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });

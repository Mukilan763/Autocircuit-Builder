# AutoCircuit Builder — Community API

The backend for the app's **🌍 Community** tab: publish a build, browse
everyone else's, like them, comment, and load one into your own canvas to
remix it. This is the one part of AutoCircuit Builder that isn't a static
file — publishing/likes/comments need data shared across everyone, which
`localStorage` (what the rest of the app runs on) can never do.

No accounts. Publishing or commenting just asks for a display name (freely
spoofable, like an old guestbook) and hands back a one-time `editToken`
the browser remembers in `localStorage` — the only thing that lets *you*
delete your own posts later. Nobody else ever sees that token.

## Stack

Plain Express + `pg`, one file (`index.js`), one schema file
(`schema.sql`) applied idempotently (`CREATE TABLE IF NOT EXISTS`) on
every boot — no separate migration step or ORM.

## Deploying your own

1. **Create a Postgres database.** Any Postgres 13+ works; this project
   was built against [Render's free Postgres](https://render.com) tier.
   Note Render's free databases **expire after 30 days** unless upgraded —
   fine for trying this out, not for anything you want to keep running.
2. **Deploy this folder as a web service**, with:
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment variable `DATABASE_URL` set to your Postgres connection
     string (the schema applies itself automatically on first boot).
3. **Point the frontend at it** — set `COMMUNITY_API_BASE` in
   [`js/communityConfig.js`](../js/communityConfig.js) to your deployed
   service's URL. Leave it blank to disable the Community tab gracefully
   instead of erroring against a nonexistent API.

## API

| Method | Path | What |
|---|---|---|
| GET | `/api/builds?domain=&sort=&limit=&offset=` | List published builds |
| GET | `/api/builds/:id` | One build, with its full circuit JSON |
| POST | `/api/builds` | Publish `{title, authorName, domain, description, circuitJson}` → `{id, editToken}` |
| DELETE | `/api/builds/:id` | Delete your own build — body `{editToken}` |
| POST | `/api/builds/:id/like` | Toggle a like — body `{viewerId}` → `{liked, likeCount}` |
| GET | `/api/builds/:id/comments` | List comments |
| POST | `/api/builds/:id/comments` | Add a comment `{authorName, text}` → `{id, editToken}` |
| DELETE | `/api/comments/:id` | Delete your own comment — body `{editToken}` |

Writes are rate-limited (30 / 15 min per IP) and size-capped (title 80
chars, name 40, description 300, comment 500, circuit JSON ~300KB) since
this is a public, unauthenticated, write-capable API — there's no content
moderation beyond that, by design, matching the rest of the app's
"no accounts, keep it simple" philosophy. If you deploy this somewhere
more people will actually see, keep an eye on it.

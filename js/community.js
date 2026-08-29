// community.js — the Community tab: publish a build to a shared backend,
// browse everyone else's, like them, comment, and load one straight into
// your own canvas to remix it. Everything else in this app lives entirely
// in the browser (localStorage); this is the one feature that genuinely
// needs a server, because "other people can see it" isn't something
// localStorage can ever do.
//
// No accounts — publishing or commenting just asks for a display name
// (spoofable, like an old guestbook) and hands back a one-time editToken
// this browser remembers in localStorage, which is the only thing that
// lets you delete your own posts later.
import { catSlug } from './canvas.js';
import { COMMUNITY_API_BASE } from './communityConfig.js';

const MY_TOKENS_KEY = 'autocircuit-community-tokens'; // { builds: {id: token}, comments: {id: token} }
const NAME_KEY = 'autocircuit-community-name';
const VIEWER_KEY = 'autocircuit-community-viewer';

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch (e) { return fallback; }
}
function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function getViewerId() {
  let id = localStorage.getItem(VIEWER_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'v' + Math.random().toString(36).slice(2) + Date.now());
    localStorage.setItem(VIEWER_KEY, id);
  }
  return id;
}

function myTokens() { return readJSON(MY_TOKENS_KEY, { builds: {}, comments: {} }); }
function rememberToken(kind, id, token) {
  const t = myTokens();
  t[kind][id] = token;
  writeJSON(MY_TOKENS_KEY, t);
}
function forgetToken(kind, id) {
  const t = myTokens();
  delete t[kind][id];
  writeJSON(MY_TOKENS_KEY, t);
}

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------- geometry (a
// small, self-contained echo of canvas.js's terminal/wire math, just
// enough to draw a *static* preview — no drag/select/sim machinery needed).
function rotatePoint(x, y, cx, cy, deg) {
  if (!deg) return { x, y };
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = x - cx, dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}
function terminalPos(comp, def, terminalId) {
  const t = def.terminals.find(t => t.id === terminalId);
  if (!t) return null;
  const local = rotatePoint(t.x, t.y, def.w / 2, def.h / 2, comp.rot || 0);
  return { x: comp.x + local.x, y: comp.y + local.y };
}
function wirePath(pa, pb) {
  const dx = (pb.x - pa.x) * 0.5;
  return `M ${pa.x} ${pa.y} C ${pa.x + dx} ${pa.y}, ${pb.x - dx} ${pb.y}, ${pb.x} ${pb.y}`;
}

function buildPreviewSvg(build, partDefs) {
  const comps = (build.circuit_json && build.circuit_json.components) || [];
  const wires = (build.circuit_json && build.circuit_json.wires) || [];
  const byId = {};
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of comps) {
    const def = partDefs[c.type];
    if (!def) continue;
    byId[c.id] = c;
    minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + def.w); maxY = Math.max(maxY, c.y + def.h);
  }
  if (!isFinite(minX)) return null;
  const pad = 24;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
  svg.setAttribute('class', 'build-preview-svg');

  for (const wire of wires) {
    const ca = byId[wire.a.compId], cb = byId[wire.b.compId];
    if (!ca || !cb) continue;
    const pa = terminalPos(ca, partDefs[ca.type], wire.a.terminal);
    const pb = terminalPos(cb, partDefs[cb.type], wire.b.terminal);
    if (!pa || !pb) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', wirePath(pa, pb));
    path.setAttribute('class', 'preview-wire');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
  }
  for (const c of comps) {
    const def = partDefs[c.type];
    if (!def) continue;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `component cat-${catSlug(def.category)}`);
    g.setAttribute('transform', `translate(${c.x},${c.y}) rotate(${c.rot || 0} ${def.w / 2} ${def.h / 2})`);
    g.innerHTML = def.render(c.props, {});
    svg.appendChild(g);
  }
  return svg;
}

async function api(path, opts) {
  let res;
  try {
    res = await fetch(COMMUNITY_API_BASE + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
  } catch (e) {
    throw new Error("Couldn't reach the community server — check your connection and try again.");
  }
  if (res.status === 204) return null;
  let body;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) throw new Error((body && body.error) || `Server error (${res.status})`);
  return body;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createCommunityPage({ stores, partDefs, examples, dom, showToast }) {
  let filterDomain = '';
  let sort = 'new';
  let loaded = false;
  let publishDomain = 'elec'; // which panel's "Publish" button was clicked

  const enabled = !!COMMUNITY_API_BASE;

  function domainLabel(d) { return d === 'mech' ? '⚙️ Mechanical' : '⚡ Electrical'; }

  // ------------------------------------------------------------- publish
  function openPublish(domain) {
    publishDomain = domain;
    dom.publishName.value = localStorage.getItem(NAME_KEY) || '';
    dom.publishTitle.value = '';
    dom.publishDesc.value = '';
    dom.publishError.hidden = true;
    dom.publishModal.classList.add('open');
    dom.publishTitle.focus();
  }
  function closePublish() { dom.publishModal.classList.remove('open'); }

  async function submitPublish() {
    const authorName = dom.publishName.value.trim();
    const title = dom.publishTitle.value.trim();
    const description = dom.publishDesc.value.trim();
    if (!authorName || !title) {
      dom.publishError.textContent = 'Please fill in your name and a title.';
      dom.publishError.hidden = false;
      return;
    }
    const store = stores[publishDomain];
    if (!store.state.components.length) {
      dom.publishError.textContent = "This canvas is empty — build something first!";
      dom.publishError.hidden = false;
      return;
    }
    dom.publishSubmit.disabled = true;
    dom.publishSubmit.textContent = 'Publishing…';
    try {
      const result = await api('/api/builds', {
        method: 'POST',
        body: JSON.stringify({
          title, authorName, description, domain: publishDomain,
          circuitJson: store.toJSON(),
        }),
      });
      localStorage.setItem(NAME_KEY, authorName);
      rememberToken('builds', result.id, result.editToken);
      closePublish();
      if (showToast) showToast('🌍 Published! Check it out on the Community tab.');
      loaded = false; // force a refresh next time the feed is viewed
      if (dom.communityPanel.classList.contains('active')) loadFeed();
    } catch (e) {
      dom.publishError.textContent = e.message;
      dom.publishError.hidden = false;
    } finally {
      dom.publishSubmit.disabled = false;
      dom.publishSubmit.textContent = '🚀 Publish';
    }
  }

  // ---------------------------------------------------------------- feed
  async function loadFeed() {
    if (!enabled) {
      dom.communityStatus.textContent = '';
      dom.communityFeed.innerHTML = '';
      const p = el('p', 'eff-empty', 'The Community backend isn’t configured yet — see server/README.md to deploy your own.');
      dom.communityFeed.appendChild(p);
      return;
    }
    dom.communityStatus.textContent = 'Loading…';
    dom.communityFeed.innerHTML = '';
    try {
      const params = new URLSearchParams({ sort });
      if (filterDomain) params.set('domain', filterDomain);
      const builds = await api('/api/builds?' + params.toString());
      loaded = true;
      dom.communityStatus.textContent = '';
      if (!builds.length) {
        dom.communityFeed.appendChild(el('p', 'eff-empty', 'Nothing published yet — be the first! Use the 🌍 Publish button in either workbench’s toolbar.'));
        return;
      }
      for (const b of builds) dom.communityFeed.appendChild(renderCard(b));
    } catch (e) {
      dom.communityStatus.textContent = '';
      dom.communityFeed.appendChild(el('p', 'warning', '⚠ ' + e.message));
    }
  }

  function renderCard(build) {
    const card = el('div', 'build-card');

    const preview = el('div', 'build-preview');
    const svg = buildPreviewSvg(build, partDefs[build.domain]);
    if (svg) preview.appendChild(svg); else preview.appendChild(el('span', 'build-preview-empty', '🔧'));
    card.appendChild(preview);

    const info = el('div', 'build-info');
    const badge = el('span', `build-domain-badge ${build.domain}`, domainLabel(build.domain));
    info.appendChild(badge);
    info.appendChild(el('h3', 'build-title', build.title));
    info.appendChild(el('p', 'build-author', `by ${build.author_name} · ${timeAgo(build.created_at)}`));
    if (build.description) info.appendChild(el('p', 'build-desc', build.description));

    const actions = el('div', 'build-actions');
    const likeBtn = el('button', 'btn like-btn' + (build._liked ? ' active' : ''), `❤️ ${build.like_count}`);
    likeBtn.addEventListener('click', () => toggleLike(build, likeBtn));
    actions.appendChild(likeBtn);

    const commentBtn = el('button', 'btn', `💬 ${build.comment_count}`);
    const commentsWrap = el('div', 'build-comments');
    commentsWrap.hidden = true;
    let commentsLoaded = false;
    commentBtn.addEventListener('click', () => {
      commentsWrap.hidden = !commentsWrap.hidden;
      if (!commentsWrap.hidden && !commentsLoaded) {
        commentsLoaded = true;
        loadComments(build, commentsWrap, commentBtn);
      }
    });
    actions.appendChild(commentBtn);

    const loadBtn = el('button', 'btn tone-blue', '🚗 Load into my canvas');
    loadBtn.addEventListener('click', () => loadIntoCanvas(build));
    actions.appendChild(loadBtn);

    if (myTokens().builds[build.id]) {
      const delBtn = el('button', 'btn danger', '🗑 Delete');
      delBtn.addEventListener('click', () => deleteBuild(build, card));
      actions.appendChild(delBtn);
    }

    info.appendChild(actions);
    info.appendChild(commentsWrap);
    card.appendChild(info);
    return card;
  }

  async function toggleLike(build, btn) {
    btn.disabled = true;
    try {
      const result = await api(`/api/builds/${build.id}/like`, {
        method: 'POST', body: JSON.stringify({ viewerId: getViewerId() }),
      });
      btn.textContent = `❤️ ${result.likeCount}`;
      btn.classList.toggle('active', result.liked);
    } catch (e) {
      if (showToast) showToast('⚠ ' + e.message);
    } finally {
      btn.disabled = false;
    }
  }

  async function loadComments(build, wrap, commentBtn) {
    wrap.innerHTML = '';
    wrap.appendChild(el('p', 'hint', 'Loading comments…'));
    try {
      const comments = await api(`/api/builds/${build.id}/comments`);
      wrap.innerHTML = '';
      const list = el('div', 'comment-list');
      const mine = myTokens().comments;
      for (const c of comments) {
        const row = el('div', 'comment-row');
        row.appendChild(el('span', 'comment-author', c.author_name));
        row.appendChild(el('span', 'comment-text', c.text));
        row.appendChild(el('span', 'comment-time', timeAgo(c.created_at)));
        if (mine[c.id]) {
          const del = el('button', 'comment-delete', '✕');
          del.title = 'Delete your comment';
          del.addEventListener('click', async () => {
            try {
              await api(`/api/comments/${c.id}`, { method: 'DELETE', body: JSON.stringify({ editToken: mine[c.id] }) });
              forgetToken('comments', c.id);
              row.remove();
              build.comment_count--;
              commentBtn.textContent = `💬 ${build.comment_count}`;
            } catch (e) { if (showToast) showToast('⚠ ' + e.message); }
          });
          row.appendChild(del);
        }
        list.appendChild(row);
      }
      if (!comments.length) list.appendChild(el('p', 'hint', 'No comments yet — say something nice!'));
      wrap.appendChild(list);

      const form = el('div', 'comment-form');
      const nameInput = document.createElement('input');
      nameInput.type = 'text'; nameInput.maxLength = 40; nameInput.placeholder = 'Your name';
      nameInput.value = localStorage.getItem(NAME_KEY) || '';
      const textInput = document.createElement('input');
      textInput.type = 'text'; textInput.maxLength = 500; textInput.placeholder = 'Add a comment…';
      const sendBtn = el('button', 'btn accent', 'Post');
      sendBtn.addEventListener('click', async () => {
        const authorName = nameInput.value.trim(), text = textInput.value.trim();
        if (!authorName || !text) { if (showToast) showToast('Add your name and a comment first.'); return; }
        sendBtn.disabled = true;
        try {
          const c = await api(`/api/builds/${build.id}/comments`, {
            method: 'POST', body: JSON.stringify({ authorName, text }),
          });
          localStorage.setItem(NAME_KEY, authorName);
          rememberToken('comments', c.id, c.editToken);
          textInput.value = '';
          build.comment_count++;
          commentBtn.textContent = `💬 ${build.comment_count}`;
          commentsLoadedRerender();
        } catch (e) { if (showToast) showToast('⚠ ' + e.message); }
        finally { sendBtn.disabled = false; }
      });
      function commentsLoadedRerender() { loadComments(build, wrap, commentBtn); }
      form.appendChild(nameInput);
      form.appendChild(textInput);
      form.appendChild(sendBtn);
      wrap.appendChild(form);
    } catch (e) {
      wrap.innerHTML = '';
      wrap.appendChild(el('p', 'warning', '⚠ ' + e.message));
    }
  }

  function loadIntoCanvas(build) {
    const store = stores[build.domain];
    if (store.state.components.length && !confirm(`Load "${build.title}"? This replaces your current ${domainLabel(build.domain)} circuit.`)) return;
    store.loadFromJSON(build.circuit_json);
    document.querySelector(`.tab-btn[data-tab="${build.domain}"]`).click();
    if (showToast) showToast(`🚗 Loaded "${build.title}" — remix away!`);
  }

  async function deleteBuild(build, card) {
    if (!confirm(`Delete "${build.title}"? This can't be undone.`)) return;
    try {
      await api(`/api/builds/${build.id}`, { method: 'DELETE', body: JSON.stringify({ editToken: myTokens().builds[build.id] }) });
      forgetToken('builds', build.id);
      card.remove();
      if (showToast) showToast('Deleted.');
    } catch (e) {
      if (showToast) showToast('⚠ ' + e.message);
    }
  }

  // ------------------------------------------------------------- wiring
  dom.publishClose.addEventListener('click', closePublish);
  dom.publishModal.addEventListener('click', e => { if (e.target === dom.publishModal) closePublish(); });
  dom.publishSubmit.addEventListener('click', submitPublish);
  for (const domain of Object.keys(dom.publishButtons)) {
    dom.publishButtons[domain].addEventListener('click', () => openPublish(domain));
  }
  dom.communityFilterDomain.addEventListener('change', () => {
    filterDomain = dom.communityFilterDomain.value;
    loadFeed();
  });
  dom.communitySort.addEventListener('change', () => {
    sort = dom.communitySort.value;
    loadFeed();
  });
  dom.communityRefresh.addEventListener('click', loadFeed);

  // Lazy-load: only hit the network once someone actually opens the tab.
  document.querySelector('.tab-btn[data-tab="community"]').addEventListener('click', () => {
    if (!loaded) loadFeed();
  });

  return { loadFeed };
}

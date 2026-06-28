/* ===== Script.js — UI rendering & routing ===== */
const $ = id => document.getElementById(id);
const qs = (s, ctx) => (ctx || document).querySelector(s);
const qsa = (s, ctx) => (ctx || document).querySelectorAll(s);

let STATE = { currentView: 'feed', currentFilter: 'new', currentDateRange: 'all', currentPostId: null, currentCommunity: null };

/* Auth tabs */
document.querySelectorAll('.tab').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    $('form-login').style.display = el.dataset.form === 'login' ? '' : 'none';
    $('form-register').style.display = el.dataset.form === 'register' ? '' : 'none';
  });
});

function authSuccess(username) {
  $('auth-screen').style.display = 'none';
  $('app').style.display = '';
  $('user-badge').textContent = username;
  try { renderSidebar(); } catch(e) { console.error(e); }
  try { renderFeed(); } catch(e) { console.error('Feed error:', e); }
}

/* Login */
$('form-login').addEventListener('submit', e => {
  e.preventDefault();
  const username = $('login-user').value.trim();
  const password = $('login-pass').value;
  const res = API.login(username, password);
  if (res.ok) authSuccess(username);
  else $('login-error').textContent = res.err;
});

/* Register */
$('form-register').addEventListener('submit', e => {
  e.preventDefault();
  const username = $('reg-user').value.trim();
  const password = $('reg-pass').value;
  const confirm = $('reg-confirm').value;
  if (password !== confirm) { $('reg-error').textContent = 'Пароли не совпадают'; return; }
  const res = API.register(username, password);
  if (res.ok) authSuccess(username);
  else $('reg-error').textContent = res.err;
});

/* Logout */
$('btn-logout').addEventListener('click', () => {
  API.logout();
  $('app').style.display = 'none';
  $('auth-screen').style.display = '';
  $('login-user').value = ''; $('login-pass').value = '';
  $('reg-user').value = ''; $('reg-pass').value = ''; $('reg-confirm').value = '';
  $('login-error').textContent = ''; $('reg-error').textContent = '';
});

/* Navigation */
document.querySelectorAll('[data-view]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.view));
});
document.querySelectorAll('.nav-btn[data-view]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.view));
});
$('logo-link').addEventListener('click', () => navigate('feed'));
$('btn-profile').addEventListener('click', () => navigate('profile'));

function navigate(view, data) {
  STATE.currentView = view;
  if (view === 'feed') renderFeed();
  else if (view === 'communities') renderCommunities();
  else if (view === 'create') renderCreatePost();
  else if (view === 'create-community') renderCreateCommunity();
  else if (view === 'profile') renderProfile();
  else if (view === 'post') { STATE.currentPostId = data; renderPostDetail(data); }
  else if (view === 'community') { STATE.currentCommunity = data; renderCommunity(data); }
  else if (view === 'search') renderSearch(data);
}

/* Search */
$('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const q = $('search-input').value.trim();
    if (q) navigate('search', q);
  }
});

/* Sidebar */
function renderSidebar() {
  const container = $('sidebar-communities');
  const comms = API.getUserCommunities();
  if (comms.length === 0) {
    container.innerHTML = '<h3>📌 Мои сообщества</h3><div class="sidebar-link" style="color:var(--text2);font-size:12px">Вы не вступили ни в одно</div>';
    return;
  }
  container.innerHTML = '<h3>📌 Мои сообщества</h3>' + comms.map(c =>
    `<div class="sidebar-link" data-view="community" data-comm="${c.name}"># ${c.displayName}</div>`
  ).join('');
  container.querySelectorAll('[data-comm]').forEach(el => {
    el.addEventListener('click', () => navigate('community', el.dataset.comm));
  });
}

/* Render helpers */
function voteScore(up, down) { return (up || []).length - (down || []).length; }
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч`;
  const days = Math.floor(hrs / 24);
  return `${days} дн`;
}

function getVoteState(votes, user) {
  if (!votes || !user) return 0;
  if (votes.upvotes && votes.upvotes.includes(user)) return 1;
  if (votes.downvotes && votes.downvotes.includes(user)) return -1;
  return 0;
}

/* ===== Date filter helper ===== */
function filterByDate(posts, range) {
  if (range === 'all') return posts;
  const now = Date.now();
  const ms = range === 'day' ? 86400000 : range === 'week' ? 604800000 : range === 'month' ? 2592000000 : 0;
  return posts.filter(p => p.createdAt && (now - p.createdAt) <= ms);
}

/* ===== Feed ===== */
function renderFeed() {
  Loader.show('Загружаем ленту...');
  const container = $('content');
  const filter = STATE.currentFilter;
  const dateRange = STATE.currentDateRange;
  let posts = API.getPosts(filter);
  posts = filterByDate(posts, dateRange);

  container.innerHTML = `
    <div class="sort-bar">
      <button class="sort-btn ${filter==='new'?'active':''}" data-filter="new">🆕 Новые</button>
      <button class="sort-btn ${filter==='hot'?'active':''}" data-filter="hot">🔥 Горячие</button>
      <button class="sort-btn ${filter==='top'?'active':''}" data-filter="top">🏆 Топ</button>
    </div>
    <div class="date-bar">
      <button class="date-btn ${dateRange==='all'?'active':''}" data-range="all">📅 Всё время</button>
      <button class="date-btn ${dateRange==='day'?'active':''}" data-range="day">Сегодня</button>
      <button class="date-btn ${dateRange==='week'?'active':''}" data-range="week">Неделя</button>
      <button class="date-btn ${dateRange==='month'?'active':''}" data-range="month">Месяц</button>
    </div>
    <div id="feed-list"></div>`;

  qsa('.sort-btn').forEach(b => {
    b.addEventListener('click', () => { STATE.currentFilter = b.dataset.filter; renderFeed(); });
  });
  qsa('.date-btn').forEach(b => {
    b.addEventListener('click', () => { STATE.currentDateRange = b.dataset.range; renderFeed(); });
  });

  const list = $('feed-list');
  if (posts.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="big-icon">📭</div><h3>Пока нет постов</h3><p style="color:var(--text2)">Создай первый!</p></div>`;
    Loader.hide();
    return;
  }

  const user = API.getCurrentUser();
  list.innerHTML = posts.map(p => {
    const score = voteScore(p.upvotes, p.downvotes);
    const myVote = getVoteState(p, user ? user.username : null);
    return `<div class="post-card" data-id="${p.id}">
      <div class="post-title">${esc(p.title)}</div>
      ${p.image ? `<img src="${esc(p.image)}" class="post-img" loading="lazy" onclick="event.stopPropagation();window.open(this.src)">` : ''}
      <div class="post-meta">
        <span>#${esc(p.community || 'general')}</span>
        <span>✍️ ${esc(p.author)}</span>
        <span>🕐 ${timeAgo(p.createdAt)}</span>
      </div>
      <div class="post-footer">
        <div class="vote-group">
          <button class="vote-btn ${myVote===1?'upvoted':''}" data-vote="up" data-id="${p.id}">▲</button>
          <span class="vote-count" style="color:${score>0?'var(--upvote)':score<0?'var(--downvote)':''}">${score}</span>
          <button class="vote-btn ${myVote===-1?'downvoted':''}" data-vote="down" data-id="${p.id}">▼</button>
        </div>
        <span>💬 ${p.commentCount || 0}</span>
      </div>
    </div>`;
  }).join('');

  // Post click
  list.querySelectorAll('.post-card').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.vote-btn') || e.target.closest('.post-img')) return;
      navigate('post', el.dataset.id);
    });
  });

  // Vote buttons
  list.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const res = API.votePost(btn.dataset.id, btn.dataset.vote);
      if (res.ok) renderFeed();
    });
  });
  Loader.hide();
}

/* ===== Post Detail ===== */
function renderPostDetail(postId) {
  const post = API.getPost(postId);
  if (!post) { $('content').innerHTML = '<div class="empty-state"><h3>Пост не найден</h3></div>'; return; }

  const user = API.getCurrentUser();
  const score = voteScore(post.upvotes, post.downvotes);
  const myVote = getVoteState(post, user ? user.username : null);
  const currentUser = user ? user.username : null;

  let html = `<div class="post-detail">
    <div class="post-title">${esc(post.title)}</div>
    <div class="post-meta"><span>#${esc(post.community || 'general')}</span> <span>✍️ ${esc(post.author)}</span> <span>🕐 ${timeAgo(post.createdAt)}</span></div>
    ${post.image ? `<img src="${esc(post.image)}" class="post-img" style="max-height:400px;display:block;margin:10px 0" onclick="window.open(this.src)">` : ''}
    <div class="post-body">${esc(post.content)}</div>
    <div class="post-footer" style="border-top:1px solid var(--border);padding-top:8px">
      <div class="vote-group">
        <button class="vote-btn ${myVote===1?'upvoted':''}" data-vote="up" data-id="${post.id}">▲</button>
        <span class="vote-count" style="color:${score>0?'var(--upvote)':score<0?'var(--downvote)':''}">${score}</span>
        <button class="vote-btn ${myVote===-1?'downvoted':''}" data-vote="down" data-id="${post.id}">▼</button>
      </div>
    </div>
  </div>
  <h3 style="margin-bottom:12px;font-size:16px">Комментарии (${post.comments.length})</h3>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <input type="text" id="new-comment" placeholder="Написать комментарий..." style="flex:1;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);outline:none">
    <button class="btn-primary" id="comment-submit" style="width:auto;padding:10px 20px">Отправить</button>
  </div>
  <div class="comments-section" id="comments-list"></div>`;

  $('content').innerHTML = html;

  // Post vote
  qsa('.vote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = API.votePost(post.id, btn.dataset.vote);
      if (res.ok) renderPostDetail(postId);
    });
  });

  // New comment
  $('comment-submit').addEventListener('click', () => {
    const text = $('new-comment').value.trim();
    if (!text) return;
    const res = API.addComment(postId, text);
    if (res.ok) { $('new-comment').value = ''; renderPostDetail(postId); }
  });
  $('new-comment').addEventListener('keydown', e => { if (e.key === 'Enter') $('comment-submit').click(); });

  // Render comments
  renderComments(post.comments, postId, null, $('comments-list'), currentUser);
}

function renderComments(comments, postId, parentId, container, currentUser, depth = 0) {
  const filtered = comments.filter(c => c.parentId === parentId);
  filtered.forEach(c => {
    const score = voteScore(c.upvotes, c.downvotes);
    const myVote = getVoteState(c, currentUser);
    const div = document.createElement('div');
    div.className = `comment ${parentId ? 'reply' : ''}`;
    div.innerHTML = `
      <div class="comment-meta">✍️ ${esc(c.author)} · 🕐 ${timeAgo(c.createdAt)}</div>
      <div class="comment-body">${esc(c.content)}</div>
      <div class="comment-actions">
        <div class="vote-group">
          <button class="vote-btn ${myVote===1?'upvoted':''}" data-vote="up" data-comment="${c.id}">▲</button>
          <span class="vote-count" style="font-size:12px;color:${score>0?'var(--upvote)':score<0?'var(--downvote)':''}">${score}</span>
          <button class="vote-btn ${myVote===-1?'downvoted':''}" data-vote="down" data-comment="${c.id}">▼</button>
        </div>
        <button class="reply-btn" data-comment="${c.id}">↩️ Ответить</button>
      </div>
      <div class="reply-form" id="reply-${c.id}" style="display:none">
        <input type="text" placeholder="Ваш ответ...">
        <button>Ответить</button>
      </div>
      <div class="nested-comments"></div>`;
    container.appendChild(div);

    // Vote comments
    div.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = API.voteComment(postId, btn.dataset.comment, btn.dataset.vote);
        if (res.ok) renderPostDetail(postId);
      });
    });

    // Reply toggle
    div.querySelector('.reply-btn').addEventListener('click', () => {
      const form = div.querySelector('.reply-form');
      form.style.display = form.style.display === 'none' ? '' : 'none';
    });

    // Reply submit
    div.querySelector('.reply-form button').addEventListener('click', () => {
      const input = div.querySelector('.reply-form input');
      const text = input.value.trim();
      if (!text) return;
      const res = API.addComment(postId, text, c.id);
      if (res.ok) { input.value = ''; renderPostDetail(postId); }
    });
    div.querySelector('.reply-form input').addEventListener('keydown', e => {
      if (e.key === 'Enter') div.querySelector('.reply-form button').click();
    });

    // Nested
    const nested = div.querySelector('.nested-comments');
    renderComments(comments, postId, c.id, nested, currentUser, depth + 1);
  });
}

/* ===== Communities ===== */
function renderCommunities() {
  const container = $('content');
  const comms = API.getCommunities();
  const user = API.getCurrentUser();

  container.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h2 style="font-size:20px">🌐 Сообщества</h2>
    <button class="btn-primary" style="width:auto;padding:8px 20px" onclick="navigate('create-community')">+ Создать</button>
  </div>
  <div id="comm-list"></div>`;

  const list = $('comm-list');
  if (comms.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="big-icon">🌐</div><h3>Пока нет сообществ</h3><p style="color:var(--text2)">Создай первое!</p></div>`;
    return;
  }

  list.innerHTML = comms.map(c => {
    const joined = user && c.members && c.members.includes(user.username);
    return `<div class="community-card">
      <div>
        <div class="comm-name"># ${esc(c.displayName)}</div>
        <div class="comm-meta">${esc(c.description)} · 👥 ${(c.members||[]).length} участников</div>
      </div>
      <button class="join-btn ${joined?'joined':''}" data-comm="${c.name}">${joined?'✅ Вступили':'➕ Вступить'}</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.join-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = API.joinCommunity(btn.dataset.comm);
      if (res.ok) renderCommunities();
    });
  });
}

/* ===== Community View ===== */
function renderCommunity(name) {
  const comm = API.getCommunity(name);
  if (!comm) { $('content').innerHTML = '<div class="empty-state"><h3>Сообщество не найдено</h3></div>'; return; }

  STATE.currentCommunity = name;
  const container = $('content');
  const user = API.getCurrentUser();
  const joined = user && comm.members && comm.members.includes(user.username);
  const posts = API.getPosts('new', name);

  container.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <h2 style="font-size:20px"># ${esc(comm.displayName)}</h2>
          <p style="color:var(--text2);font-size:14px;margin-top:6px">${esc(comm.description)}</p>
          <p style="color:var(--text2);font-size:13px;margin-top:4px">👥 ${(comm.members||[]).length} участников</p>
        </div>
        <button class="join-btn ${joined?'joined':''}" data-comm="${name}">${joined?'✅ Вступили':'➕ Вступить'}</button>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <button class="btn-primary" style="width:auto;padding:8px 20px" onclick="navigate('create')">✏️ Создать пост в #${esc(name)}</button>
    </div>
    <div id="feed-list"></div>`;

  qs('.join-btn').addEventListener('click', () => {
    const res = API.joinCommunity(name);
    if (res.ok) renderCommunity(name);
  });

  const list = $('feed-list');
  if (posts.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="big-icon">📭</div><h3>В сообществе пока нет постов</h3></div>`;
    return;
  }

  list.innerHTML = posts.map(p => {
    const score = voteScore(p.upvotes, p.downvotes);
    const myVote = getVoteState(p, user ? user.username : null);
    return `<div class="post-card" data-id="${p.id}">
      <div class="post-title">${esc(p.title)}</div>
      ${p.image ? `<img src="${esc(p.image)}" class="post-img" loading="lazy" onclick="event.stopPropagation();window.open(this.src)">` : ''}
      <div class="post-meta"><span>✍️ ${esc(p.author)}</span> <span>🕐 ${timeAgo(p.createdAt)}</span></div>
      <div class="post-footer">
        <div class="vote-group">
          <button class="vote-btn ${myVote===1?'upvoted':''}" data-vote="up" data-id="${p.id}">▲</button>
          <span class="vote-count" style="color:${score>0?'var(--upvote)':score<0?'var(--downvote)':''}">${score}</span>
          <button class="vote-btn ${myVote===-1?'downvoted':''}" data-vote="down" data-id="${p.id}">▼</button>
        </div>
        <span>💬 ${p.commentCount || 0}</span>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.post-card').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.vote-btn') || e.target.closest('.post-img')) return;
      navigate('post', el.dataset.id);
    });
  });
  list.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const res = API.votePost(btn.dataset.id, btn.dataset.vote);
      if (res.ok) renderCommunity(name);
    });
  });
}

/* ===== Create Post ===== */
function renderCreatePost() {
  const comms = API.getCommunities();
  let imageData = null;

  $('content').innerHTML = `
    <div class="create-form">
      <h2>✏️ Создать пост</h2>
      <input type="text" id="post-title" placeholder="Заголовок">
      <div>
        <button class="create-img-btn" id="img-btn">🖼️ Добавить изображение</button>
        <input type="file" id="img-file" accept="image/*" style="display:none">
        <img id="img-preview" class="img-preview">
        <button class="img-remove-btn" id="img-remove" style="display:none">✕</button>
      </div>
      <textarea id="post-content" placeholder="Текст поста... (поддерживает Markdown-разметку)"></textarea>
      <select id="post-community">
        <option value=""># general (основное)</option>
        ${comms.map(c => `<option value="${c.name}"># ${c.displayName}</option>`).join('')}
      </select>
      <button id="post-submit">Опубликовать</button>
      <p id="post-error" class="error-msg"></p>
    </div>`;

  $('img-btn').addEventListener('click', () => $('img-file').click());
  $('img-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { $('post-error').textContent = 'Максимум 2MB'; return; }
    const reader = new FileReader();
    reader.onload = ev => {
      imageData = ev.target.result;
      $('img-preview').src = imageData;
      $('img-preview').style.display = 'block';
      $('img-remove').style.display = 'inline-block';
    };
    reader.readAsDataURL(file);
  });
  $('img-remove').addEventListener('click', () => {
    imageData = null;
    $('img-preview').style.display = 'none';
    $('img-remove').style.display = 'none';
    $('img-file').value = '';
  });

  $('post-submit').addEventListener('click', () => {
    Loader.show('Публикуем пост...');
    const title = $('post-title').value.trim();
    const content = $('post-content').value.trim();
    const community = $('post-community').value;
    if (!title) { $('post-error').textContent = 'Заголовок обязателен'; Loader.hide(); return; }
    const res = API.createPost(title, content, community, imageData);
    if (res.ok) {
      navigate('post', res.post.id);
    } else {
      $('post-error').textContent = res.err;
    }
    Loader.hide();
  });
}

/* ===== Create Community ===== */
function renderCreateCommunity() {
  $('content').innerHTML = `
    <div class="create-form">
      <h2>🆕 Создать сообщество</h2>
      <input type="text" id="comm-name" placeholder="Название (например: технологии, музыка)">
      <textarea id="comm-desc" placeholder="Описание сообщества" style="min-height:80px"></textarea>
      <button id="comm-submit">Создать</button>
      <p id="comm-error" class="error-msg"></p>
    </div>`;

  $('comm-submit').addEventListener('click', () => {
    const name = $('comm-name').value.trim();
    const desc = $('comm-desc').value.trim();
    if (!name) { $('comm-error').textContent = 'Название обязательно'; return; }
    const res = API.createCommunity(name, desc);
    if (res.ok) navigate('community', res.community.name);
    else $('comm-error').textContent = res.err;
  });
}

/* ===== Profile ===== */
function renderProfile() {
  const user = API.getCurrentUser();
  if (!user) { $('content').innerHTML = '<div class="empty-state"><h3>Не авторизован</h3></div>'; return; }
  const posts = API.getPosts('new').filter(p => p.author === user.username);
  const comms = API.getUserCommunities();

  $('content').innerHTML = `
    <div class="profile-header">
      <h2>👤 ${esc(user.username)}</h2>
      <div class="profile-stats">
        <span>📰 Постов: ${posts.length}</span>
        <span>🌐 Сообществ: ${comms.length}</span>
        <span>🕐 На сайте с ${new Date(user.createdAt).toLocaleDateString('ru-RU')}</span>
      </div>
    </div>
    <h3 style="margin-bottom:12px">Мои посты</h3>
    <div id="profile-posts"></div>`;

  const list = $('profile-posts');
  if (posts.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:30px"><p style="color:var(--text2)">Вы ещё не создали ни одного поста</p></div>';
    return;
  }
  list.innerHTML = posts.map(p => {
    const score = voteScore(p.upvotes, p.downvotes);
    return `<div class="post-card" data-id="${p.id}">
      <div class="post-title">${esc(p.title)}</div>
      ${p.image ? `<img src="${esc(p.image)}" class="post-img" loading="lazy" onclick="event.stopPropagation();window.open(this.src)">` : ''}
      <div class="post-meta"><span>#${esc(p.community||'general')}</span> <span>🕐 ${timeAgo(p.createdAt)}</span></div>
      <div class="post-footer"><span>${score>0?'▲':score<0?'▼':''} ${score}</span> <span>💬 ${p.commentCount||0}</span></div>
    </div>`;
  }).join('');
  list.querySelectorAll('.post-card').forEach(el => {
    el.addEventListener('click', () => navigate('post', el.dataset.id));
  });
}

/* ===== Search ===== */
function renderSearch(query) {
  const results = API.search(query);
  $('content').innerHTML = `
    <h2 style="font-size:18px;margin-bottom:16px">🔍 Результаты по запросу «${esc(query)}»</h2>
    ${results.communities.length ? `<h3 style="font-size:16px;margin-bottom:8px">🌐 Сообщества</h3>
      ${results.communities.map(c => `<div class="community-card" style="cursor:pointer" data-comm="${c.name}">
        <div><div class="comm-name"># ${esc(c.displayName)}</div><div class="comm-meta">${esc(c.description)}</div></div>
      </div>`).join('')}` : ''}
    ${results.posts.length ? `<h3 style="font-size:16px;margin:12px 0 8px">📰 Посты</h3>
      <div id="search-posts">${results.posts.map(p => {
        const score = voteScore(p.upvotes, p.downvotes);
        return `<div class="post-card" data-id="${p.id}">
          <div class="post-title">${esc(p.title)}</div>
          ${p.image ? `<img src="${esc(p.image)}" class="post-img" loading="lazy" onclick="event.stopPropagation();window.open(this.src)">` : ''}
          <div class="post-meta"><span>#${esc(p.community||'general')}</span> <span>✍️ ${esc(p.author)}</span></div>
          <div class="post-footer"><span>${score} очков</span> <span>💬 ${p.commentCount||0}</span></div>
        </div>`;
      }).join('')}</div>` : ''}
    ${results.posts.length === 0 && results.communities.length === 0 ? '<div class="empty-state"><div class="big-icon">🔍</div><h3>Ничего не найдено</h3></div>' : ''}`;

  $('content').querySelectorAll('[data-comm]').forEach(el => {
    el.addEventListener('click', () => navigate('community', el.dataset.comm));
  });
  $('content').querySelectorAll('.post-card').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.post-img')) return;
      navigate('post', el.dataset.id);
    });
  });
}

/* Escape HTML */
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

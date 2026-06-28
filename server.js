/* ===== Server.js — Backend simulation + XOR encryption ===== */
const Server = (() => {
  const KEY = 'DevVault_XOR_2024_Key!';
  const STORAGE = 'devvault_db';
  const SESSION = 'devvault_user';

  // XOR + Base64
  function xorEncode(str, key) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(unescape(encodeURIComponent(out)));
  }

  function xorDecode(encoded, key) {
    try {
      const str = decodeURIComponent(escape(atob(encoded)));
      let out = '';
      for (let i = 0; i < str.length; i++) {
        out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return out;
    } catch { return null; }
  }

  function loadDB() {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { posts: {}, users: {}, communities: {} };
    const json = xorDecode(raw, KEY);
    if (!json) return { posts: {}, users: {}, communities: {} };
    try { return JSON.parse(json); } catch { return { posts: {}, users: {}, communities: {} }; }
  }

  function saveDB(db) {
    const json = JSON.stringify(db);
    const encoded = xorEncode(json, KEY);
    localStorage.setItem(STORAGE, encoded);
  }

  // Current user session
  function getCurrentUser() {
    return sessionStorage.getItem(SESSION) || null;
  }

  function setCurrentUser(username) {
    if (username) sessionStorage.setItem(SESSION, username);
    else sessionStorage.removeItem(SESSION);
  }

  function hashPass(pass) {
    let h = 0;
    for (let i = 0; i < pass.length; i++) { h = ((h << 5) - h) + pass.charCodeAt(i); h |= 0; }
    return 'p' + Math.abs(h).toString(36);
  }

  // API methods
  return {
    // Auth
    register(username, password) {
      const db = loadDB();
      username = username.trim().toLowerCase();
      if (!username || !password) return { ok: false, err: 'Заполните все поля' };
      if (password.length < 3) return { ok: false, err: 'Пароль min 3 символа' };
      if (db.users[username]) return { ok: false, err: 'Пользователь уже существует' };
      db.users[username] = { username, password: hashPass(password), createdAt: Date.now(), joinedComms: [] };
      saveDB(db);
      setCurrentUser(username);
      return { ok: true, user: db.users[username] };
    },

    login(username, password) {
      const db = loadDB();
      username = username.trim().toLowerCase();
      if (!username || !password) return { ok: false, err: 'Заполните все поля' };
      const user = db.users[username];
      if (!user) return { ok: false, err: 'Пользователь не найден' };
      if (user.password !== hashPass(password)) return { ok: false, err: 'Неверный пароль' };
      setCurrentUser(username);
      return { ok: true, user };
    },

    logout() {
      setCurrentUser(null);
    },

    getUser() {
      const user = getCurrentUser();
      if (!user) return null;
      const db = loadDB();
      return db.users[user] || null;
    },

    // Communities
    getCommunities() {
      const db = loadDB();
      return Object.values(db.communities);
    },

    getCommunity(name) {
      const db = loadDB();
      return db.communities[name] || null;
    },

    createCommunity(name, description) {
      const user = getCurrentUser();
      if (!user) return { ok: false, err: 'Не авторизован' };
      const db = loadDB();
      const key = name.trim().toLowerCase().replace(/\s+/g, '_');
      if (db.communities[key]) return { ok: false, err: 'Сообщество уже существует' };
      db.communities[key] = { name: key, displayName: name.trim(), description: description.trim(), createdBy: user, createdAt: Date.now(), members: [user] };
      if (!db.users[user].joinedComms) db.users[user].joinedComms = [];
      if (!db.users[user].joinedComms.includes(key)) db.users[user].joinedComms.push(key);
      saveDB(db);
      return { ok: true, community: db.communities[key] };
    },

    joinCommunity(name) {
      const user = getCurrentUser();
      if (!user) return { ok: false };
      const db = loadDB();
      if (!db.communities[name]) return { ok: false };
      if (!db.communities[name].members) db.communities[name].members = [];
      if (db.communities[name].members.includes(user)) {
        db.communities[name].members = db.communities[name].members.filter(m => m !== user);
        if (db.users[user].joinedComms) db.users[user].joinedComms = db.users[user].joinedComms.filter(c => c !== name);
        saveDB(db);
        return { ok: true, joined: false };
      }
      db.communities[name].members.push(user);
      if (!db.users[user].joinedComms) db.users[user].joinedComms = [];
      if (!db.users[user].joinedComms.includes(name)) db.users[user].joinedComms.push(name);
      saveDB(db);
      return { ok: true, joined: true };
    },

    // Posts
    getPosts(filter = 'all', community = null) {
      try {
        const db = loadDB();
        if (!db.posts) db.posts = {};
        let posts = Object.values(db.posts).sort((a, b) => b.createdAt - a.createdAt);
        if (community) posts = posts.filter(p => p.community === community);
        if (filter === 'hot') posts.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
        if (filter === 'top') posts.sort((a, b) => (b.upvotes - b.downvotes) - (a.upvotes - a.downvotes));
        return posts.map(p => ({ ...p, commentCount: (db.comments && db.comments[p.id] ? db.comments[p.id].length : 0) }));
      } catch(e) { console.error('getPosts error:', e); return []; }
    },

    getPost(id) {
      try {
        const db = loadDB();
        if (!db.posts) db.posts = {};
        const post = db.posts[id];
        if (!post) return null;
        return { ...post, comments: (db.comments && db.comments[id]) || [] };
      } catch(e) { console.error('getPost error:', e); return null; }
    },

    createPost(title, content, community) {
      const user = getCurrentUser();
      if (!user) return { ok: false, err: 'Не авторизован' };
      if (!title.trim()) return { ok: false, err: 'Заголовок обязателен' };
      const db = loadDB();
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      db.posts[id] = { id, title: title.trim(), content: content.trim(), author: user, community: community || 'general', createdAt: Date.now(), upvotes: [], downvotes: [], upvoteCount: 0, downvoteCount: 0 };
      if (!db.comments) db.comments = {};
      db.comments[id] = [];
      saveDB(db);
      return { ok: true, post: db.posts[id] };
    },

    votePost(postId, type) {
      const user = getCurrentUser();
      if (!user) return { ok: false };
      const db = loadDB();
      const post = db.posts[postId];
      if (!post) return { ok: false };
      if (!post.upvotes) post.upvotes = [];
      if (!post.downvotes) post.downvotes = [];
      if (type === 'up') {
        const idx = post.downvotes.indexOf(user);
        if (idx > -1) post.downvotes.splice(idx, 1);
        if (post.upvotes.includes(user)) post.upvotes = post.upvotes.filter(u => u !== user);
        else post.upvotes.push(user);
      } else {
        const idx = post.upvotes.indexOf(user);
        if (idx > -1) post.upvotes.splice(idx, 1);
        if (post.downvotes.includes(user)) post.downvotes = post.downvotes.filter(u => u !== user);
        else post.downvotes.push(user);
      }
      post.upvoteCount = post.upvotes.length;
      post.downvoteCount = post.downvotes.length;
      saveDB(db);
      return { ok: true, upvotes: post.upvoteCount, downvotes: post.downvoteCount };
    },

    // Comments
    addComment(postId, content, parentId = null) {
      const user = getCurrentUser();
      if (!user) return { ok: false, err: 'Не авторизован' };
      if (!content.trim()) return { ok: false, err: 'Комментарий пуст' };
      const db = loadDB();
      if (!db.comments) db.comments = {};
      if (!db.comments[postId]) db.comments[postId] = [];
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const comment = { id, postId, parentId, author: user, content: content.trim(), createdAt: Date.now(), upvotes: [], downvotes: [] };
      db.comments[postId].push(comment);
      if (db.posts[postId]) db.posts[postId].commentCount = (db.posts[postId].commentCount || 0) + 1;
      saveDB(db);
      return { ok: true, comment };
    },

    voteComment(postId, commentId, type) {
      const user = getCurrentUser();
      if (!user) return { ok: false };
      const db = loadDB();
      if (!db.comments || !db.comments[postId]) return { ok: false };
      const comment = db.comments[postId].find(c => c.id === commentId);
      if (!comment) return { ok: false };
      if (type === 'up') {
        const idx = comment.downvotes.indexOf(user);
        if (idx > -1) comment.downvotes.splice(idx, 1);
        if (comment.upvotes.includes(user)) comment.upvotes = comment.upvotes.filter(u => u !== user);
        else comment.upvotes.push(user);
      } else {
        const idx = comment.upvotes.indexOf(user);
        if (idx > -1) comment.upvotes.splice(idx, 1);
        if (comment.downvotes.includes(user)) comment.downvotes = comment.downvotes.filter(u => u !== user);
        else comment.downvotes.push(user);
      }
      saveDB(db);
      return { ok: true, upvotes: comment.upvotes.length, downvotes: comment.downvotes.length };
    },

    // Search
    search(query) {
      const db = loadDB();
      const q = query.toLowerCase();
      const posts = Object.values(db.posts).filter(p => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q));
      const comms = Object.values(db.communities).filter(c => c.displayName.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
      return { posts, communities: comms };
    },

    // Get user's communities
    getUserCommunities() {
      const user = getCurrentUser();
      if (!user) return [];
      const db = loadDB();
      const u = db.users[user];
      if (!u || !u.joinedComms) return [];
      return u.joinedComms.map(name => db.communities[name]).filter(Boolean);
    }
  };
})();

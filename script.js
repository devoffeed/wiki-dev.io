/* ===== Crypto Module ===== */
const CryptoVault = {
  async deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async encrypt(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    const buf = new Uint8Array(16 + 12 + enc.byteLength);
    buf.set(salt); buf.set(iv, 16); buf.set(new Uint8Array(enc), 28);
    return btoa(Array.from(buf, b => String.fromCharCode(b)).join(''));
  },
  async decrypt(ct, password) {
    try {
      const raw = Uint8Array.from(atob(ct), c => c.charCodeAt(0));
      const key = await this.deriveKey(password, raw.slice(0, 16));
      const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(16, 28) }, key, raw.slice(28));
      return JSON.parse(new TextDecoder().decode(dec));
    } catch { return null; }
  },
  async hashSHA256(str) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
};

/* ===== Auth Module ===== */
const Auth = {
  STORAGE_KEY: 'wikidev_vault',
  async register(user, pass) {
    if (!user.trim() || pass.length < 4) return { ok: false, err: 'Пароль min 4 символа' };
    const existing = localStorage.getItem(this.STORAGE_KEY);
    if (existing) {
      const data = await CryptoVault.decrypt(existing, pass);
      if (data) return { ok: false, err: 'Хранилище уже существует. Войдите.' };
    }
    const vault = { user, data: { notes: [], todos: [], contacts: [], bookmarks: [], expenses: [], habits: [] } };
    const ct = await CryptoVault.encrypt(vault, pass);
    localStorage.setItem(this.STORAGE_KEY, ct);
    sessionStorage.setItem('wikidev_session', JSON.stringify({ user }));
    return { ok: true };
  },
  async login(user, pass) {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) return { ok: false, err: 'Хранилище не найдено. Зарегистрируйтесь.' };
    const vault = await CryptoVault.decrypt(stored, pass);
    if (!vault) return { ok: false, err: 'Неверный пароль' };
    if (vault.user !== user) return { ok: false, err: 'Пользователь не найден' };
    sessionStorage.setItem('wikidev_session', JSON.stringify({ user }));
    return { ok: true, data: vault.data };
  },
  logout() { sessionStorage.removeItem('wikidev_session'); },
  async getData(pass) {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) return null;
    const vault = await CryptoVault.decrypt(stored, pass);
    return vault ? vault.data : null;
  },
  async saveData(data, pass) {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) return false;
    const vault = await CryptoVault.decrypt(stored, pass);
    if (!vault) return false;
    vault.data = data;
    const ct = await CryptoVault.encrypt(vault, pass);
    localStorage.setItem(this.STORAGE_KEY, ct);
    return true;
  },
  sessionUser() {
    try { return JSON.parse(sessionStorage.getItem('wikidev_session')).user; } catch { return null; }
  }
};

/* ===== App State ===== */
let APP = {
  pass: '',
  data: { notes: [], todos: [], contacts: [], bookmarks: [], expenses: [], habits: [] },
  currentCat: 'all',
  intervalId: null,
  stopwatchRunning: false,
  stopwatchTime: 0,
  timerRunning: false,
  timerRemaining: 0,
  timerEnd: null
};

/* ===== Tool Definitions ===== */
const TOOLS = [
  // --- Text ---
  { id:'word-count', name:'Счётчик слов', icon:'📊', cat:'text', render:renderWordCount },
  { id:'reverse-text', name:'Реверс текста', icon:'🔄', cat:'text', render:renderReverse },
  { id:'case-converter', name:'Регистр', icon:'🔠', cat:'text', render:renderCase },
  { id:'slugify', name:'Slugify', icon:'🔗', cat:'text', render:renderSlugify },
  { id:'lorem-ipsum', name:'Lorem Ipsum', icon:'📝', cat:'text', render:renderLorem },
  { id:'text-stats', name:'Статистика текста', icon:'📊', cat:'text', render:renderTextStats },
  // --- Crypto ---
  { id:'base64-encode', name:'Base64 Encode', icon:'🔐', cat:'crypto', render:renderB64Enc },
  { id:'base64-decode', name:'Base64 Decode', icon:'🔓', cat:'crypto', render:renderB64Dec },
  { id:'caesar-cipher', name:'Шифр Цезаря', icon:'🗝️', cat:'crypto', render:renderCaesar },
  { id:'hash-gen', name:'Хеш SHA-256', icon:'#️⃣', cat:'crypto', render:renderHash },
  { id:'aes-encrypt', name:'AES Encrypt', icon:'🔒', cat:'crypto', render:renderAESEnc },
  { id:'aes-decrypt', name:'AES Decrypt', icon:'🔑', cat:'crypto', render:renderAESDec },
  { id:'password-gen', name:'Генератор паролей', icon:'🛡️', cat:'crypto', render:renderPassGen },
  // --- Math ---
  { id:'calculator', name:'Калькулятор', icon:'🧮', cat:'math', render:renderCalc },
  { id:'random-num', name:'Случайное число', icon:'🎲', cat:'math', render:renderRandom },
  { id:'unit-length', name:'Конвертер длины', icon:'📏', cat:'math', render:renderLength },
  { id:'unit-temp', name:'Конвертер температуры', icon:'🌡️', cat:'math', render:renderTemp },
  { id:'num-converter', name:'Системы счисления', icon:'🔢', cat:'math', render:renderNumConv },
  // --- Time ---
  { id:'stopwatch', name:'Секундомер', icon:'⏱️', cat:'time', render:renderStopwatch },
  { id:'timer', name:'Таймер', icon:'⏲️', cat:'time', render:renderTimer },
  { id:'date-diff', name:'Разница дат', icon:'📅', cat:'time', render:renderDateDiff },
  { id:'world-clock', name:'Мировое время', icon:'🌍', cat:'time', render:renderWorldClock },
  // --- Data ---
  { id:'notes', name:'Заметки', icon:'📓', cat:'data', render:renderNotes },
  { id:'todo', name:'Список дел', icon:'✅', cat:'data', render:renderTodo },
  { id:'contacts', name:'Контакты', icon:'👤', cat:'data', render:renderContacts },
  { id:'bookmarks', name:'Закладки', icon:'🔖', cat:'data', render:renderBookmarks },
  { id:'expenses', name:'Расходы', icon:'💰', cat:'data', render:renderExpenses },
  { id:'habit-tracker', name:'Привычки', icon:'🌱', cat:'data', render:renderHabits },
  // --- Utility ---
  { id:'dice', name:'Бросить кубик', icon:'🎲', cat:'utility', render:renderDice },
  { id:'coin-flip', name:'Монетка', icon:'🪙', cat:'utility', render:renderCoin },
  { id:'color-converter', name:'Конвертер цветов', icon:'🎨', cat:'utility', render:renderColor },
  { id:'qr-code', name:'QR-код', icon:'📱', cat:'utility', render:renderQR },
  { id:'json-formatter', name:'JSON Formatter', icon:'📋', cat:'utility', render:renderJSON },
  { id:'find-replace', name:'Найти и заменить', icon:'🔍', cat:'utility', render:renderFindReplace },
  { id:'string-inspector', name:'Инспектор строк', icon:'🔬', cat:'utility', render:renderStringInsp }
];

/* ===== UI ===== */
function $(id) { return document.getElementById(id); }

function showScreen(screen) {
  $('auth-screen').style.display = screen === 'auth' ? '' : 'none';
  $('dashboard').style.display = screen === 'dash' ? '' : 'none';
}

function renderTools() {
  const grid = $('tools-grid');
  const q = $('search-input').value.toLowerCase();
  grid.innerHTML = TOOLS.filter(t => (APP.currentCat === 'all' || t.cat === APP.currentCat) && t.name.toLowerCase().includes(q))
    .map(t => `<div class="tool-card" data-id="${t.id}"><span class="icon">${t.icon}</span><div class="name">${t.name}</div><div class="cat-label">${t.cat}</div></div>`).join('');
  grid.querySelectorAll('.tool-card').forEach(el => {
    el.addEventListener('click', () => openTool(el.dataset.id));
  });
}

function openTool(id) {
  const tool = TOOLS.find(t => t.id === id);
  if (!tool) return;
  $('modal-title').textContent = `${tool.icon} ${tool.name}`;
  const body = $('modal-body');
  tool.render(body);
  $('tool-modal').style.display = '';
}

$('modal-close').addEventListener('click', () => {
  if (APP.intervalId) { clearInterval(APP.intervalId); APP.intervalId = null; }
  $('tool-modal').style.display = '';
});
$('tool-modal').addEventListener('click', e => { if (e.target === $('tool-modal')) $('modal-close').click(); });

$('search-input').addEventListener('input', renderTools);

document.querySelectorAll('.cat').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.cat').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    APP.currentCat = el.dataset.cat;
    renderTools();
  });
});

$('btn-lock').addEventListener('click', () => {
  if (APP.intervalId) { clearInterval(APP.intervalId); APP.intervalId = null; }
  Auth.logout(); APP.pass = ''; showScreen('auth');
  $('login-user').value = ''; $('login-pass').value = ''; $('login-error').textContent = '';
});

/* ===== Auth UI ===== */
document.querySelectorAll('.tab').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    $('form-login').style.display = el.dataset.tab === 'login' ? '' : 'none';
    $('form-register').style.display = el.dataset.tab === 'register' ? '' : 'none';
    $('login-error').textContent = ''; $('reg-error').textContent = '';
  });
});

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('login-user').value.trim();
  const pass = $('login-pass').value;
  const res = await Auth.login(user, pass);
  if (res.ok) { APP.pass = pass; APP.data = res.data; enterDashboard(user); }
  else { $('login-error').textContent = res.err; }
});

$('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('reg-user').value.trim();
  const pass = $('reg-pass').value;
  const confirm = $('reg-confirm').value;
  if (pass !== confirm) { $('reg-error').textContent = 'Пароли не совпадают'; return; }
  const res = await Auth.register(user, pass);
  if (res.ok) { APP.pass = pass; APP.data = { notes: [], todos: [], contacts: [], bookmarks: [], expenses: [], habits: [] }; enterDashboard(user); }
  else { $('reg-error').textContent = res.err; }
});

async function enterDashboard(user) {
  showScreen('dash');
  $('user-badge').textContent = `👤 ${user}`;
  renderTools();
}

/* ===== Auto-login check ===== */
(async function init() {
  const user = Auth.sessionUser();
  if (user) {
    $('login-user').value = user;
    showScreen('auth');
  }
})();

/* ===== Persistent data helpers ===== */
async function saveData() {
  await Auth.saveData(APP.data, APP.pass);
}

/* ======================================================================================
   35 TOOL RENDERERS
   ====================================================================================== */

/* 1. Word Counter */
function renderWordCount(body) {
  body.innerHTML = `<textarea id="wc-input" placeholder="Введите текст..."></textarea>
  <div class="output" id="wc-out">Символов: 0 | Слов: 0 | Строк: 0</div>`;
  $('wc-input').addEventListener('input', () => {
    const t = $('wc-input').value;
    $('wc-out').textContent = `Символов: ${t.length} | Слов: ${t.trim() ? t.trim().split(/\s+/).length : 0} | Строк: ${t ? t.split('\n').length : 0}`;
  });
}

/* 2. Reverse Text */
function renderReverse(body) {
  body.innerHTML = `<textarea id="rev-input" placeholder="Введите текст..."></textarea>
  <button class="btn-action" id="rev-btn">Реверс</button>
  <div class="output" id="rev-out"></div>`;
  $('rev-btn').addEventListener('click', () => {
    $('rev-out').textContent = $('rev-input').value.split('').reverse().join('');
  });
}

/* 3. Case Converter */
function renderCase(body) {
  body.innerHTML = `<textarea id="case-input" placeholder="Введите текст..."></textarea>
  <div><button class="btn-action" data-case="upper">ВЕРХНИЙ</button>
  <button class="btn-action" data-case="lower">нижний</button>
  <button class="btn-action" data-case="title">Заглавный</button>
  <button class="btn-action" data-case="sentence">С предложения</button></div>
  <div class="output" id="case-out"></div>`;
  body.querySelectorAll('[data-case]').forEach(b => {
    b.addEventListener('click', () => {
      const t = $('case-input').value;
      const m = b.dataset.case;
      if (m === 'upper') $('case-out').textContent = t.toUpperCase();
      else if (m === 'lower') $('case-out').textContent = t.toLowerCase();
      else if (m === 'title') $('case-out').textContent = t.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
      else $('case-out').textContent = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    });
  });
}

/* 4. Slugify */
function renderSlugify(body) {
  body.innerHTML = `<input type="text" id="slug-input" placeholder="Текст для slug..." />
  <button class="btn-action" id="slug-btn">Slugify</button>
  <div class="output" id="slug-out"></div>`;
  $('slug-btn').addEventListener('click', () => {
    $('slug-out').textContent = $('slug-input').value.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '');
  });
}

/* 5. Lorem Ipsum */
function renderLorem(body) {
  const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
  body.innerHTML = `<div class="row"><div><label>Параграфов</label><input type="number" id="lorem-n" value="1" min="1" max="20"></div>
  <div style="display:flex;align-items:flex-end"><button class="btn-action" id="lorem-btn">Сгенерировать</button></div></div>
  <textarea id="lorem-out" readonly placeholder="Результат..."></textarea>`;
  $('lorem-btn').addEventListener('click', () => {
    const n = Math.min(20, Math.max(1, parseInt($('lorem-n').value) || 1));
    $('lorem-out').value = Array(n).fill(lorem).join('\n\n');
  });
}

/* 6. Text Statistics */
function renderTextStats(body) {
  body.innerHTML = `<textarea id="ts-input" placeholder="Введите текст..."></textarea>
  <div class="output" id="ts-out"></div>`;
  $('ts-input').addEventListener('input', () => {
    const t = $('ts-input').value;
    const chars = t.length;
    const words = t.trim() ? t.trim().split(/\s+/).length : 0;
    const lines = t ? t.split('\n').length : 0;
    const spaces = (t.match(/\s/g) || []).length;
    const letters = (t.match(/[a-zA-Zа-яА-Я]/g) || []).length;
    const digits = (t.match(/\d/g) || []).length;
    const punct = (t.match(/[^\w\s]/g) || []).length;
    const wpm = Math.round(words / 2.5) || 0;
    $('ts-out').innerHTML = `Символов: ${chars} | Слов: ${words} | Строк: ${lines}<br>Пробелов: ${spaces} | Букв: ${letters} | Цифр: ${digits} | Знаков: ${punct}<br>Время чтения: ~${wpm} сек`;
  });
}

/* 7. Base64 Encode */
function renderB64Enc(body) {
  body.innerHTML = `<textarea id="b64e-input" placeholder="Текст для кодирования..."></textarea>
  <button class="btn-action" id="b64e-btn">Encode</button>
  <div class="output" id="b64e-out"></div>`;
  $('b64e-btn').addEventListener('click', () => {
    try { $('b64e-out').textContent = btoa(unescape(encodeURIComponent($('b64e-input').value))); } catch(e) { $('b64e-out').textContent = 'Ошибка: ' + e.message; }
  });
}

/* 8. Base64 Decode */
function renderB64Dec(body) {
  body.innerHTML = `<textarea id="b64d-input" placeholder="Base64 строка..."></textarea>
  <button class="btn-action" id="b64d-btn">Decode</button>
  <div class="output" id="b64d-out"></div>`;
  $('b64d-btn').addEventListener('click', () => {
    try { $('b64d-out').textContent = decodeURIComponent(escape(atob($('b64d-input').value.trim()))); } catch(e) { $('b64d-out').textContent = 'Ошибка: неверная Base64 строка'; }
  });
}

/* 9. Caesar Cipher */
function renderCaesar(body) {
  body.innerHTML = `<textarea id="caesar-input" placeholder="Текст..."></textarea>
  <div class="row"><div><label>Сдвиг</label><input type="number" id="caesar-shift" value="3" min="-26" max="26"></div>
  <div style="display:flex;align-items:flex-end;gap:6px"><button class="btn-action" id="caesar-enc">Зашифровать</button>
  <button class="btn-action" id="caesar-dec">Расшифровать</button></div></div>
  <div class="output" id="caesar-out"></div>`;
  function caesar(str, shift) {
    return str.split('').map(c => {
      if (c >= 'a' && c <= 'z') return String.fromCharCode((c.charCodeAt(0) - 97 + shift + 26) % 26 + 97);
      if (c >= 'A' && c <= 'Z') return String.fromCharCode((c.charCodeAt(0) - 65 + shift + 26) % 26 + 65);
      return c;
    }).join('');
  }
  $('caesar-enc').addEventListener('click', () => {
    const s = parseInt($('caesar-shift').value) || 3;
    $('caesar-out').textContent = caesar($('caesar-input').value, s);
  });
  $('caesar-dec').addEventListener('click', () => {
    const s = parseInt($('caesar-shift').value) || 3;
    $('caesar-out').textContent = caesar($('caesar-input').value, -s);
  });
}

/* 10. Hash Generator */
function renderHash(body) {
  body.innerHTML = `<textarea id="hash-input" placeholder="Текст для хеширования..."></textarea>
  <button class="btn-action" id="hash-btn">SHA-256</button>
  <div class="output" id="hash-out"></div>`;
  $('hash-btn').addEventListener('click', async () => {
    $('hash-out').textContent = await CryptoVault.hashSHA256($('hash-input').value);
  });
}

/* 11. AES Encrypt */
function renderAESEnc(body) {
  body.innerHTML = `<textarea id="aese-input" placeholder="Текст для шифрования..."></textarea>
  <input type="password" id="aese-pass" placeholder="Пароль шифрования">
  <button class="btn-action" id="aese-btn">Зашифровать AES-256</button>
  <div class="output" id="aese-out"></div>`;
  $('aese-btn').addEventListener('click', async () => {
    const pass = $('aese-pass').value;
    if (!pass) { $('aese-out').textContent = 'Введите пароль'; return; }
    try { $('aese-out').textContent = await CryptoVault.encrypt($('aese-input').value, pass); } catch(e) { $('aese-out').textContent = 'Ошибка: ' + e.message; }
  });
}

/* 12. AES Decrypt */
function renderAESDec(body) {
  body.innerHTML = `<textarea id="aesd-input" placeholder="Зашифрованная строка (Base64)..."></textarea>
  <input type="password" id="aesd-pass" placeholder="Пароль">
  <button class="btn-action" id="aesd-btn">Расшифровать</button>
  <div class="output" id="aesd-out"></div>`;
  $('aesd-btn').addEventListener('click', async () => {
    const pass = $('aesd-pass').value;
    if (!pass) { $('aesd-out').textContent = 'Введите пароль'; return; }
    const res = await CryptoVault.decrypt($('aesd-input').value.trim(), pass);
    $('aesd-out').textContent = res !== null ? res : 'Ошибка: неверный пароль или данные';
  });
}

/* 13. Password Generator */
function renderPassGen(body) {
  body.innerHTML = `<div class="row"><div><label>Длина</label><input type="number" id="pg-len" value="16" min="4" max="64"></div>
  <div style="display:flex;align-items:flex-end"><button class="btn-action" id="pg-btn">Сгенерировать</button></div></div>
  <div class="output" id="pg-out"></div>`;
  $('pg-btn').addEventListener('click', () => {
    const len = Math.min(64, Math.max(4, parseInt($('pg-len').value) || 16));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    $('pg-out').textContent = Array.from(arr).map(v => chars[v % chars.length]).join('');
  });
}

/* 14. Calculator */
function renderCalc(body) {
  body.innerHTML = `<div class="output" id="calc-display" style="font-size:28px;text-align:right;min-height:50px">0</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px">
  ${['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+','C','(    )','%','±'].map(s => `<button class="btn-action${s==='='?' green':''}" data-c="${s}">${s}</button>`).join('')}</div>`;
  let expr = '';
  body.querySelectorAll('[data-c]').forEach(b => {
    b.addEventListener('click', () => {
      const c = b.dataset.c;
      if (c === 'C') { expr = ''; $('calc-display').textContent = '0'; }
      else if (c === '=') { try { expr = String(eval(expr) || '0'); $('calc-display').textContent = expr; } catch { $('calc-display').textContent = 'Ошибка'; expr = ''; } }
      else if (c === '±') { if (expr.startsWith('-')) expr = expr.slice(1); else expr = '-' + expr; $('calc-display').textContent = expr || '0'; }
      else if (c === '%') { try { expr = String(parseFloat(eval(expr)) / 100); $('calc-display').textContent = expr; } catch {} }
      else if (c === '(    )') {
        const open = (expr.match(/\(/g)||[]).length, close = (expr.match(/\)/g)||[]).length;
        expr += open > close ? ')' : '(';
        $('calc-display').textContent = expr;
      }
      else { expr += c; $('calc-display').textContent = expr; }
    });
  });
}

/* 15. Random Number */
function renderRandom(body) {
  body.innerHTML = `<div class="row"><div><label>От</label><input type="number" id="rnd-min" value="1"></div>
  <div><label>До</label><input type="number" id="rnd-max" value="100"></div>
  <div style="display:flex;align-items:flex-end"><button class="btn-action" id="rnd-btn">Сгенерировать</button></div></div>
  <div class="output" id="rnd-out" style="font-size:36px;text-align:center">—</div>`;
  $('rnd-btn').addEventListener('click', () => {
    const min = parseInt($('rnd-min').value) || 0;
    const max = parseInt($('rnd-max').value) || 100;
    if (min > max) { $('rnd-out').textContent = 'min > max'; return; }
    $('rnd-out').textContent = Math.floor(Math.random() * (max - min + 1)) + min;
  });
}

/* 16. Length Converter */
function renderLength(body) {
  body.innerHTML = `<div class="row"><div style="flex:2"><input type="number" id="len-val" placeholder="Значение" step="any"></div>
  <div><select id="len-from"><option value="mm">Миллиметры</option><option value="cm" selected>Сантиметры</option><option value="m">Метры</option><option value="km">Километры</option><option value="in">Дюймы</option><option value="ft">Футы</option><option value="mi">Мили</option></select></div>
  <div><select id="len-to"><option value="mm">Миллиметры</option><option value="cm">Сантиметры</option><option value="m" selected>Метры</option><option value="km">Километры</option><option value="in">Дюймы</option><option value="ft">Футы</option><option value="mi">Мили</option></select></div></div>
  <button class="btn-action" id="len-btn">Конвертировать</button>
  <div class="output" id="len-out"></div>`;
  const rates = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, mi: 1609.344 };
  $('len-btn').addEventListener('click', () => {
    const v = parseFloat($('len-val').value);
    if (isNaN(v)) { $('len-out').textContent = 'Введите число'; return; }
    const m = v * rates[$('len-from').value];
    $('len-out').textContent = `${v} ${$('len-from').value} = ${(m / rates[$('len-to').value]).toFixed(6)} ${$('len-to').value}`;
  });
}

/* 17. Temperature Converter */
function renderTemp(body) {
  body.innerHTML = `<div class="row"><div style="flex:2"><input type="number" id="temp-val" placeholder="Температура" step="any"></div>
  <div><select id="temp-from"><option value="C" selected>°C</option><option value="F">°F</option><option value="K">K</option></select></div>
  <div><select id="temp-to"><option value="F" selected>°F</option><option value="C">°C</option><option value="K">K</option></select></div></div>
  <button class="btn-action" id="temp-btn">Конвертировать</button>
  <div class="output" id="temp-out"></div>`;
  $('temp-btn').addEventListener('click', () => {
    const v = parseFloat($('temp-val').value);
    if (isNaN(v)) { $('temp-out').textContent = 'Введите число'; return; }
    const f = $('temp-from').value, t = $('temp-to').value;
    let c = f === 'C' ? v : f === 'F' ? (v - 32) * 5/9 : v - 273.15;
    let result = t === 'C' ? c : t === 'F' ? c * 9/5 + 32 : c + 273.15;
    $('temp-out').textContent = `${v}°${f} = ${result.toFixed(2)}°${t}`;
  });
}

/* 18. Number Base Converter */
function renderNumConv(body) {
  body.innerHTML = `<div class="row"><div style="flex:2"><input type="text" id="numc-val" placeholder="Число"></div>
  <div><select id="numc-from"><option value="2">Bin</option><option value="8">Oct</option><option value="10" selected>Dec</option><option value="16">Hex</option></select></div>
  <div><select id="numc-to"><option value="2">Bin</option><option value="8">Oct</option><option value="10">Dec</option><option value="16" selected>Hex</option></select></div></div>
  <button class="btn-action" id="numc-btn">Конвертировать</button>
  <div class="output" id="numc-out"></div>`;
  $('numc-btn').addEventListener('click', () => {
    const v = $('numc-val').value.trim();
    const from = parseInt($('numc-from').value);
    const to = parseInt($('numc-to').value);
    const dec = parseInt(v, from);
    if (isNaN(dec)) { $('numc-out').textContent = 'Неверное число'; return; }
    $('numc-out').textContent = `${v} (base-${from}) = ${dec.toString(to).toUpperCase()} (base-${to})`;
  });
}

/* 19. Stopwatch */
function renderStopwatch(body) {
  body.innerHTML = `<div class="stopwatch-display" id="sw-display">00:00:00.00</div>
  <div style="text-align:center"><button class="btn-action" id="sw-start">▶ Старт</button>
  <button class="btn-action" id="sw-stop">⏹ Стоп</button>
  <button class="btn-action outline" id="sw-reset">↺ Сброс</button></div>
  <div id="sw-laps" style="margin-top:12px"></div>`;
  let running = false, time = 0, laps = [], interval = null;
  function fmt(ms) {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`;
  }
  function update() { $('sw-display').textContent = fmt(time); }
  $('sw-start').addEventListener('click', () => {
    if (running) return;
    running = true; const start = Date.now() - time;
    interval = setInterval(() => { time = Date.now() - start; update(); }, 20);
    APP.intervalId = interval;
  });
  $('sw-stop').addEventListener('click', () => {
    if (!running) return;
    running = false; clearInterval(interval);
    laps.push(time);
    $('sw-laps').innerHTML = laps.map((l, i) => `<div class="list-item"><span>Круг ${i+1}</span><span>${fmt(l)}</span></div>`).join('') + '<button class="btn-action outline" id="sw-clear-laps">Очистить круги</button>';
    $('sw-clear-laps')?.addEventListener('click', () => { laps = []; $('sw-laps').innerHTML = ''; });
  });
  $('sw-reset').addEventListener('click', () => { running = false; clearInterval(interval); time = 0; laps = []; update(); $('sw-laps').innerHTML = ''; });
}

/* 20. Timer */
function renderTimer(body) {
  body.innerHTML = `<div class="row"><div><label>Часы</label><input type="number" id="tm-h" value="0" min="0" max="99"></div>
  <div><label>Минуты</label><input type="number" id="tm-m" value="1" min="0" max="59"></div>
  <div><label>Секунды</label><input type="number" id="tm-s" value="0" min="0" max="59"></div></div>
  <div class="stopwatch-display" id="tm-display">00:00:00</div>
  <div style="text-align:center"><button class="btn-action" id="tm-start">▶ Старт</button>
  <button class="btn-action" id="tm-stop">⏹ Стоп</button>
  <button class="btn-action outline" id="tm-reset">↺ Сброс</button></div>`;
  let running = false, remaining = 0, interval = null, end = 0;
  function fmt(s) { return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
  function update() {
    remaining = Math.max(0, Math.round((end - Date.now()) / 1000));
    $('tm-display').textContent = fmt(remaining);
    if (remaining <= 0 && running) { running = false; clearInterval(interval); $('tm-display').style.color = 'var(--danger)'; }
  }
  $('tm-start').addEventListener('click', () => {
    if (running) return;
    if (remaining <= 0) {
      const h = parseInt($('tm-h').value)||0, m = parseInt($('tm-m').value)||0, s = parseInt($('tm-s').value)||0;
      remaining = h*3600 + m*60 + s;
      if (remaining <= 0) return;
    }
    $('tm-display').style.color = '';
    running = true; end = Date.now() + remaining * 1000;
    interval = setInterval(update, 200);
    APP.intervalId = interval;
  });
  $('tm-stop').addEventListener('click', () => { running = false; clearInterval(interval); });
  $('tm-reset').addEventListener('click', () => { running = false; clearInterval(interval); remaining = 0; $('tm-display').textContent = '00:00:00'; $('tm-display').style.color = ''; });
}

/* 21. Date Difference */
function renderDateDiff(body) {
  body.innerHTML = `<div class="row"><div><label>Дата 1</label><input type="date" id="dd-1"></div>
  <div><label>Дата 2</label><input type="date" id="dd-2"></div></div>
  <button class="btn-action" id="dd-btn">Вычислить</button>
  <div class="output" id="dd-out"></div>`;
  $('dd-btn').addEventListener('click', () => {
    const d1 = new Date($('dd-1').value), d2 = new Date($('dd-2').value);
    if (isNaN(d1) || isNaN(d2)) { $('dd-out').textContent = 'Выберите обе даты'; return; }
    const ms = Math.abs(d2 - d1);
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const years = Math.floor(days / 365.25);
    const months = Math.floor((days % 365.25) / 30.44);
    $('dd-out').innerHTML = `Разница: ${days} дн ${hours} ч ${minutes} мин<br>≈ ${years} лет ${months} мес`;
  });
}

/* 22. World Clock */
function renderWorldClock(body) {
  const zones = [{name:'Москва',tz:'Europe/Moscow'},{name:'Лондон',tz:'Europe/London'},{name:'Нью-Йорк',tz:'America/New_York'},{name:'Токио',tz:'Asia/Tokyo'},{name:'Пекин',tz:'Asia/Shanghai'},{name:'Сидней',tz:'Australia/Sydney'},{name:'Дубай',tz:'Asia/Dubai'},{name:'Берлин',tz:'Europe/Berlin'},{name:'Париж',tz:'Europe/Paris'},{name:'Лос-Анджелес',tz:'America/Los_Angeles'},{name:'Локальное',tz:Intl.DateTimeFormat().resolvedOptions().timeZone}];
  body.innerHTML = `<div class="world-clock-list" id="wc-list"></div>`;
  function update() {
    $('wc-list').innerHTML = zones.map(z => {
      const t = new Date().toLocaleTimeString('ru-RU', { timeZone: z.tz, hour:'2-digit', minute:'2-digit', second:'2-digit' });
      return `<div class="tz-item"><span>${z.name}</span><span class="time">${t}</span></div>`;
    }).join('');
  }
  update();
  const interval = setInterval(update, 1000);
  APP.intervalId = interval;
}

/* 23. Notes */
function renderNotes(body) {
  const render = () => {
    body.innerHTML = `<div style="margin-bottom:10px"><div class="row"><input type="text" id="note-input" placeholder="Новая заметка...">
    <button class="btn-action green" id="note-add">+</button></div></div><div id="note-list"></div>`;
    APP.data.notes.forEach((n, i) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<span style="flex:1;white-space:pre-wrap">${n.text}</span><button class="del" data-idx="${i}">&times;</button>`;
      $('note-list').appendChild(el);
      el.querySelector('.del').addEventListener('click', async () => {
        APP.data.notes.splice(i, 1); await saveData(); render();
      });
    });
    $('note-add').addEventListener('click', async () => {
      const v = $('note-input').value.trim();
      if (!v) return;
      APP.data.notes.push({ text: v, date: new Date().toISOString() });
      $('note-input').value = '';
      await saveData(); render();
    });
    $('note-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('note-add').click(); });
  };
  render();
}

/* 24. Todo List */
function renderTodo(body) {
  const render = () => {
    body.innerHTML = `<div style="margin-bottom:10px"><div class="row"><input type="text" id="todo-input" placeholder="Новая задача...">
    <button class="btn-action green" id="todo-add">+</button></div></div><div id="todo-list"></div>`;
    APP.data.todos.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<input type="checkbox" ${t.done ? 'checked' : ''} data-idx="${i}" style="margin-right:8px;transform:scale(1.3)">
      <span style="flex:1;${t.done?'text-decoration:line-through;color:var(--text2)':''}">${t.text}</span>
      <button class="del" data-idx="${i}">&times;</button>`;
      $('todo-list').appendChild(el);
      el.querySelector('input[type=checkbox]').addEventListener('change', async function() {
        APP.data.todos[i].done = this.checked; await saveData(); render();
      });
      el.querySelector('.del').addEventListener('click', async () => {
        APP.data.todos.splice(i, 1); await saveData(); render();
      });
    });
    $('todo-add').addEventListener('click', async () => {
      const v = $('todo-input').value.trim();
      if (!v) return;
      APP.data.todos.push({ text: v, done: false });
      $('todo-input').value = '';
      await saveData(); render();
    });
    $('todo-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('todo-add').click(); });
  };
  render();
}

/* 25. Contacts */
function renderContacts(body) {
  const render = () => {
    body.innerHTML = `<div style="margin-bottom:10px;display:grid;grid-template-columns:2fr 2fr 1fr;gap:6px">
      <input type="text" id="cont-name" placeholder="Имя">
      <input type="text" id="cont-phone" placeholder="Телефон">
      <button class="btn-action green" id="cont-add">+</button></div><div id="cont-list"></div>`;
    APP.data.contacts.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<span><strong>${c.name}</strong>${c.phone ? ' — ' + c.phone : ''}</span><button class="del" data-idx="${i}">&times;</button>`;
      $('cont-list').appendChild(el);
      el.querySelector('.del').addEventListener('click', async () => {
        APP.data.contacts.splice(i, 1); await saveData(); render();
      });
    });
    $('cont-add').addEventListener('click', async () => {
      const name = $('cont-name').value.trim(), phone = $('cont-phone').value.trim();
      if (!name) return;
      APP.data.contacts.push({ name, phone });
      $('cont-name').value = ''; $('cont-phone').value = '';
      await saveData(); render();
    });
  };
  render();
}

/* 26. Bookmarks */
function renderBookmarks(body) {
  const render = () => {
    body.innerHTML = `<div style="margin-bottom:10px;display:grid;grid-template-columns:2fr 2fr 1fr;gap:6px">
      <input type="text" id="bm-title" placeholder="Название">
      <input type="text" id="bm-url" placeholder="URL">
      <button class="btn-action green" id="bm-add">+</button></div><div id="bm-list"></div>`;
    APP.data.bookmarks.forEach((b, i) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<span><a href="${b.url}" target="_blank" rel="noopener" style="color:var(--accent)">${b.title}</a></span><button class="del" data-idx="${i}">&times;</button>`;
      $('bm-list').appendChild(el);
      el.querySelector('.del').addEventListener('click', async () => {
        APP.data.bookmarks.splice(i, 1); await saveData(); render();
      });
    });
    $('bm-add').addEventListener('click', async () => {
      const title = $('bm-title').value.trim(), url = $('bm-url').value.trim();
      if (!title || !url) return;
      APP.data.bookmarks.push({ title, url });
      $('bm-title').value = ''; $('bm-url').value = '';
      await saveData(); render();
    });
  };
  render();
}

/* 27. Expenses */
function renderExpenses(body) {
  const render = () => {
    const total = APP.data.expenses.reduce((s, e) => s + e.amount, 0);
    body.innerHTML = `<div style="margin-bottom:10px;display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px">
      <input type="text" id="exp-desc" placeholder="Описание">
      <input type="number" id="exp-amt" placeholder="Сумма" step="0.01">
      <input type="date" id="exp-date">
      <button class="btn-action green" id="exp-add">+</button></div>
      <div class="output" style="font-weight:600">Итого: ${total.toFixed(2)} ₽</div>
      <div id="exp-list"></div>`;
    APP.data.expenses.forEach((e, i) => {
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<span>${e.date || '—'} — ${e.desc}: <strong>${e.amount.toFixed(2)} ₽</strong></span><button class="del" data-idx="${i}">&times;</button>`;
      $('exp-list').appendChild(el);
      el.querySelector('.del').addEventListener('click', async () => {
        APP.data.expenses.splice(i, 1); await saveData(); render();
      });
    });
    $('exp-add').addEventListener('click', async () => {
      const desc = $('exp-desc').value.trim(), amt = parseFloat($('exp-amt').value), date = $('exp-date').value;
      if (!desc || isNaN(amt)) return;
      APP.data.expenses.push({ desc, amount: amt, date });
      $('exp-desc').value = ''; $('exp-amt').value = ''; $('exp-date').value = '';
      await saveData(); render();
    });
  };
  render();
}

/* 28. Habit Tracker */
function renderHabits(body) {
  const render = () => {
    const today = new Date().toISOString().slice(0,10);
    body.innerHTML = `<div style="margin-bottom:10px"><div class="row"><input type="text" id="hab-name" placeholder="Новая привычка...">
    <button class="btn-action green" id="hab-add">+</button></div></div><div id="hab-list"></div>`;
    APP.data.habits.forEach((h, i) => {
      const done = h.dates && h.dates.includes(today);
      const streak = h.dates ? (() => {
        let s = 0; const d = new Date();
        while (h.dates.includes(d.toISOString().slice(0,10))) { s++; d.setDate(d.getDate() - 1); }
        return s;
      })() : 0;
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `<span><strong>${h.name}</strong> 🔥${streak} дн</span>
      <span><button class="btn-action ${done?'outline':'green'}" data-hab="${i}">${done?'✅':'⬜'}</button>
      <button class="del" data-idx="${i}">&times;</button></span>`;
      $('hab-list').appendChild(el);
      el.querySelector('[data-hab]').addEventListener('click', async () => {
        if (!APP.data.habits[i].dates) APP.data.habits[i].dates = [];
        const idx = APP.data.habits[i].dates.indexOf(today);
        if (idx > -1) APP.data.habits[i].dates.splice(idx, 1);
        else APP.data.habits[i].dates.push(today);
        await saveData(); render();
      });
      el.querySelector('.del').addEventListener('click', async () => {
        APP.data.habits.splice(i, 1); await saveData(); render();
      });
    });
    $('hab-add').addEventListener('click', async () => {
      const v = $('hab-name').value.trim();
      if (!v) return;
      APP.data.habits.push({ name: v, dates: [] });
      $('hab-name').value = '';
      await saveData(); render();
    });
    $('hab-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('hab-add').click(); });
  };
  render();
}

/* 29. Dice Roller */
function renderDice(body) {
  body.innerHTML = `<div style="text-align:center">
    <div style="font-size:80px;padding:20px 0" id="dice-result">🎲</div>
    <div class="row" style="justify-content:center"><div><label>Количество</label><input type="number" id="dice-n" value="1" min="1" max="10" style="width:80px"></div>
    <div><label>Граней</label><input type="number" id="dice-s" value="6" min="2" max="100" style="width:80px"></div></div>
    <button class="btn-action" id="dice-btn">Бросить</button>
    <div class="output" id="dice-out"></div></div>`;
  $('dice-btn').addEventListener('click', () => {
    const n = parseInt($('dice-n').value) || 1, s = parseInt($('dice-s').value) || 6;
    const rolls = Array.from({length:n}, () => Math.floor(Math.random() * s) + 1);
    $('dice-result').textContent = rolls.length === 1 ? ['⚀','⚁','⚂','⚃','⚄','⚅'][rolls[0]-1] || '🎲' : '🎲';
    $('dice-out').textContent = rolls.join(', ') + ` (сумма: ${rolls.reduce((a,b)=>a+b,0)})`;
  });
}

/* 30. Coin Flip */
function renderCoin(body) {
  body.innerHTML = `<div style="text-align:center">
    <div style="font-size:80px;padding:20px 0" id="coin-result">🪙</div>
    <div class="row" style="justify-content:center"><button class="btn-action" id="coin-btn">Подбросить</button></div>
    <div class="output" id="coin-out"></div>
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
    <div class="output">Орёл: <span id="coin-heads">0</span></div>
    <div class="output">Решка: <span id="coin-tails">0</span></div></div></div>`;
  let heads = 0, tails = 0;
  $('coin-btn').addEventListener('click', () => {
    if (Math.random() < 0.5) { heads++; $('coin-result').textContent = '👑'; $('coin-out').textContent = 'Орёл!'; }
    else { tails++; $('coin-result').textContent = '🪙'; $('coin-out').textContent = 'Решка!'; }
    $('coin-heads').textContent = heads;
    $('coin-tails').textContent = tails;
  });
}

/* 31. Color Converter */
function renderColor(body) {
  body.innerHTML = `<div class="row"><div style="flex:2"><input type="text" id="col-input" placeholder="#FF0000 или rgb(255,0,0) или hsl(0,100%,50%)"></div>
  <div style="display:flex;align-items:flex-end"><button class="btn-action" id="col-btn">Конвертировать</button></div></div>
  <div class="color-preview" id="col-preview" style="background:#000"></div>
  <div class="output" id="col-out"></div>`;
  $('col-btn').addEventListener('click', () => {
    let v = $('col-input').value.trim();
    let r, g, b;
    // Parse hex
    const hexMatch = v.match(/^#?([0-9a-fA-F]{6})$/);
    if (hexMatch) { const h = hexMatch[1]; r=parseInt(h.slice(0,2),16); g=parseInt(h.slice(2,4),16); b=parseInt(h.slice(4,6),16); }
    // Parse rgb
    const rgbMatch = v.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgbMatch) { r=+rgbMatch[1]; g=+rgbMatch[2]; b=+rgbMatch[3]; }
    // Parse hsl
    const hslMatch = v.match(/hsl\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/);
    if (hslMatch) {
      let h=+hslMatch[1]/360, s=+hslMatch[2]/100, l=+hslMatch[3]/100;
      let c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h*6)%2-1)), m=l-c/2;
      let r1,g1,b1;
      if (h<1/6) [r1,g1,b1]=[c,x,0]; else if (h<2/6) [r1,g1,b1]=[x,c,0]; else if (h<3/6) [r1,g1,b1]=[0,c,x]; else if (h<4/6) [r1,g1,b1]=[0,x,c]; else if (h<5/6) [r1,g1,b1]=[x,0,c]; else [r1,g1,b1]=[c,0,x];
      r=Math.round((r1+m)*255); g=Math.round((g1+m)*255); b=Math.round((b1+m)*255);
    }
    if (r===undefined || g===undefined || b===undefined) { $('col-out').textContent = 'Неверный формат. Используйте #RRGGBB, rgb(r,g,b) или hsl(h,s%,l%)'; return; }
    $('col-preview').style.background = `rgb(${r},${g},${b})`;
    const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`.toUpperCase();
    const hsl = (() => {
      const rn=r/255, gn=g/255, bn=b/255, mx=Math.max(rn,gn,bn), mn=Math.min(rn,gn,bn), d=mx-mn;
      let h, s, l=(mx+mn)/2;
      if (d===0) h=0;
      else if (mx===rn) h=((gn-bn)/d+6)%6;
      else if (mx===gn) h=(bn-rn)/d+2;
      else h=(rn-gn)/d+4;
      h=Math.round(h*60); s=Math.round(d/(1-Math.abs(2*l-1))*100); l=Math.round(l*100);
      return `hsl(${h},${s}%,${l}%)`;
    })();
    $('col-out').innerHTML = `HEX: ${hex}<br>RGB: rgb(${r},${g},${b})<br>HSL: ${hsl}`;
  });
}

/* 32. QR Code */
function renderQR(body) {
  body.innerHTML = `<input type="text" id="qr-input" placeholder="Текст или URL...">
  <button class="btn-action" id="qr-btn">Создать QR</button>
  <div style="text-align:center"><canvas id="qr-canvas" width="256" height="256"></canvas></div>`;
  $('qr-btn').addEventListener('click', () => {
    const text = $('qr-input').value.trim();
    if (!text) return;
    const canvas = $('qr-canvas');
    const ctx = canvas.getContext('2d');
    const size = 256;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    // Simple matrix QR-like code using the input to seed a pattern
    // We use the text to generate a deterministic pattern
    ctx.fillStyle = '#000';
    const hash = text.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const rng = (max) => { return Math.abs((hash * (++seed) * 1103515245 + 12345) % 0x80000000) % max; };
    let seed = 0;
    const modules = 21;
    const cellSize = size / (modules + 2);
    const offset = cellSize;
    // Finder patterns (position detection)
    for (let p of [[0,0],[0,modules-7],[modules-7,0]]) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        if (x===0||x===6||y===0||y===6||(x>=2&&x<=4&&y>=2&&y<=4)) {
          ctx.fillRect(offset + (p[0]+x)*cellSize, offset + (p[1]+y)*cellSize, cellSize, cellSize);
        }
      }
    }
    // Timing patterns
    for (let i = 8; i < modules - 8; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(offset + 6*cellSize, offset + i*cellSize, cellSize, cellSize);
        ctx.fillRect(offset + i*cellSize, offset + 6*cellSize, cellSize, cellSize);
      }
    }
    // Data area
    for (let y = 0; y < modules; y++) {
      for (let x = 0; x < modules; x++) {
        if ((x < 8 && y < 8) || (x >= modules-8 && y < 8) || (x < 8 && y >= modules-8)) continue;
        if (x === 6 || y === 6) continue;
        const bit = (hash * (x+1) * (y+1) + x * 13 + y * 7) % 3 !== 0;
        if (bit) ctx.fillRect(offset + x*cellSize, offset + y*cellSize, cellSize, cellSize);
      }
    }
  });
}

/* 33. JSON Formatter */
function renderJSON(body) {
  body.innerHTML = `<textarea id="json-input" placeholder='{"example": "вставьте JSON"}'></textarea>
  <div><button class="btn-action" id="json-format">Форматировать</button>
  <button class="btn-action" id="json-minify">Минифицировать</button>
  <button class="btn-action outline" id="json-validate">Проверить</button></div>
  <div class="output" id="json-out"></div>`;
  $('json-format').addEventListener('click', () => {
    try { $('json-out').textContent = JSON.stringify(JSON.parse($('json-input').value), null, 2); } catch(e) { $('json-out').textContent = 'Ошибка: ' + e.message; }
  });
  $('json-minify').addEventListener('click', () => {
    try { $('json-out').textContent = JSON.stringify(JSON.parse($('json-input').value)); } catch(e) { $('json-out').textContent = 'Ошибка: ' + e.message; }
  });
  $('json-validate').addEventListener('click', () => {
    try { JSON.parse($('json-input').value); $('json-out').className = 'output good'; $('json-out').textContent = '✅ JSON валиден'; } catch(e) { $('json-out').className = 'output bad'; $('json-out').textContent = '❌ ' + e.message; }
    setTimeout(() => $('json-out').className = 'output', 2000);
  });
}

/* 34. Find & Replace */
function renderFindReplace(body) {
  body.innerHTML = `<textarea id="fr-input" placeholder="Исходный текст..."></textarea>
  <div class="row"><div style="flex:2"><input type="text" id="fr-find" placeholder="Найти..."></div>
  <div style="flex:2"><input type="text" id="fr-replace" placeholder="Заменить на..."></div>
  <div style="display:flex;align-items:flex-end"><button class="btn-action" id="fr-btn">Заменить</button></div></div>
  <div class="output" id="fr-out"></div>`;
  $('fr-btn').addEventListener('click', () => {
    const text = $('fr-input').value;
    const find = $('fr-find').value;
    const replace = $('fr-replace').value;
    if (!find) { $('fr-out').textContent = text; return; }
    const count = (text.match(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    $('fr-out').textContent = text.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
    $('fr-out').innerHTML += `<br><span style="color:var(--text2)">Замен: ${count}</span>`;
  });
}

/* 35. String Inspector */
function renderStringInsp(body) {
  body.innerHTML = `<textarea id="si-input" placeholder="Введите строку..."></textarea>
  <div class="output" id="si-out"></div>`;
  $('si-input').addEventListener('input', () => {
    const s = $('si-input').value;
    if (!s) { $('si-out').textContent = 'Введите строку для анализа'; return; }
    const chars = s.split('').map(c => `'${c}' U+${c.charCodeAt(0).toString(16).padStart(4,'0').toUpperCase()}`).join(', ');
    $('si-out').innerHTML = `Длина: ${s.length}<br>Коды: ${chars}`;
  });
}

/* ===== Loader.js ===== */
const Loader = {
  show(msg) {
    let el = document.getElementById('loader-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loader-overlay';
      el.className = 'loader-overlay';
      el.innerHTML = '<div class="loader-spinner"></div><div class="loader-text" id="loader-text">Загрузка...</div>';
      document.body.appendChild(el);
    }
    if (msg) el.querySelector('#loader-text').textContent = msg;
    el.style.display = 'flex';
  },
  hide() {
    const el = document.getElementById('loader-overlay');
    if (el) el.style.display = 'none';
  }
};

/* ═══ ПДД ПМР — админ-панель ═══ */

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function isLockedOut() {
  const lock = localStorage.getItem(LS_LOCK);
  if (!lock) return false;
  if (Date.now() < parseInt(lock)) return true;
  localStorage.removeItem(LS_LOCK);
  localStorage.removeItem(LS_ATTEMPTS);
  return false;
}

function recordFailedAttempt() {
  const max = config?.admin?.maxAttempts || 5;
  const lockMin = config?.admin?.lockoutMinutes || 15;
  let n = parseInt(localStorage.getItem(LS_ATTEMPTS) || '0') + 1;
  localStorage.setItem(LS_ATTEMPTS, n);
  if (n >= max) {
    localStorage.setItem(LS_LOCK, Date.now() + lockMin * 60 * 1000);
    localStorage.removeItem(LS_ATTEMPTS);
    return `Слишком много попыток. Блокировка на ${lockMin} мин.`;
  }
  return `Неверный пароль. Осталось попыток: ${max - n}`;
}

function hasAdminSession() {
  const s = sessionStorage.getItem(SESSION_KEY);
  if (!s) return false;
  try {
    const { exp } = JSON.parse(s);
    if (Date.now() > exp) { sessionStorage.removeItem(SESSION_KEY); return false; }
    return true;
  } catch { return false; }
}

function createAdminSession() {
  const hours = config?.admin?.sessionHours || 4;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ exp: Date.now() + hours * 3600000 }));
}

function openAdminLogin() {
  if (hasAdminSession()) { showScreen('admin'); renderAdminPanels(); return; }
  if (isLockedOut()) {
    const lock = parseInt(localStorage.getItem(LS_LOCK));
    const min = Math.ceil((lock - Date.now()) / 60000);
    alert(`Вход заблокирован. Подождите ~${min} мин.`);
    return;
  }
  document.getElementById('admin-login-modal').classList.remove('hidden');
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-login-error').classList.add('hidden');
  setTimeout(() => document.getElementById('admin-password').focus(), 100);
}

function closeAdminLogin() {
  document.getElementById('admin-login-modal').classList.add('hidden');
}

async function adminLogin() {
  const pass = document.getElementById('admin-password').value;
  const errEl = document.getElementById('admin-login-error');
  if (!pass) return;
  const hash = await sha256(pass);
  if (hash === config.admin.passwordHash) {
    localStorage.removeItem(LS_ATTEMPTS);
    createAdminSession();
    closeAdminLogin();
    showScreen('admin');
    renderAdminPanels();
  } else {
    errEl.textContent = recordFailedAttempt();
    errEl.classList.remove('hidden');
  }
}

function adminLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  showScreen('home');
}

window.pddAdmin = async function(password) {
  if (!password) { openAdminLogin(); return; }
  if (isLockedOut()) { console.warn('Admin locked out'); return; }
  const hash = await sha256(password);
  if (hash === config.admin.passwordHash) {
    localStorage.removeItem(LS_ATTEMPTS);
    createAdminSession();
    showScreen('admin');
    renderAdminPanels();
    console.info('Admin session started');
  } else {
    console.warn(recordFailedAttempt());
  }
};

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') { e.preventDefault(); openAdminLogin(); }
  if (e.key === 'Enter' && !document.getElementById('admin-login-modal').classList.contains('hidden')) adminLogin();
});

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('admin-panel-' + tab).classList.remove('hidden');
}

function renderAdminPanels() {
  renderAdminSite();
  renderAdminBanners();
  renderAdminQuestions();
  renderAdminSecurity();
}

function renderAdminSite() {
  const s = config.site;
  document.getElementById('admin-panel-site').innerHTML = `
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <label class="block text-xs text-slate-400">Заголовок (eyebrow)</label>
      <input id="adm-eyebrow" value="${esc(s.eyebrow)}" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
      <label class="block text-xs text-slate-400">Главный заголовок</label>
      <input id="adm-title" value="${esc(s.title)}" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
      <label class="block text-xs text-slate-400">Подзаголовок</label>
      <textarea id="adm-subtitle" rows="3" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm">${esc(s.subtitle)}</textarea>
      <label class="block text-xs text-slate-400">Примечание об источнике</label>
      <input id="adm-source" value="${esc(s.sourceNote || '')}" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
      <button onclick="saveAdminSite()" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold">Сохранить</button>
    </div>`;
}

function saveAdminSite() {
  config.site.eyebrow = document.getElementById('adm-eyebrow').value;
  config.site.title = document.getElementById('adm-title').value;
  config.site.subtitle = document.getElementById('adm-subtitle').value;
  config.site.sourceNote = document.getElementById('adm-source').value;
  saveOverrides();
  renderHome();
  alert('Сохранено!');
}

function renderAdminBanners() {
  const panel = document.getElementById('admin-panel-banners');
  panel.innerHTML = `<button onclick="addBanner()" class="mb-3 text-sm bg-indigo-600/80 hover:bg-indigo-500 px-4 py-2 rounded-lg font-semibold">+ Добавить баннер</button>
    <div id="banners-list" class="space-y-3"></div>`;
  document.getElementById('banners-list').innerHTML = (config.banners || []).map((b, i) => bannerEditorHtml(b, i)).join('');
}

function bannerEditorHtml(b, i) {
  return `<div class="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
    <div class="flex justify-between"><span class="text-xs font-bold text-slate-400">Баннер #${i + 1}</span>
      <button onclick="removeBanner(${i})" class="text-xs text-red-400">Удалить</button></div>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="bn-en-${i}" ${b.enabled ? 'checked' : ''}/> Включён</label>
    <select id="bn-pl-${i}" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm">
      <option value="home" ${b.placement === 'home' ? 'selected' : ''}>Главная</option>
      <option value="test" ${b.placement === 'test' ? 'selected' : ''}>Экран теста</option>
    </select>
    <input id="bn-tx-${i}" value="${esc(b.text)}" placeholder="Текст" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
    <input id="bn-lk-${i}" value="${esc(b.link || '')}" placeholder="Ссылка (необязательно)" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
    <div class="flex gap-2">
      <input id="bn-bg-${i}" value="${b.bgColor}" type="color" class="w-12 h-9 rounded cursor-pointer" title="Фон" />
      <input id="bn-fg-${i}" value="${b.textColor}" type="color" class="w-12 h-9 rounded cursor-pointer" title="Текст" />
      <button onclick="saveBanner(${i})" class="flex-1 bg-emerald-600/80 hover:bg-emerald-500 rounded-lg text-sm font-semibold">Сохранить баннер</button>
    </div>
  </div>`;
}

function saveBanner(i) {
  const b = config.banners[i];
  b.enabled = document.getElementById(`bn-en-${i}`).checked;
  b.placement = document.getElementById(`bn-pl-${i}`).value;
  b.text = document.getElementById(`bn-tx-${i}`).value;
  b.link = document.getElementById(`bn-lk-${i}`).value;
  b.bgColor = document.getElementById(`bn-bg-${i}`).value;
  b.textColor = document.getElementById(`bn-fg-${i}`).value;
  saveOverrides();
  renderHome();
  renderAdminBanners();
}

function addBanner() {
  config.banners.push({ id: 'b' + Date.now(), enabled: true, placement: 'home', text: 'Новый баннер', link: '', bgColor: '#1e3a5f', textColor: '#93c5fd' });
  saveOverrides();
  renderAdminBanners();
}

function removeBanner(i) {
  if (!confirm('Удалить баннер?')) return;
  config.banners.splice(i, 1);
  saveOverrides();
  renderAdminBanners();
}

let adminSelectedCat = null;
let adminSelectedQ = 0;

function getAdminQuestions(catId) {
  return testCache[catId]?.questions || [];
}

function renderAdminQuestions() {
  const cats = manifest.categories.filter(c => c.questionCount > 0);
  if (!adminSelectedCat && cats.length) adminSelectedCat = cats[0].id;
  const panel = document.getElementById('admin-panel-questions');
  const catOpts = cats.map(c => {
    const n = testCache[c.id]?.questions?.length ?? c.questionCount;
    return `<option value="${c.id}" ${c.id === adminSelectedCat ? 'selected' : ''}>${esc(c.title)} (${n})</option>`;
  }).join('');
  panel.innerHTML = `
    <div class="flex gap-2 flex-wrap mb-4">
      <select id="adm-cat-select" onchange="adminSelectCat(this.value)" class="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]">${catOpts}</select>
      <button onclick="adminAddQuestion()" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold">+ Вопрос</button>
    </div>
    <div id="adm-q-list" class="flex gap-2 flex-wrap mb-4"></div>
    <div id="adm-q-editor"></div>`;
  if (adminSelectedCat) adminSelectCat(adminSelectedCat);
}

async function adminSelectCat(catId) {
  adminSelectedCat = catId;
  await loadCategoryQuestions(catId);
  const questions = getAdminQuestions(catId);
  const list = document.getElementById('adm-q-list');
  if (!list) return;
  list.innerHTML = questions.map((q, i) =>
    `<button onclick="adminEditQuestion(${i})" class="text-xs px-3 py-1.5 rounded-lg border ${i === adminSelectedQ ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800 border-slate-600'}">${i + 1}</button>`
  ).join('') || '<span class="text-slate-500 text-sm">Нет вопросов</span>';
  if (questions.length) adminEditQuestion(Math.min(adminSelectedQ, questions.length - 1));
  else document.getElementById('adm-q-editor').innerHTML = '<p class="text-slate-500 text-sm">Добавьте первый вопрос</p>';
}

function adminEditQuestion(qi) {
  adminSelectedQ = qi;
  const questions = getAdminQuestions(adminSelectedCat);
  const q = questions[qi];
  document.querySelectorAll('#adm-q-list button').forEach((b, i) => {
    b.className = `text-xs px-3 py-1.5 rounded-lg border ${i === qi ? 'bg-indigo-600 border-indigo-500' : 'bg-slate-800 border-slate-600'}`;
  });
  const ansHtml = q.answers.map((a, i) =>
    `<div class="flex gap-2 items-center">
      <input type="radio" name="adm-correct" value="${i}" ${q.correct === i ? 'checked' : ''} />
      <input id="adm-ans-${i}" value="${esc(a)}" class="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
    </div>`
  ).join('');
  document.getElementById('adm-q-editor').innerHTML = `
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <div class="flex justify-between"><span class="font-bold text-sm">Вопрос ${qi + 1}</span>
        <button onclick="adminDeleteQuestion(${qi})" class="text-xs text-red-400">Удалить</button></div>
      <input id="adm-q-sign" value="${esc(q.sign || '')}" placeholder="Номер знака (1.13)" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
      <textarea id="adm-q-text" rows="2" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm">${esc(q.text)}</textarea>
      <input id="adm-q-image" value="${esc(q.image || '')}" placeholder="images/signs/....svg или images/A_B/....jpg" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
      <div class="space-y-2"><p class="text-xs text-slate-400">Варианты (отметьте правильный):</p>${ansHtml}
        <button onclick="adminAddAnswer(${qi})" class="text-xs text-indigo-400">+ вариант</button></div>
      <textarea id="adm-q-explanation" rows="4" placeholder="Объяснение" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm">${esc(q.explanation || '')}</textarea>
      <button onclick="adminSaveQuestion(${qi})" class="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-lg text-sm font-semibold">Сохранить вопрос</button>
    </div>`;
}

function adminSaveQuestion(qi) {
  const questions = getAdminQuestions(adminSelectedCat);
  const q = questions[qi];
  q.sign = document.getElementById('adm-q-sign').value;
  q.text = document.getElementById('adm-q-text').value;
  q.image = document.getElementById('adm-q-image').value;
  q.explanation = document.getElementById('adm-q-explanation').value;
  q.answers = [];
  let correct = 0;
  document.querySelectorAll('[name="adm-correct"]').forEach((r, i) => {
    const inp = document.getElementById(`adm-ans-${i}`);
    if (inp) { q.answers.push(inp.value); if (r.checked) correct = i; }
  });
  q.correct = correct;
  testCache[adminSelectedCat] = { questions };
  saveOverrides();
  renderHome();
  alert('Вопрос сохранён!');
}

async function adminAddQuestion() {
  await loadCategoryQuestions(adminSelectedCat);
  const questions = getAdminQuestions(adminSelectedCat);
  questions.push({ id: Date.now(), sign: '', text: 'Новый вопрос', image: '', answers: ['Вариант 1', 'Вариант 2', 'Вариант 3'], correct: 0, explanation: '' });
  testCache[adminSelectedCat] = { questions };
  adminSelectedQ = questions.length - 1;
  saveOverrides();
  renderAdminQuestions();
  renderHome();
}

function adminDeleteQuestion(qi) {
  if (!confirm('Удалить вопрос?')) return;
  const questions = getAdminQuestions(adminSelectedCat);
  questions.splice(qi, 1);
  testCache[adminSelectedCat] = { questions };
  adminSelectedQ = 0;
  saveOverrides();
  renderAdminQuestions();
  renderHome();
}

function adminAddAnswer(qi) {
  adminSaveQuestion(qi);
  getAdminQuestions(adminSelectedCat)[qi].answers.push('Новый вариант');
  saveOverrides();
  adminEditQuestion(qi);
}

function renderAdminSecurity() {
  document.getElementById('admin-panel-security').innerHTML = `
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <p class="text-sm text-slate-400">Смена пароля администратора. Пароль хранится как SHA-256 хеш.</p>
      <p class="text-xs text-slate-500">Пароль по умолчанию: <code class="text-amber-300">pddpmr2026</code> — смените после первого входа!</p>
      <input id="adm-new-pass" type="password" placeholder="Новый пароль" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
      <input id="adm-new-pass2" type="password" placeholder="Повторите пароль" class="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
      <button onclick="changeAdminPassword()" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-semibold">Сменить пароль</button>
      <hr class="border-slate-700" />
      <p class="text-xs text-slate-500">Вход: <kbd class="bg-slate-700 px-1 rounded">Ctrl+Shift+A</kbd> или <code class="text-indigo-300">pddAdmin('пароль')</code></p>
    </div>`;
}

async function changeAdminPassword() {
  const p1 = document.getElementById('adm-new-pass').value;
  const p2 = document.getElementById('adm-new-pass2').value;
  if (p1.length < 6) { alert('Минимум 6 символов'); return; }
  if (p1 !== p2) { alert('Пароли не совпадают'); return; }
  config.admin.passwordHash = await sha256(p1);
  saveOverrides();
  alert('Пароль изменён!');
}

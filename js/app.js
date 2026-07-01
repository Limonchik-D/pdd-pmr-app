/* ═══ ПДД ПМР — основное приложение ═══ */
const LS_KEY = 'pdd_pmr_data_v2';
const LS_PROGRESS = 'pdd_pmr_progress_v2';
const PROGRESS_SCHEMA = 2;
const LS_LOCK = 'pdd_pmr_lock_v1';
const LS_ATTEMPTS = 'pdd_pmr_attempts_v1';
const SESSION_KEY = 'pdd_pmr_admin_session';

let config = null;
let manifest = null;
let ticketsManifest = null;
let testCache = {};
let theoryToc = null;
let signsMap = {};
let progress = {};
let selectedGroupId = null;

const state = {
  mode: 'topic',
  examTicketNo: null,
  currentCategory: null,
  questions: [],
  current: 0,
  userAnswers: [],
  explanationOpen: false,
  timerId: null,
  timeLeftSec: 0,
};
let pendingCategoryId = null;

function shouldShowQuestionImage(q) {
  if (!q?.image) return false;
  if (q.image.includes('images/A_B/')) return true;
  if (!q.image.includes('images/signs/')) return true;
  return /(?:знак|табличк|таб\.|разметк|данн(?:ый|ого|ые|ых)\s+знак|эти\s+знак|как(?:ой|ие)\s+знак)/i.test(q.text || '');
}

function iconHtml(name, cls = 'w-5 h-5') {
  return `<i data-lucide="${name}" class="${cls} shrink-0"></i>`;
}

function emojiHtml(emoji, cls = 'text-3xl') {
  return `<span class="app-emoji ${cls}" aria-hidden="true">${emoji || '📁'}</span>`;
}

function groupSymbolHtml(group, cls = 'text-3xl') {
  return emojiHtml(group?.icon, cls);
}

function categorySymbolHtml(category, cls = 'text-2xl') {
  return emojiHtml(category?.icon, cls);
}

function refreshIcons(root) {
  if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { 'stroke-width': 2 }, nameAttr: 'data-lucide', root: root || document });
}

function setNextButton(label, icon = 'arrow-right') {
  const btn = document.getElementById('btn-next');
  btn.innerHTML = `<span>${esc(label)}</span>${iconHtml(icon)}`;
  refreshIcons(btn);
}
async function loadData() {
  const [cfgRes, manRes, tocRes, signsRes, ticketsRes, searchRes] = await Promise.all([
    fetch('data/config.json'),
    fetch('data/manifest.json'),
    fetch('data/theory/toc.json').catch(() => null),
    fetch('data/signs-map.json').catch(() => null),
    fetch('data/tickets/manifest.json').catch(() => null),
    fetch('data/global-search.json').catch(() => null),
  ]);
  config = await cfgRes.json();
  manifest = await manRes.json();
  if (tocRes?.ok) theoryToc = await tocRes.json();
  if (signsRes?.ok) signsMap = await signsRes.json();
  if (ticketsRes?.ok) ticketsManifest = await ticketsRes.json();
  if (searchRes?.ok) globalSearchIndex = await searchRes.json();

  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try {
      const o = JSON.parse(saved);
      if (o.config) config = { ...config, ...o.config, site: { ...config.site, ...o.config?.site }, exam: { ...config.exam, ...o.config?.exam }, marathon: { ...config.marathon, ...o.config?.marathon } };
      if (o.testOverrides) Object.assign(testCache, o.testOverrides);
    } catch (_) {}
  }
  loadProgress();
}

let globalSearchIndex = null;

function loadProgress() {
  try {
    const raw = localStorage.getItem(LS_PROGRESS) || localStorage.getItem('pdd_pmr_progress_v1') || '{}';
    progress = JSON.parse(raw);
    if (!progress.schema) progress.schema = 1;
    if (!progress.history) progress.history = [];
    if (!progress.examTickets) progress.examTickets = {};
  } catch { progress = { schema: PROGRESS_SCHEMA, history: [], examTickets: {} }; }
}

function saveProgress() {
  progress.schema = PROGRESS_SCHEMA;
  try {
    localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
  } catch (e) {
    console.warn('Не удалось сохранить прогресс', e);
  }
}

function pushHistory(entry) {
  if (!progress.history) progress.history = [];
  progress.history.unshift({ ...entry, date: new Date().toISOString() });
  if (progress.history.length > 40) progress.history.length = 40;
}

function recordTopicResult(categoryId, pct, correct, total, passed) {
  const prev = progress[categoryId] || { bestPct: 0, attempts: 0 };
  const cat = manifest.categories.find(c => c.id === categoryId);
  progress[categoryId] = {
    bestPct: Math.max(prev.bestPct, pct),
    attempts: prev.attempts + 1,
    lastPct: pct,
    lastCorrect: correct,
    lastTotal: total,
    lastPassed: passed,
    lastDate: new Date().toISOString(),
  };
  pushHistory({
    mode: 'topic',
    title: cat?.title || categoryId,
    correct,
    total,
    passed,
    pct,
  });
  saveProgress();
}

function recordExamTicketResult(ticketNo, passed, correct, wrong, total) {
  if (!progress.examTickets) progress.examTickets = {};
  const prev = progress.examTickets[ticketNo] || { attempts: 0, passed: false };
  progress.examTickets[ticketNo] = {
    attempts: prev.attempts + 1,
    passed: prev.passed || passed,
    lastPassed: passed,
    lastCorrect: correct,
    lastWrong: wrong,
    lastTotal: total,
    lastDate: new Date().toISOString(),
  };
  const tickets = Object.values(progress.examTickets);
  progress.exam = {
    attempts: tickets.reduce((s, t) => s + t.attempts, 0),
    passed: tickets.filter(t => t.passed).length,
    ticketCount: config.exam?.ticketCount || 40,
  };
  pushHistory({ mode: 'exam', title: `Билет № ${ticketNo}`, correct, total, wrong, passed, ticketNo });
  saveProgress();
}

function recordMarathonProgress(index, total) {
  progress.marathon = {
    lastIndex: index,
    total,
    lastDate: new Date().toISOString(),
    completed: index >= total - 1,
  };
  saveProgress();
}

async function loadCategoryQuestions(id) {
  if (testCache[id]?.questions) return testCache[id].questions;
  const cat = manifest.categories.find(c => c.id === id);
  if (!cat) return [];
  const res = await fetch(`data/${cat.dataFile}`);
  const data = await res.json();
  testCache[id] = { questions: data.questions };
  return data.questions;
}

async function loadAllQuestionsPool() {
  const cats = manifest.categories.filter(c => c.questionCount > 0);
  const parts = await Promise.all(cats.map(async c => {
    const qs = await loadCategoryQuestions(c.id);
    return qs.map(q => ({ ...q, categoryId: c.id, categoryTitle: c.title }));
  }));
  return parts.flat();
}

function saveOverrides() {
  localStorage.setItem(LS_KEY, JSON.stringify({ config, testOverrides: testCache }));
}

function resetOverrides() {
  if (!confirm('Сбросить локальные изменения?')) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
}

function exportData() {
  const blob = new Blob([JSON.stringify({ config, manifest, testOverrides: testCache, progress }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pdd-pmr-export.json';
  a.click();
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.config) config = data.config;
      if (data.testOverrides) Object.assign(testCache, data.testOverrides);
      if (data.progress) { progress = data.progress; saveProgress(); }
      saveOverrides();
      renderHome();
      if (typeof renderAdminPanels === 'function') renderAdminPanels();
      alert('Импорт успешен');
    } catch { alert('Ошибка JSON'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ─── ROUTER ─── */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    const active = b.dataset.screen === name
      || (name === 'group' && b.dataset.screen === 'home')
      || (name === 'exam' && b.dataset.screen === 'home');
    b.classList.toggle('nav-active', active);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─── BANNERS ─── */
function renderBanners(placement, containerId) {
  const el = document.getElementById(containerId);
  if (!el || !config?.banners) { el && (el.innerHTML = ''); return; }
  el.innerHTML = config.banners.filter(b => b.enabled && b.placement === placement).map(b => {
    const inner = `<span class="text-sm font-medium">${esc(b.text)}</span>`;
    const st = `background:${b.bgColor};color:${b.textColor}`;
    return b.link
      ? `<a href="${esc(b.link)}" target="_blank" rel="noopener" class="block text-center rounded-lg px-4 py-2.5" style="${st}">${inner}</a>`
      : `<div class="text-center rounded-lg px-4 py-2.5" style="${st}">${inner}</div>`;
  }).join('');
}

/* ─── HOME ─── */
function renderQuickTests() {
  const ex = config.exam || {};
  const mn = config.marathon || {};
  const ep = progress.exam;
  const mp = progress.marathon;
  const passedTickets = ep?.passed || 0;
  const totalTickets = ex.ticketCount || 40;
  document.getElementById('quick-tests').innerHTML = `
    <div class="bg-gradient-to-br from-amber-950/50 to-slate-800 border border-amber-600/40 rounded-2xl p-5 cursor-pointer hover:border-amber-500/60 transition"
      onclick="openExamScreen()">
      <div class="flex items-start gap-3">
        ${emojiHtml('🎓', 'text-3xl')}
        <div class="flex-1">
          <h3 class="font-bold text-amber-300">${esc(ex.title || 'Экзамен')}</h3>
          <p class="text-slate-400 text-xs mt-1 line-clamp-2">${esc(ex.desc || '')}</p>
          <p class="text-xs text-slate-500 mt-2">${ep ? `Сдано билетов: ${passedTickets} / ${totalTickets}` : '40 билетов · ещё не сдавали'}</p>
        </div>
      </div>
    </div>
    <div class="bg-gradient-to-br from-violet-950/50 to-slate-800 border border-violet-600/40 rounded-2xl p-5 cursor-pointer hover:border-violet-500/60 transition"
      onclick="openMarathonConfirm()">
      <div class="flex items-start gap-3">
        ${emojiHtml('🏃', 'text-3xl')}
        <div class="flex-1">
          <h3 class="font-bold text-violet-300">${esc(mn.title || 'Марафон')}</h3>
          <p class="text-slate-400 text-xs mt-1 line-clamp-2">${esc(mn.desc || '')}</p>
          <p class="text-xs text-slate-500 mt-2">${mp?.lastIndex != null ? `Прогресс: ${mp.lastIndex + 1} / ${mp.total}` : 'Все вопросы базы подряд'}</p>
        </div>
      </div>
    </div>`;
}

function renderHome() {
  document.getElementById('hero-eyebrow').textContent = config.site.eyebrow;
  document.getElementById('hero-title').innerHTML = config.site.title.replace('ПДД ПМР', '<span class="text-indigo-400">ПДД ПМР</span>');
  document.getElementById('hero-subtitle').textContent = config.site.subtitle;
  document.getElementById('source-note').textContent = config.site.sourceNote || '';

  const totalQ = manifest.stats?.questions || 0;
  const topicCount = manifest.categories.filter(c => c.questionCount > 0).length;
  document.getElementById('stat-topics').textContent = manifest.groups.length;
  document.getElementById('stat-questions').textContent = totalQ;

  renderQuickTests();

  const grid = document.getElementById('group-grid');
  grid.innerHTML = manifest.groups.map(g => {
    const tests = manifest.categories.filter(c => c.group === g.id && c.questionCount > 0);
    const qCount = tests.reduce((s, c) => s + c.questionCount, 0);
    return `
      <div class="group-card bg-slate-800 border border-slate-700 rounded-xl p-5 cursor-pointer"
        onclick="openGroup('${g.id}')">
        <div class="mb-3">${groupSymbolHtml(g, 'text-3xl')}</div>
        <h3 class="font-bold text-sm mb-1">${esc(g.title)}</h3>
        <p class="text-slate-400 text-xs leading-relaxed line-clamp-2 mb-4">${esc(g.desc || '')}</p>
        <div class="flex justify-between text-xs text-slate-500 pt-3 border-t border-slate-700/60">
          <span>${tests.length} тестов</span>
          <span>${qCount} вопр.</span>
        </div>
      </div>`;
  }).join('');

  renderBanners('home', 'banners-home');
}

function openGroup(groupId) {
  selectedGroupId = groupId;
  renderGroupScreen();
  showScreen('group');
}

function renderGroupScreen() {
  const g = manifest.groups.find(x => x.id === selectedGroupId);
  if (!g) return;
  const tests = manifest.categories.filter(c => c.group === g.id && c.questionCount > 0);
  document.getElementById('group-header').innerHTML = `
    <div class="flex items-start gap-4">
      ${groupSymbolHtml(g, 'text-4xl')}
      <div>
        <h2 class="text-2xl font-bold">${esc(g.title)}</h2>
        <p class="text-slate-400 text-sm mt-1">${esc(g.desc || '')}</p>
        <p class="text-xs text-slate-500 mt-2">${tests.length} тестов · макс. 30 вопросов в каждом</p>
      </div>
    </div>`;
  document.getElementById('group-tests-grid').innerHTML = tests.map(cat => {
    const pb = progress[cat.id];
    const badge = pb ? `<span class="text-emerald-400/90">Лучший: ${pb.bestPct}%</span>` : '';
    return `
      <div class="bg-slate-800/80 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-4 cursor-pointer transition flex gap-3 items-center"
        onclick="openTestConfirm('${cat.id}')">
        ${categorySymbolHtml(cat, 'text-2xl shrink-0')}
        <div class="flex-1 min-w-0">
          <h4 class="font-semibold text-sm truncate">${esc(cat.title)}</h4>
          <p class="text-xs text-slate-500 truncate">${esc(cat.desc)}</p>
        </div>
        <div class="text-right shrink-0 text-xs">
          <div class="text-indigo-400 font-semibold">${cat.questionCount} вопр.</div>
          ${badge}
        </div>
      </div>`;
  }).join('');
}

/* ─── EXAM (40 билетов) ─── */
let pendingExamTicketNo = null;

function openExamScreen() {
  renderExamScreen();
  showScreen('exam');
}

function renderExamScreen() {
  const ex = config.exam || {};
  const passedCount = progress.exam?.passed || 0;
  const total = ex.ticketCount || 40;
  document.getElementById('exam-header').innerHTML = `
    <div class="flex items-start gap-4">
      ${emojiHtml('🎓', 'text-4xl')}
      <div>
        <h2 class="text-2xl font-bold">${esc(ex.title || 'Экзамен ПДД ПМР')}</h2>
        <p class="text-slate-400 text-sm mt-1">${esc(ex.desc || '')}</p>
        <p class="text-xs text-slate-500 mt-2">Сдано: <strong class="text-emerald-400">${passedCount}</strong> / ${total} билетов · ${ex.questionCount || 20} вопр. · ${ex.timeMinutes || 20} мин · ≤${ex.maxErrors || 2} ошибок</p>
      </div>
    </div>`;

  const tickets = ticketsManifest?.tickets || Array.from({ length: total }, (_, i) => ({ number: i + 1 }));
  document.getElementById('exam-tickets-grid').innerHTML = tickets.map(t => {
    const rec = progress.examTickets?.[t.number];
    const cls = rec?.passed ? 'passed' : rec?.attempts ? 'failed' : '';
    const mark = rec?.passed ? '✓' : '';
    return `<button class="ticket-cell border border-slate-600 bg-slate-800 rounded-xl py-3 sm:py-4 font-bold text-sm sm:text-base ${cls}"
      onclick="openExamTicketConfirm(${t.number})">${t.number}${mark ? `<span class="block text-[10px] text-emerald-400">${mark}</span>` : ''}</button>`;
  }).join('') + `<p class="text-xs text-slate-500 mt-6 col-span-full">Зелёная ячейка — билет сдан · красноватая — была неудачная попытка</p>`;
}

function openExamTicketConfirm(ticketNo) {
  pendingExamTicketNo = ticketNo;
  const ex = config.exam || {};
  document.getElementById('exam-confirm-title').innerHTML = `${emojiHtml('🎓', 'text-2xl')} Билет № ${ticketNo}`;
  document.getElementById('exam-confirm-desc').textContent = ex.desc || '';
  document.getElementById('exam-confirm-time').textContent = ex.timeMinutes || 20;
  document.getElementById('exam-confirm-count').textContent = ex.questionCount || 20;
  document.getElementById('exam-confirm-errors').textContent = ex.maxErrors || 2;
  document.getElementById('exam-confirm-modal').classList.remove('hidden');
}

function closeExamConfirm() {
  pendingExamTicketNo = null;
  document.getElementById('exam-confirm-modal').classList.add('hidden');
}

async function loadExamTicketQuestions(ticketNo) {
  const id = String(ticketNo).padStart(2, '0');
  const res = await fetch(`data/tickets/${id}.json`);
  const data = await res.json();
  return data.questions || [];
}

async function confirmStartExamTicket() {
  const ticketNo = pendingExamTicketNo;
  closeExamConfirm();
  if (!ticketNo) return;
  try {
    const questions = await loadExamTicketQuestions(ticketNo);
    if (!questions.length) throw new Error('empty');
    const ex = config.exam || {};
    state.mode = 'exam';
    state.examTicketNo = ticketNo;
    state.currentCategory = { id: `exam-${ticketNo}`, title: `Билет № ${ticketNo}`, icon: '🎓' };
    state.questions = questions.map(q => ({ ...q, categoryTitle: q.topic || '' }));
    state.current = 0;
    state.userAnswers = new Array(state.questions.length).fill(null);
    state.timeLeftSec = (ex.timeMinutes || 20) * 60;
    setupTestUI();
    startTimer();
    renderQuestion(0);
    showScreen('test');
  } catch (e) {
    alert('Ошибка загрузки билета');
    console.error(e);
  }
}

/* ─── MARATHON ─── */
function openMarathonConfirm() {
  const mn = config.marathon || {};
  const total = manifest.stats?.questions || 0;
  document.getElementById('marathon-confirm-desc').textContent = mn.desc || '';
  document.getElementById('marathon-confirm-count').textContent = total;
  document.getElementById('marathon-confirm-modal').classList.remove('hidden');
}

function closeMarathonConfirm() {
  document.getElementById('marathon-confirm-modal').classList.add('hidden');
}

async function confirmStartMarathon() {
  closeMarathonConfirm();
  try {
    const pool = await loadAllQuestionsPool();
    const saved = progress.marathon;
    state.mode = 'marathon';
    state.currentCategory = { id: 'marathon', title: config.marathon?.title || 'Марафон', icon: '🏃' };
    state.questions = pool;
    state.current = saved?.lastIndex != null && saved.lastIndex < pool.length - 1 ? saved.lastIndex + 1 : 0;
    state.userAnswers = new Array(state.questions.length).fill(null);
    setupTestUI();
    renderQuestion(state.current);
    showScreen('test');
  } catch (e) {
    alert('Ошибка загрузки марафона');
    console.error(e);
  }
}

function startTimer() {
  stopTimer();
  updateTimerDisplay();
  state.timerId = setInterval(() => {
    state.timeLeftSec--;
    updateTimerDisplay();
    if (state.timeLeftSec <= 0) {
      stopTimer();
      showResults(true);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
}

function updateTimerDisplay() {
  const el = document.getElementById('exam-timer');
  const m = Math.floor(state.timeLeftSec / 60);
  const s = state.timeLeftSec % 60;
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('timer-warn', state.timeLeftSec <= 60);
}

function finishExamEarly() {
  const unanswered = state.userAnswers.filter(a => a === null).length;
  if (unanswered > 0 && !confirm(`Не отвечено вопросов: ${unanswered}. Завершить билет?`)) return;
  stopTimer();
  showResults(true);
}

/* ─── TOPIC TEST ─── */
function openTestConfirm(categoryId) {
  const cat = manifest.categories.find(c => c.id === categoryId);
  if (!cat?.questionCount) return;
  pendingCategoryId = categoryId;
  document.getElementById('test-confirm-topic').textContent = cat.title;
  document.getElementById('test-confirm-count').textContent = cat.questionCount;
  document.getElementById('test-confirm-modal').classList.remove('hidden');
}

function closeTestConfirm() {
  pendingCategoryId = null;
  document.getElementById('test-confirm-modal').classList.add('hidden');
}

async function confirmStartTest() {
  const id = pendingCategoryId;
  closeTestConfirm();
  if (id) await startTest(id);
}

async function startTest(categoryId) {
  const cat = manifest.categories.find(c => c.id === categoryId);
  const questions = await loadCategoryQuestions(categoryId);
  if (!cat || !questions.length) return;
  state.mode = 'topic';
  state.currentCategory = { ...cat, questions };
  state.questions = shuffleArray([...questions]);
  state.current = 0;
  state.userAnswers = new Array(state.questions.length).fill(null);
  setupTestUI();
  renderQuestion(0);
  showScreen('test');
}

function setupTestUI() {
  const isExam = state.mode === 'exam';
  const isMarathon = state.mode === 'marathon';
  const isSilent = isExam;
  document.getElementById('test-topic-badge').textContent = state.currentCategory.title;
  document.getElementById('progress-total').textContent = state.questions.length;
  document.getElementById('exam-timer').classList.toggle('hidden', !isExam);
  document.getElementById('test-progress-wrap').classList.toggle('hidden', isExam);
  document.getElementById('exam-nav-wrap').classList.toggle('hidden', !isSilent);
  document.getElementById('btn-finish-exam').classList.toggle('hidden', !isExam);
  document.getElementById('btn-finish-exam').textContent = '✓ Завершить билет';
  renderBanners('test', 'banners-test');
  if (isSilent) renderExamNav();
}

function renderExamNav() {
  const nav = document.getElementById('exam-q-nav');
  nav.innerHTML = state.questions.map((_, i) => {
    const answered = state.userAnswers[i] !== null;
    const current = i === state.current;
    return `<button class="exam-q-nav rounded-lg border border-slate-600 bg-slate-800 flex items-center justify-center font-bold ${answered ? 'answered' : ''} ${current ? 'current' : ''}"
      onclick="goToQuestion(${i})">${i + 1}</button>`;
  }).join('');
}

function goToQuestion(idx) {
  state.current = idx;
  renderQuestion(idx);
  renderExamNav();
}

function renderQuestion(idx) {
  const q = state.questions[idx];
  const total = state.questions.length;
  const isExam = state.mode === 'exam';
  const isMarathon = state.mode === 'marathon';
  const isSilent = isExam;
  const answered = state.userAnswers[idx];

  document.getElementById('progress-fill').style.width = (idx / total * 100) + '%';
  document.getElementById('progress-cur').textContent = idx + 1;
  document.getElementById('question-num').textContent = isSilent
    ? `Вопрос ${idx + 1}${q.categoryTitle ? ' · ' + q.categoryTitle : ''}`
    : `Вопрос ${idx + 1}`;
  document.getElementById('question-text').textContent = q.text;

  const imgWrap = document.getElementById('question-img-wrap');
  if (shouldShowQuestionImage(q)) {
    imgWrap.innerHTML = `<img src="${esc(q.image)}" alt="" class="sign-img max-h-52 mx-auto rounded-lg" />`;
  } else {
    imgWrap.innerHTML = `<div class="text-slate-500 text-sm py-8 text-center flex flex-col items-center gap-2">${iconHtml('file-text', 'w-8 h-8 opacity-40')}<span>Текстовый вопрос</span></div>`;
    refreshIcons(imgWrap);
  }

  const letters = ['А', 'Б', 'В', 'Г'];
  document.getElementById('answers-wrap').innerHTML = q.answers.map((a, i) => {
    let extra = '';
    if (isSilent && answered === i) extra = 'exam-selected';
    else if (!isSilent && answered !== null) {
      if (i === q.correct) extra = 'correct-reveal border-emerald-500 bg-emerald-500/10';
      else if (i === answered) extra = 'border-red-500 bg-red-500/10';
    }
    const disabled = !isSilent && answered !== null;
    return `<button class="answer-btn w-full text-left flex gap-3 items-start bg-slate-800/80 border border-slate-600 hover:border-indigo-500/50 rounded-xl px-4 py-3.5 transition disabled:opacity-70 ${extra}"
      onclick="selectAnswer(${i})" ${disabled ? 'disabled' : ''}>
      <span class="shrink-0 w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold">${letters[i] || i + 1}</span>
      <span class="text-sm pt-0.5">${esc(a)}</span></button>`;
  }).join('');

  const btn = document.getElementById('btn-next');
  const showNext = isExam ? answered !== null : answered !== null;
  btn.classList.toggle('hidden', !showNext);
  btn.classList.toggle('flex', showNext);
  if (showNext) {
    if (idx >= total - 1) {
      setNextButton(
        isSilent ? 'К разбору' : isMarathon ? 'Завершить марафон' : 'Завершить тест',
        isSilent ? 'clipboard-check' : 'check-circle-2'
      );
    } else {
      setNextButton('Следующий вопрос', 'arrow-right');
    }
  }

  if (isSilent) renderExamNav();
}

function selectAnswer(chosen) {
  const q = state.questions[state.current];
  const isSilent = state.mode === 'exam';
  state.userAnswers[state.current] = chosen;

  if (isSilent) {
    renderQuestion(state.current);
    return;
  }

  document.querySelectorAll('.answer-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.correct) btn.classList.add('correct-reveal', 'border-emerald-500', 'bg-emerald-500/10');
    if (i === chosen && chosen !== q.correct) btn.classList.add('border-red-500', 'bg-red-500/10');
  });
  const btn = document.getElementById('btn-next');
  btn.classList.remove('hidden');
  btn.classList.add('flex');
}

function nextQuestion() {
  if (state.mode === 'marathon') recordMarathonProgress(state.current, state.questions.length);
  if (state.current >= state.questions.length - 1) {
    if (state.mode === 'exam') stopTimer();
    showResults();
    return;
  }
  state.current++;
  renderQuestion(state.current);
}

function showResults(fromTimeout) {
  const qs = state.questions, ua = state.userAnswers;
  const correct = ua.filter((a, i) => a === qs[i].correct).length;
  const wrong = ua.filter((a, i) => a !== null && a !== qs[i].correct).length;
  const skipped = ua.filter(a => a === null).length;
  const total = qs.length;
  const pct = Math.round(correct / total * 100);
  const isExam = state.mode === 'exam';
  const isMarathon = state.mode === 'marathon';
  const maxErrors = config.exam?.maxErrors ?? 2;
  const passed = isExam
    ? wrong <= maxErrors && skipped === 0
    : isMarathon
      ? null
      : pct >= 70;

  document.getElementById('results-topic-label').textContent = isExam
    ? `${state.currentCategory.title}${fromTimeout ? ' · время вышло' : ''}`
    : isMarathon
      ? `Марафон · ${correct} верных из ${total}`
      : `Тема: ${state.currentCategory.title}`;

  const verdict = document.getElementById('results-verdict');
  const scoreLine = document.getElementById('results-score-line');
  const rulesLine = document.getElementById('results-rules-line');
  const statusLine = document.getElementById('results-status-line');

  scoreLine.textContent = `Пройдено: ${correct}/${total}`;
  if (isExam) {
    rulesLine.textContent = `Допускается не более ${maxErrors} ${pluralErrors(maxErrors)}`;
    statusLine.textContent = passed ? 'Экзамен сдан' : 'Экзамен не сдан';
    statusLine.className = 'text-lg font-bold ' + (passed ? 'pass' : 'fail');
    verdict.className = 'mb-6 mx-auto max-w-lg rounded-2xl border px-6 py-5 text-left ' + (passed ? 'results-verdict-pass' : 'results-verdict-fail');
  } else if (isMarathon) {
    rulesLine.textContent = 'Марафон завершён — все вопросы базы';
    statusLine.textContent = `Результат: ${pct}% верных`;
    statusLine.className = 'text-lg font-bold text-violet-300';
    verdict.className = 'mb-6 mx-auto max-w-lg rounded-2xl border px-6 py-5 text-left border-violet-500/40 bg-violet-500/10';
    recordMarathonProgress(state.questions.length - 1, total);
  } else {
    rulesLine.textContent = 'Не менее 70% правильных ответов';
    statusLine.textContent = passed ? 'Тест пройден' : 'Тест не пройден';
    statusLine.className = 'text-lg font-bold ' + (passed ? 'pass' : 'fail');
    verdict.className = 'mb-6 mx-auto max-w-lg rounded-2xl border px-6 py-5 text-left ' + (passed ? 'results-verdict-pass' : 'results-verdict-fail');
  }

  document.getElementById('score-correct').textContent = correct;
  document.getElementById('score-wrong').textContent = wrong + (skipped ? ` (+${skipped} без ответа)` : '');
  document.getElementById('score-total').textContent = total;
  document.getElementById('score-pct').textContent = pct + '%';

  const ring = document.getElementById('ring-fill');
  ring.style.stroke = isMarathon ? '#8b5cf6' : (passed ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444');
  ring.style.strokeDashoffset = 327 - (327 * pct / 100);

  if (isExam) recordExamTicketResult(state.examTicketNo, passed, correct, wrong, total);
  else if (!isMarathon) recordTopicResult(state.currentCategory.id, pct, correct, total, passed);

  document.getElementById('q-grid').innerHTML = qs.map((q, i) => {
    const answered = ua[i] !== null;
    const ok = ua[i] === q.correct;
    const cls = !answered ? 'q-tile-skip' : ok ? 'q-tile-correct' : 'q-tile-wrong';
    return `<button class="q-tile ${cls} rounded-lg py-2.5 text-sm" onclick="openReview(${i})">${i + 1}</button>`;
  }).join('');

  document.getElementById('review-panel').classList.add('hidden');
  document.getElementById('explanation-box').classList.add('hidden');
  const btnExam = document.getElementById('btn-results-exam');
  if (btnExam) btnExam.classList.toggle('hidden', !isExam);
  renderQuickTests();
  showScreen('results');
}

function openReview(qi) {
  const q = state.questions[qi], ua = state.userAnswers[qi];
  const letters = ['А', 'Б', 'В', 'Г'];
  document.querySelectorAll('.q-tile').forEach(t => t.classList.remove('q-tile-active'));
  document.getElementById('q-grid').children[qi]?.classList.add('q-tile-active');
  document.getElementById('review-q-num').textContent = qi + 1;
  document.getElementById('review-q-text').textContent = q.categoryTitle
    ? `[${q.categoryTitle}] ${q.text}` : q.text;
  document.getElementById('review-answers-wrap').innerHTML = q.answers.map((a, i) => {
    const isC = i === q.correct, isU = i === ua;
    let cls = 'bg-slate-800/60 border-slate-600', icon = '○', ic = 'text-slate-500', lb = '';
    if (isC) { cls = 'bg-emerald-500/10 border-emerald-500/40'; icon = '✓'; ic = 'text-emerald-400'; lb = isU ? ' · верно' : ' · правильный'; }
    else if (isU) { cls = 'bg-red-500/10 border-red-500/40'; icon = '✗'; ic = 'text-red-400'; lb = ' · ваш ответ'; }
    return `<div class="flex gap-2 border rounded-lg px-3 py-2.5 text-sm ${cls}">
      <span class="${ic}">${icon}</span><span><strong>${letters[i] || i + 1}.</strong> ${esc(a)}<em class="text-xs opacity-70">${lb}</em></span></div>`;
  }).join('');
  document.getElementById('explanation-text').textContent = q.explanation || '';
  document.getElementById('explanation-box').classList.add('hidden');
  document.getElementById('btn-explain').textContent = '💡 Объяснение';
  document.getElementById('review-panel').classList.remove('hidden');
  document.getElementById('review-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function toggleExplanation() {
  state.explanationOpen = !state.explanationOpen;
  document.getElementById('explanation-box').classList.toggle('hidden', !state.explanationOpen);
  document.getElementById('btn-explain').textContent = state.explanationOpen ? '🔼 Скрыть' : '💡 Объяснение';
}

function retryTest() {
  if (state.mode === 'exam' && state.examTicketNo) openExamTicketConfirm(state.examTicketNo);
  else if (state.mode === 'marathon') openMarathonConfirm();
  else if (state.currentCategory) startTest(state.currentCategory.id);
}

function exitTest() {
  const wasExam = state.mode === 'exam';
  const wasMarathon = state.mode === 'marathon';
  if (wasExam && state.timerId) {
    if (!confirm('Выйти из билета? Прогресс не сохранится.')) return;
    stopTimer();
  } else if (wasMarathon) {
    recordMarathonProgress(state.current, state.questions.length);
  }
  state.mode = 'topic';
  showScreen(wasExam ? 'exam' : 'home');
}

/* ─── THEORY ─── */
let theorySearchIndex = null;
let theoryCurrentChapterId = null;

function buildTheoryNavHtml(onChapterClick) {
  const click = onChapterClick || "loadTheoryChapter";
  const parents = { signs: 'Дорожные знаки', marking: 'Дорожная разметка', appendix: 'Приложения' };
  let html = '';
  let lastParent = null;
  for (const ch of theoryToc.chapters) {
    if (ch.parent && ch.parent !== lastParent) {
      html += `<div class="theory-parent text-xs font-bold text-indigo-400 uppercase px-3 pt-3 pb-1">${parents[ch.parent] || ch.parent}</div>`;
      lastParent = ch.parent;
    } else if (!ch.parent) lastParent = null;
    const pad = ch.parent ? 'pl-5' : '';
    html += `<button class="theory-link w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-slate-700/80 transition ${pad}"
      data-id="${ch.id}" onclick="${click}('${ch.id}')">${esc(ch.title)}</button>`;
  }
  return html;
}

function renderTheorySidebar() {
  const sb = document.getElementById('theory-sidebar');
  const drawerNav = document.getElementById('theory-drawer-nav');
  if (!theoryToc) {
    const loading = '<p class="p-4 text-slate-500 text-sm">Загрузка оглавления…</p>';
    if (sb) sb.innerHTML = loading;
    if (drawerNav) drawerNav.innerHTML = loading;
    return;
  }
  const header = `<div class="p-4 border-b border-slate-700">
    <h2 class="font-bold text-sm">${esc(theoryToc.title)}</h2>
    <p class="text-xs text-slate-500 mt-1">${esc(theoryToc.subtitle)}</p>
    <input id="theory-search" type="search" placeholder="Поиск по теории…"
      class="mt-3 w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
      oninput="filterTheorySearch(this.value)" />
    <p id="theory-search-hint" class="hidden text-xs text-indigo-400 mt-2"></p>
  </div>`;
  const nav = buildTheoryNavHtml('loadTheoryChapter');
  if (sb) sb.innerHTML = header + `<nav id="theory-nav" class="p-2 space-y-0.5 pb-4">${nav}</nav>`;
  if (drawerNav) drawerNav.innerHTML = nav;
  refreshIcons(document.getElementById('screen-theory'));
}

function openTheoryDrawer() {
  document.getElementById('theory-drawer')?.classList.remove('-translate-x-full');
  document.getElementById('theory-drawer-overlay')?.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}

function closeTheoryDrawer() {
  document.getElementById('theory-drawer')?.classList.add('-translate-x-full');
  document.getElementById('theory-drawer-overlay')?.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}

async function loadTheorySearchIndex() {
  if (theorySearchIndex) return;
  try {
    const res = await fetch('data/theory/search-index.json');
    if (res.ok) theorySearchIndex = await res.json();
  } catch (_) {}
}

function filterTheorySearch(query) {
  const q = query.trim().toLowerCase();
  const desktopSearch = document.getElementById('theory-search');
  const mobileSearch = document.getElementById('theory-search-mobile');
  if (desktopSearch && document.activeElement !== desktopSearch) desktopSearch.value = query;
  if (mobileSearch && document.activeElement !== mobileSearch) mobileSearch.value = query;
  const links = document.querySelectorAll('.theory-link');
  const parents = document.querySelectorAll('.theory-parent');
  const hint = document.getElementById('theory-search-hint');

  if (!q) {
    links.forEach(l => l.classList.remove('hidden'));
    parents.forEach(p => p.classList.remove('hidden'));
    hint?.classList.add('hidden');
    return;
  }

  const titleMatches = new Set();
  links.forEach(l => {
    const match = l.textContent.toLowerCase().includes(q);
    l.classList.toggle('hidden', !match);
    if (match) titleMatches.add(l.dataset.id);
  });

  if (theorySearchIndex?.chapters) {
    for (const ch of theorySearchIndex.chapters) {
      if (ch.text.includes(q)) titleMatches.add(ch.id);
    }
    links.forEach(l => {
      if (titleMatches.has(l.dataset.id)) l.classList.remove('hidden');
    });
  }

  parents.forEach(p => {
    let sib = p.nextElementSibling;
    let any = false;
    while (sib && !sib.classList.contains('theory-parent')) {
      if (sib.classList?.contains('theory-link') && !sib.classList.contains('hidden')) any = true;
      sib = sib.nextElementSibling;
    }
    p.classList.toggle('hidden', !any);
  });

  const visible = [...links].filter(l => !l.classList.contains('hidden')).length;
  if (hint) {
    hint.textContent = visible ? `Найдено разделов: ${visible}` : 'Ничего не найдено';
    hint.classList.remove('hidden');
  }
}

function decodeHtml(s) {
  if (!s) return '';
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

function isJunkTheoryText(t) {
  if (!t) return true;
  if (/РЕШАТЬ БИЛЕТЫ|ЭКЗАМЕН ПДД|Понравился сайт|Поделиться с друзьями|Оплата.*Премиум/i.test(t)) return true;
  if (/^Правила Дорожного Движения ПМР\.?$/i.test(t.trim())) return true;
  if (/^ПДД ПМР оглавление:?$/i.test(t.trim())) return true;
  return false;
}

function normalizeTheoryTitle(t) {
  return decodeHtml(t || '')
    .toLowerCase()
    .replace(/�/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/g, '')
    .trim();
}

function getTheoryTocTitleSet() {
  const titles = new Set(['дорожные знаки', 'дорожная разметка', 'приложения']);
  (theoryToc?.chapters || []).forEach(ch => titles.add(normalizeTheoryTitle(ch.title)));
  return titles;
}

function looksLikeTheoryTocTail(blocks, index) {
  const first = normalizeTheoryTitle(blocks[index]?.text);
  if (first !== 'общие положения') return false;
  const tocTitles = getTheoryTocTitleSet();
  let matches = 0;
  for (let i = index; i < Math.min(blocks.length, index + 10); i++) {
    const text = normalizeTheoryTitle(blocks[i]?.text);
    if (tocTitles.has(text)) matches++;
  }
  return matches >= 4;
}

function extractSignNumbers(text) {
  if (!text) return [];
  const nums = new Set();
  const re = /(?:знак(?:а|ами|ом|ов|е)?|таб\.?|табличк(?:а|и|ой|ами)?)\s*([1-8]\.\d+(?:\.\d+)?(?:\s*[,–—-]\s*[1-8]\.\d+(?:\.\d+)?)*)/gi;
  let m;
  while ((m = re.exec(text))) {
    m[1].split(/\s*[,–—-]\s*/).forEach(n => {
      const t = n.trim();
      if (t) nums.add(t);
    });
  }
  return [...nums];
}

function renderSignImages(signNums) {
  const unique = [...new Set(signNums)].filter(n => signsMap[n]);
  if (!unique.length) return '';
  return `<div class="theory-signs">${unique.map(n => `
    <div class="theory-sign-card">
      <img src="${esc(signsMap[n])}" alt="Знак ${esc(n)}" loading="lazy" />
      <div class="theory-sign-num">${esc(n)}</div>
    </div>`).join('')}</div>`;
}

function formatInlineTheory(text) {
  let s = esc(decodeHtml(text));
  s = s.replace(/«\s*([^»]+?)\s*»/g, '<strong class="text-indigo-200">«$1»</strong>');
  s = s.replace(/(\d+\.\d+(?:\.\d+)?(?:\s*[–—-]\s*\d+\.\d+(?:\.\d+)?)?)/g, '<span class="text-sky-400 font-semibold">$1</span>');
  return s;
}

function preprocessTheoryBlocks(blocks) {
  const out = [];
  let skipRest = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const t = decodeHtml(b.text || '').trim();
    if (isJunkTheoryText(t)) continue;
    if (/^ПДД ПМР оглавление:?$/i.test(t)) { skipRest = true; continue; }
    if (looksLikeTheoryTocTail(blocks, i)) break;
    if (skipRest) continue;
    if (b.type === 'paragraph' && /^([1-8]\.\d+(?:\.\d+)?(?:\s+[1-8]\.\d+(?:\.\d+)?)*)$/.test(t)) {
      if (out.length) {
        const prev = out[out.length - 1];
        prev.signs = [...new Set([...(prev.signs || []), ...t.split(/\s+/), ...extractSignNumbers(prev.text || '')])];
        continue;
      }
    }
    const signs = extractSignNumbers(t);
    out.push({ ...b, text: t, signs: signs.length ? signs : undefined });
  }
  return out;
}

function renderTheoryBlock(b) {
  if (isJunkTheoryText(b.text)) return '';
  const text = decodeHtml(b.text || '');

  if (b.type === 'heading') {
    const termInHeading = text.match(/^«\s*([^»]+?)\s*»\s*[–—\-]\s*(.+)/s);
    if (termInHeading) {
      const signs = b.signs || extractSignNumbers(text);
      return `<div class="theory-def">
        <div class="theory-term">« ${esc(termInHeading[1].trim())} »</div>
        <div class="theory-def-body">${formatInlineTheory(termInHeading[2])}</div>
      </div>${renderSignImages(signs)}`;
    }
    const ruleMatch = text.match(/^(\d+(?:\.\d+)*)\.\s*(.*)/);
    if (ruleMatch) {
      return `<div class="theory-rule"><div class="theory-rule-num">Пункт ${esc(ruleMatch[1])}</div><p class="text-slate-300 leading-relaxed text-sm">${formatInlineTheory(ruleMatch[2])}</p></div>${renderSignImages(b.signs || [])}`;
    }
    return `<h2 class="text-lg font-semibold text-indigo-300 mt-8 mb-3 pb-2 border-b border-slate-700/60">${esc(text)}</h2>`;
  }

  const termMatch = text.match(/^«\s*([^»]+?)\s*»\s*[–—\-]\s*(.+)/s);
  if (termMatch) {
    const signs = b.signs || extractSignNumbers(text);
    return `<div class="theory-def">
      <div class="theory-term">« ${esc(termMatch[1].trim())} »</div>
      <div class="theory-def-body">${formatInlineTheory(termMatch[2])}</div>
    </div>${renderSignImages(signs)}`;
  }

  if (/^\d+\.\d+/.test(text) && text.length < 80) {
    return renderSignImages(extractSignNumbers(text));
  }

  const signs = b.signs || extractSignNumbers(text);
  return `<p class="text-slate-300 leading-relaxed mb-3 text-sm">${formatInlineTheory(text)}</p>${renderSignImages(signs)}`;
}

async function loadTheoryChapter(id) {
  theoryCurrentChapterId = id;
  document.querySelectorAll('.theory-link').forEach(b => b.classList.toggle('bg-indigo-600/30', b.dataset.id === id));
  const chMeta = theoryToc?.chapters?.find(c => c.id === id);
  const titleEl = document.getElementById('theory-current-title');
  if (titleEl) titleEl.textContent = chMeta?.title || 'Теория ПДД';
  closeTheoryDrawer();
  const main = document.getElementById('theory-content');
  main.innerHTML = '<p class="text-slate-400">Загрузка…</p>';
  try {
    const ch = await fetch(`data/theory/chapters/${id}.json`).then(r => r.json());
    const blocks = preprocessTheoryBlocks(ch.blocks || []).map(renderTheoryBlock).filter(Boolean).join('');
    main.innerHTML = `
      <article class="max-w-3xl">
        <div class="flex items-start justify-between gap-3 mb-6 pb-4 border-b border-slate-700">
          <h1 class="text-2xl font-bold">${esc(ch.title)}</h1>
          <button type="button" onclick="openTheoryDrawer()" class="md:hidden shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-300 border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 rounded-lg">
            ${iconHtml('list', 'w-4 h-4')}<span>Темы</span>
          </button>
        </div>
        ${blocks}
        <p class="text-xs text-slate-600 mt-8 pt-4 border-t border-slate-800">Источник: <a href="${esc(ch.source)}" target="_blank" rel="noopener" class="text-indigo-400 hover:underline">pdd-expert.com</a> · ПДД ПМР № 126</p>
      </article>`;
    refreshIcons(main);
  } catch {
    main.innerHTML = '<p class="text-red-400">Не удалось загрузить раздел</p>';
  }
}

function openTheory() {
  renderTheorySidebar();
  loadTheorySearchIndex();
  showScreen('theory');
  if (theoryToc?.chapters?.[0]) loadTheoryChapter(theoryToc.chapters[0].id);
}

function openProgress() {
  renderProgressDashboard();
  showScreen('progress');
}

function renderProgressDashboard() {
  const el = document.getElementById('progress-dashboard');
  if (!el) return;

  const ex = progress.exam || {};
  const mp = progress.marathon;
  const topics = manifest.categories.filter(c => c.questionCount > 0);
  const attemptedTopics = topics.filter(c => progress[c.id]?.attempts > 0);
  const passedTopics = topics.filter(c => (progress[c.id]?.bestPct || 0) >= 70);
  const ticketTotal = config.exam?.ticketCount || 40;

  const summary = `
    <div class="grid sm:grid-cols-3 gap-4 mb-8">
      <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
        <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Темы</p>
        <p class="text-2xl font-bold text-indigo-300">${passedTopics.length}<span class="text-sm text-slate-500 font-normal"> / ${topics.length}</span></p>
        <p class="text-xs text-slate-500 mt-1">пройдено (≥70%)</p>
      </div>
      <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
        <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Экзамен</p>
        <p class="text-2xl font-bold text-amber-300">${ex.passed || 0}<span class="text-sm text-slate-500 font-normal"> / ${ticketTotal}</span></p>
        <p class="text-xs text-slate-500 mt-1">билетов сдано</p>
      </div>
      <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-4">
        <p class="text-xs text-slate-500 uppercase tracking-wide mb-1">Марафон</p>
        <p class="text-2xl font-bold text-violet-300">${mp?.completed ? '✓' : mp?.lastIndex != null ? `${mp.lastIndex + 1}` : '—'}</p>
        <p class="text-xs text-slate-500 mt-1">${mp?.total ? `из ${mp.total} вопросов` : 'не начат'}</p>
      </div>
    </div>`;

  const topicRows = attemptedTopics.length
    ? attemptedTopics.map(c => {
        const p = progress[c.id];
        const ok = p.bestPct >= 70;
        return `<div class="flex items-center gap-3 py-2 border-b border-slate-800 last:border-0">
          ${categorySymbolHtml(c, 'text-lg shrink-0')}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">${esc(c.title)}</p>
            <div class="h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
              <div class="h-full rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}" style="width:${p.bestPct}%"></div>
            </div>
          </div>
          <span class="text-xs shrink-0 ${ok ? 'text-emerald-400' : 'text-slate-400'}">${p.bestPct}% · ${p.attempts}×</span>
        </div>`;
      }).join('')
    : '<p class="text-slate-500 text-sm py-4">Пока нет пройденных тем — начните с раздела «Тесты».</p>';

  const history = (progress.history || []).slice(0, 25);
  const historyRows = history.length
    ? history.map(h => {
        const d = new Date(h.date);
        const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const modeLabel = h.mode === 'exam' ? 'Билет' : h.mode === 'marathon' ? 'Марафон' : 'Тема';
        return `<div class="flex items-center gap-3 py-2.5 border-b border-slate-800 last:border-0 text-sm">
          <span class="text-xs text-slate-500 w-24 shrink-0">${dateStr}</span>
          <span class="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">${modeLabel}</span>
          <span class="flex-1 truncate text-slate-300">${esc(h.title)}</span>
          <span class="shrink-0 text-slate-400">${h.correct}/${h.total}</span>
          <span class="shrink-0">${h.passed ? iconHtml('check-circle-2', 'w-4 h-4 text-emerald-400') : iconHtml('x-circle', 'w-4 h-4 text-red-400')}</span>
        </div>`;
      }).join('')
    : '<p class="text-slate-500 text-sm py-4">История попыток появится после первого теста.</p>';

  el.innerHTML = summary + `
    <div class="bg-slate-800/60 border border-slate-700 rounded-xl p-5 mb-6">
      <h3 class="font-bold text-sm mb-3">Темы</h3>
      ${topicRows}
    </div>
    <div class="bg-slate-800/60 border border-slate-700 rounded-xl p-5">
      <div class="flex items-center justify-between gap-2 mb-3">
        <h3 class="font-bold text-sm">Последние попытки</h3>
        <span class="text-xs text-slate-500">${history.length} из ${Math.min((progress.history || []).length, 40)}</span>
      </div>
      <div class="progress-history-scroll max-h-72 overflow-y-auto pr-1 -mr-1">${historyRows}</div>
    </div>`;
  refreshIcons(el);
}

function pluralErrors(n) {
  return n === 1 ? 'ошибки' : 'ошибок';
}

/* ─── GLOBAL SEARCH ─── */
function parseSearchQuery(raw) {
  const q = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  const points = [];
  const re = /(?:п\.?\s*|пункт\s+|§\s*)?(\d{1,2}\.\d+(?:\.\d+)?)/gi;
  let m;
  while ((m = re.exec(q))) points.push(m[1]);
  const words = q.replace(/(?:п\.?\s*|пункт\s+|§\s*)\d{1,2}\.\d+(?:\.\d+)?/gi, ' ')
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ').split(/\s+/).filter(w => w.length > 1);
  return { q, points: [...new Set(points)], words };
}

function openGlobalSearch() {
  document.getElementById('global-search-modal')?.classList.remove('hidden');
  const inp = document.getElementById('global-search-input');
  if (inp) { inp.value = ''; inp.focus(); }
  runGlobalSearch('');
}

function closeGlobalSearch() {
  document.getElementById('global-search-modal')?.classList.add('hidden');
}

function searchResultRow(icon, title, sub, onclick) {
  return `<button type="button" onclick="${onclick}" class="w-full text-left flex gap-3 items-start px-3 py-2.5 rounded-lg hover:bg-slate-700/80 transition">
    ${emojiHtml(icon, 'text-lg shrink-0')}<div class="min-w-0"><p class="font-medium text-slate-200 truncate">${esc(title)}</p>${sub ? `<p class="text-xs text-slate-500 truncate">${esc(sub)}</p>` : ''}</div></button>`;
}

function runGlobalSearch(raw) {
  const el = document.getElementById('global-search-results');
  if (!el) return;
  const { q, points, words } = parseSearchQuery(raw);
  if (!q) {
    el.innerHTML = '<p class="p-3 text-slate-500">Введите запрос — пункт ПДД (6.4), тему или ключевое слово</p>';
    return;
  }
  if (!globalSearchIndex) {
    el.innerHTML = '<p class="p-3 text-red-400">Индекс поиска не загружен</p>';
    return;
  }

  const theoryPrimary = [], theoryMention = [], topics = [], questions = [];

  for (const t of globalSearchIndex.theory || []) {
    const primaryHit = points.some(p => (t.primaryPoints || t.pddPoints || []).includes(p));
    const mentionHit = points.some(p => (t.pddPoints || []).includes(p)) || words.some(w => t.text.includes(w));
    if (primaryHit) theoryPrimary.push(t);
    else if (mentionHit || (points.length === 0 && words.some(w => t.title.toLowerCase().includes(w)))) theoryMention.push(t);
  }

  for (const t of globalSearchIndex.topics || []) {
    if (words.some(w => t.text.includes(w)) || (points.length && t.text.includes(points[0]))) topics.push(t);
  }

  for (const qn of globalSearchIndex.questions || []) {
    const pointHit = points.some(p => (qn.pddPoints || []).includes(p));
    const wordHit = words.some(w => qn.text.includes(w));
    if (pointHit || wordHit) questions.push(qn);
  }

  if (!theoryPrimary.length && !theoryMention.length && !topics.length && !questions.length) {
    el.innerHTML = '<p class="p-3 text-slate-500">Ничего не найдено</p>';
    return;
  }

  let html = '';
  const section = (title, items, render) => {
    if (!items.length) return '';
    return `<p class="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-indigo-400 font-bold">${title}</p>${items.slice(0, 12).map(render).join('')}`;
  };

  html += section('Теория — основной пункт', theoryPrimary, t =>
    searchResultRow('📖', t.title, points[0] ? `Пункт ${points[0]}` : '', `closeGlobalSearch();openTheory();loadTheoryChapter('${t.id}')`));
  html += section('Темы тестов', topics, t =>
    searchResultRow(t.icon, t.title, t.desc, `closeGlobalSearch();openTestConfirm('${t.id}')`));
  html += section('Теория — упоминания', theoryMention, t =>
    searchResultRow('📄', t.title, '', `closeGlobalSearch();openTheory();loadTheoryChapter('${t.id}')`));
  html += section('Вопросы', questions, qn =>
    searchResultRow(qn.icon, qn.preview, qn.topicTitle, `closeGlobalSearch();openTestConfirm('${qn.topicId}')`));

  el.innerHTML = html;
}

/* ─── UTILS ─── */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openGlobalSearch(); }
    if (e.key === 'Escape') closeGlobalSearch();
  });
  window.addEventListener('beforeunload', () => {
    if (state.mode === 'marathon' && state.questions.length) {
      recordMarathonProgress(state.current, state.questions.length);
    }
  });
  try {
    await loadData();
    renderHome();
    refreshIcons();
  } catch (e) {
    document.getElementById('group-grid').innerHTML =
      '<p class="text-red-400 col-span-full">Ошибка загрузки. Запустите локальный сервер (python -m http.server).</p>';
    console.error(e);
  }
});

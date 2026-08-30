/* ============================================================
   暖愈心伴 · Warm Mate — 交互与路由
   ============================================================ */

/* ---------- 后端 API 配置 ---------- */
const CLOUD_API = 'http://47.93.117.13:8080';
// 由本项目后端托管时走同源相对路径；file:// 或 Capacitor 容器时使用云端地址。
// 如需指定其它后端，可在加载 app.js 前设置 window.__WM_API__。
const API_BASE = (window.__WM_API__ !== undefined)
  ? window.__WM_API__
  : ((location.protocol === 'http:' || location.protocol === 'https:') ? '' : CLOUD_API);

/* ---------- 全局状态 ---------- */
const store = {
  user: { name: '亲爱的用户', phone: '13800138000' },
  token: localStorage.getItem('wm_token') || '',
  loggedIn: !!localStorage.getItem('wm_token'),
  chatCount: 0,
  scaleRecords: [],      // { id, name, score, level, date }
  bookRecords: [],       // { doc, name, phone, urgency, time, status, date }
  favorites: [],         // 收藏的文章 id
  history: [],           // 页面栈
  messages: [],          // 消息中心（医生/管理员建议）
  unreadMsgs: 0
};

/* ---------- 后端接口辅助 ---------- */
function authHeaders() {
  return store.token ? { 'Authorization': 'Bearer ' + store.token } : {};
}
function apiFetch(path, options) {
  options = options || {};
  options.headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders(), options.headers || {});
  return fetch(API_BASE + path, options);
}
// 上报使用事件（静默、失败不打扰用户）
function trackEvent(type, detail) {
  if (!store.token) return;
  try {
    apiFetch('/api/app/events', {
      method: 'POST',
      body: JSON.stringify({ events: [{ type: type, detail: detail || {} }] })
    }).catch(function () {});
  } catch (e) {}
}

/* ---------- 工具 ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => ((s === null || s === undefined) ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fetchTimeout(url, options, ms) {
  return Promise.race([
    fetch(url, options),
    new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, ms);
    })
  ]);
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function today() {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/* ---------- 路由 ---------- */
const TAB_SCREENS = { home: 'screen-home', scales: 'screen-scales', articles: 'screen-articles', profile: 'screen-profile' };

function go(id) {
  store.history.push(activeScreen());
  showScreen(id);
}

function back() {
  const prev = store.history.pop();
  if (prev) showScreen(prev); else showScreen('screen-home');
}

function activeScreen() {
  const a = document.querySelector('.screen.active');
  return a ? a.id : 'screen-home';
}

function showScreen(id) {
  // 兼容短 id：'chat' -> 'screen-chat'（元素 id 都带 screen- 前缀）
  if (id && id.indexOf('screen-') !== 0) id = 'screen-' + id;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  // 让滚动区回到顶部
  const sc = el ? el.querySelector('.scroll') : null;
  if (sc) sc.scrollTop = 0;
  syncTabbar(id);
}

function syncTabbar(id) {
  const map = { 'screen-home': 'home', 'screen-scales': 'scales', 'screen-articles': 'articles', 'screen-profile': 'profile' };
  const cur = map[id];
  document.querySelectorAll('.tabbar .tab').forEach(t => {
    t.classList.toggle('on', t.dataset.tab === cur);
  });
}

// 底部导航点击
document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tabbar .tab');
  if (tab) {
    const id = TAB_SCREENS[tab.dataset.tab];
    if (id) { store.history = []; showScreen(id); }
  }
  const chip = e.target.closest('.chips-row .chip');
  if (chip && chip.closest('#record-tabs')) selectRecordTab(chip);
});

/* ---------- 登录 / 注册 ---------- */
let authMode = 'login';

document.querySelectorAll('.auth-tabs div').forEach(t => {
  t.addEventListener('click', () => {
    authMode = t.dataset.auth;
    document.querySelectorAll('.auth-tabs div').forEach(x => x.classList.toggle('on', x === t));
    $('auth-pwd2-wrap').style.display = authMode === 'register' ? '' : 'none';
    $('auth-submit').textContent = authMode === 'login' ? '登 录' : '注 册';
  });
});

$('auth-submit').addEventListener('click', async () => {
  const phone = $('auth-phone').value.trim();
  const pwd = $('auth-pwd').value;
  const pwd2 = $('auth-pwd2').value;

  if (!/^1\d{10}$/.test(phone)) return toast('请输入正确的手机号');
  if (pwd.length < 6) return toast('密码至少 6 位');
  if (authMode === 'register' && pwd !== pwd2) return toast('两次密码不一致');
  if (!$('auth-agree').checked) return toast('请先阅读并同意协议');

  const btn = $('auth-submit');
  btn.disabled = true;
  btn.textContent = authMode === 'login' ? '登录中…' : '注册中…';
  const url = authMode === 'login' ? '/api/app/login' : '/api/app/register';
  try {
    const res = await fetch(API_BASE + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone, password: pwd, device: 'web', app_version: '1.2.0' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || '登录失败');
    store.token = data.token;
    localStorage.setItem('wm_token', data.token);
    store.loggedIn = true;
    store.user = data.user || { name: '暖友 ' + phone.slice(-4), phone };
    toast(authMode === 'login' ? '欢迎回来 🌿' : '注册成功，欢迎加入 🌿');
    trackEvent(authMode === 'login' ? 'login' : 'register');
    initHome();
    showScreen('screen-home');
    refreshMessages();
  } catch (e) {
    // 后端不可达时，演示账号回退到本地演示（保证离线可演示）
    if (authMode === 'login' && phone === '13800138000') {
      store.loggedIn = true;
      store.user = { name: '暖友 ' + phone.slice(-4), phone };
      toast('后端暂不可用，已进入演示模式');
      initHome();
      showScreen('screen-home');
    } else {
      toast((e.message || '登录失败，请稍后重试'));
    }
  } finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? '登 录' : '注 册';
  }
});

function logout() {
  store.loggedIn = false;
  store.token = '';
  store.user = { name: '亲爱的用户', phone: '13800138000' };
  localStorage.removeItem('wm_token');
  $('auth-pwd').value = '';
  showScreen('screen-auth');
  toast('已安全退出');
}

function togglePwd() {
  const inp = $('auth-pwd');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function openForgot() {
  showModal(`
    <h3>找回密码</h3>
    <div class="article-detail"><div class="body">
      <p>请使用注册手机号找回密码。</p>
      <p>演示版说明：验证码统一为 <b>123456</b>，输入后即可重新设置密码。</p>
      <div class="divider"></div>
      <p style="color:var(--text-3);font-size:13px">正式版将接入短信验证码服务。</p>
    </div></div>`);
}

/* ---------- 首页 ---------- */
function initHome() {
  $('home-name').textContent = store.user.name;
  // 每日一句
  const q = DAILY_QUOTES[new Date().getDate() % DAILY_QUOTES.length];
  document.querySelector('#screen-home .daily-card .q').textContent = q;
  // 推荐文章
  const rec = ARTICLES.slice(0, 3);
  $('home-articles').innerHTML = rec.map(a => `
    <div class="card article-card" onclick="openArticle(${a.id})">
      <div class="cover" style="background:${a.cover}">${a.icon}</div>
      <h4>${a.title}</h4>
      <div class="meta-row"><span>${a.author.split('·')[0]}</span><span>👀 ${a.reads}</span></div>
    </div>`).join('');
}

/* ---------- AI 对话 ---------- */
let chatReady = true;
let chatHistory = [];   // [{role:'user'|'assistant', content}]

function renderChatChips() {
  $('chat-chips').innerHTML = CHAT_QUICK.map(q => `<div class="chip" onclick="quickChat('${esc(q)}')">${q}</div>`).join('');
}

function seedChat() {
  if ($('chat-body').children.length > 0) return;
  addMsg('ai', '你好，我是小暖，一名 AI 心理支持助手。\n\n我可以陪你梳理情绪和寻找现实支持，但不能诊断、治疗或替代心理咨询师、医生与紧急救援。请不要输入姓名、学号、住址等可识别信息。', true);
}

function quickChat(q) {
  addMsg('me', q);
  respond(q);
}

function sendChat() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  addMsg('me', text);
  respond(text);
}

$('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

function addMsg(who, text, skipType) {
  const body = $('chat-body');
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.innerHTML = who === 'ai'
    ? `<div class="avatar-sm">🌿</div><div class="bubble"></div>`
    : `<div class="bubble"></div>`;
  body.appendChild(div);
  const bubble = div.querySelector('.bubble');
  if (who === 'me') { bubble.textContent = text; }
  else if (skipType) { bubble.textContent = text; }
  else typewriter(bubble, text);
  body.scrollTop = body.scrollHeight;
  return div;
}

function typewriter(el, text) {
  el.textContent = '';
  el.classList.add('cursor');
  let i = 0;
  const timer = setInterval(() => {
    i++;
    el.textContent = text.slice(0, i);
    $('chat-body').scrollTop = $('chat-body').scrollHeight;
    if (i >= text.length) {
      clearInterval(timer);
      el.classList.remove('cursor');
    }
  }, 28);
}

function respond(text) {
  if (!chatReady) return;
  chatReady = false;
  trackEvent('chat_message', { desc: '向小暖倾诉', len: text.length });

  // 记录对话历史（不含本次用户消息）
  const history = chatHistory.slice();
  chatHistory.push({ role: 'user', content: text });
  store.chatCount++;
  updateStats();

  // 显示"正在输入"
  const body = $('chat-body');
  const typing = document.createElement('div');
  typing.className = 'msg ai';
  typing.innerHTML = `<div class="avatar-sm">🌿</div><div class="bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  body.appendChild(typing);
  body.scrollTop = body.scrollHeight;

  const finish = function (reply) {
    chatHistory.push({ role: 'assistant', content: reply });
    typing.remove();
    addMsg('ai', reply);
    chatReady = true;
  };

  // 危机表达先经过本地确定性安全门，不等待网络或大模型判断。
  const risk = assessRisk(text);
  if (risk.level === 'high' || risk.level === 'urgent') {
    finish(buildCrisisReply(risk.level));
    return;
  }

  fetchTimeout(API_BASE + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, history: history })
  }, 8000).then(function (res) {
    if (res.ok) return res.json();
    throw new Error('bad status');
  }).then(function (data) {
    finish(data && data.reply ? data.reply : matchReply(text));
  }).catch(function () {
    finish(matchReply(text));
  });
}

function matchReply(text) {
  const t = text.toLowerCase();
  let best = null, bestLen = 0;
  for (const r of CHAT_REPLIES) {
    for (const kw of r.kw) {
      if (t.includes(kw) && kw.length > bestLen) { best = r; bestLen = kw.length; }
    }
  }
  return best ? best.reply : CHAT_DEFAULT;
}

/* ---------- 测评 ---------- */
let activeScaleCat = '全部';
let quiz = null;   // { scale, index, answers }

function renderScaleCats() {
  $('scale-cats').innerHTML = SCALE_CATS.map(c =>
    `<div class="chip ${c === activeScaleCat ? 'on' : ''}" onclick="pickScaleCat('${c}')">${c}</div>`).join('');
}

function pickScaleCat(c) {
  activeScaleCat = c;
  renderScaleCats();
  renderScales();
}

function renderScales() {
  const list = SCALES.filter(s => activeScaleCat === '全部' || s.cat === activeScaleCat);
  $('scale-list').innerHTML = list.map(s => `
    <div class="card scale-card">
      <div class="head">
        <div class="s-ico ${s.color}">${s.icon}</div>
        <div style="flex:1">
          <h4>${s.name}</h4>
          <div class="sub">${s.time} · ${s.desc}</div>
        </div>
      </div>
      <div class="meta">
        <span class="tag tag-purple">${s.cat}</span>
        <span class="tag tag-gray">${s.questions.length} 题</span>
      </div>
      <button class="btn btn-primary btn-sm mt-8" onclick="startQuiz('${s.id}')">开始测评</button>
    </div>`).join('');
}

function startQuiz(id) {
  const scale = SCALES.find(s => s.id === id);
  if (!scale) return;
  quiz = { scale, index: 0, answers: new Array(scale.questions.length).fill(-1) };
  $('quiz-title').textContent = scale.name;
  go('screen-quiz');
  renderQuiz();
}

function renderQuiz() {
  const s = quiz.scale, i = quiz.index;
  $('quiz-bar').style.width = ((i + 1) / s.questions.length * 100) + '%';

  $('quiz-body').innerHTML = `
    <div class="quiz-q">
      <div class="qn"><span>${i + 1}.</span>${s.questions[i]}</div>
      <div class="opts">
        ${s.opts.map((o, oi) => `
          <div class="opt ${quiz.answers[i] === oi ? 'sel' : ''}" onclick="pickOpt(${oi})">
            <div class="dot"></div>${o}
          </div>`).join('')}
      </div>
    </div>`;

  const btn = $('quiz-next');
  btn.textContent = i === s.questions.length - 1 ? '查看结果' : '下一题';
  btn.style.opacity = quiz.answers[i] === -1 ? '.5' : '1';
  btn.style.pointerEvents = quiz.answers[i] === -1 ? 'none' : 'auto';
}

function pickOpt(oi) {
  quiz.answers[quiz.index] = oi;
  renderQuiz();
}

function quizNext() {
  if (quiz.answers[quiz.index] === -1) return;
  if (quiz.index < quiz.scale.questions.length - 1) {
    quiz.index++;
    renderQuiz();
  } else {
    showResult();
  }
}

function showResult() {
  const s = quiz.scale;
  // 计分：正向题全部累加（演示量表已统一为分值越高越严重）
  const score = quiz.answers.reduce((a, b) => a + b, 0);
  const r = s.interpret(score);
  const pct = Math.round(score / s.scoreMax * 100);

  store.scaleRecords.push({
    id: s.id, name: s.name, score, level: r.level, date: today()
  });
  trackEvent('scale_complete', { name: s.name, score: score, level: r.level });

  $('result-card').innerHTML = `
    <div class="result-hero">
      <div class="ring" style="--pct:${pct}%">
        <div class="inner">
          <div class="num">${score}</div>
          <div class="lbl">/ ${s.scoreMax} 分</div>
        </div>
      </div>
      <div class="level" style="color:${r.color}">${r.level}</div>
      <div class="desc">${r.desc}</div>
      <div class="advice">
        <h5>🌱 给你的建议</h5>
        ${r.advice.map(a => `<li>${a}</li>`).join('')}
      </div>
    </div>
    <div class="divider"></div>
    <p style="font-size:12px;color:var(--text-3);line-height:1.7">
      * 本原型依据所列筛查工具进行演示性计分，仅供自我了解参考，不构成医学诊断。
      正式使用前仍需核验量表版本、授权、适用人群和计分规则；如持续困扰，请联系正规专业机构。
    </p>
    <button class="btn btn-accent btn-block mt-16" onclick="go('book')">需要帮助？预约咨询师</button>
    <button class="btn btn-ghost btn-block mt-8" onclick="go('scales')">完成 · 返回测评</button>`;

  go('screen-result');
  updateStats();
}

/* ---------- 科普 ---------- */
let activeArtCat = '全部';

function renderArticleCats() {
  $('article-cats').innerHTML = ARTICLE_CATS.map(c =>
    `<div class="chip ${c === activeArtCat ? 'on' : ''}" onclick="pickArtCat('${c}')">${c}</div>`).join('');
}

function pickArtCat(c) { activeArtCat = c; renderArticleCats(); renderArticles(); }

function renderArticles() {
  const kw = $('article-search').value.trim();
  const list = ARTICLES.filter(a =>
    (activeArtCat === '全部' || a.cat === activeArtCat) &&
    (!kw || a.title.includes(kw) || a.abs.includes(kw) || a.cat.includes(kw))
  );
  $('article-list').innerHTML = list.length ? list.map(a => `
    <div class="card article-card" onclick="openArticle(${a.id})">
      <div class="cover" style="background:${a.cover}">${a.icon}</div>
      <h4>${a.title}</h4>
      <div class="abs">${a.abs}</div>
      <div class="meta-row">
        <span class="author">👤 ${a.author}</span>
        <span>📅 ${a.date}</span>
        <span>👀 ${a.reads}</span>
      </div>
    </div>`).join('') : `<div class="empty"><span class="emoji">🔍</span><p>没有找到相关内容，换个关键词试试吧</p></div>`;
}

function openArticle(id) {
  const a = ARTICLES.find(x => x.id === id);
  if (!a) return;
  trackEvent('article_read', { title: a.title });
  $('article-detail').innerHTML = `
    <div class="cover" style="height:140px;border-radius:var(--r-md);display:flex;align-items:center;justify-content:center;font-size:52px;background:${a.cover}">${a.icon}</div>
    <h1>${a.title}</h1>
    <div class="byline"><span>👤 ${a.author}</span><span>📅 ${a.date}</span><span>👀 ${a.reads}</span></div>
    <div class="body">${a.body}</div>
    <div class="divider"></div>
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost btn-sm" onclick="toggleFavorite(${a.id})">⭐ 收藏</button>
      <button class="btn btn-primary btn-sm" onclick="toast('已加入稍后读')">🕘 稍后读</button>
    </div>`;
  go('screen-article');
}

/* ---------- 预约 ---------- */
let activeDocCat = '全部';
let bookingDoc = null;
let urgency = '一般', timePref = '工作日';

function renderDocCats() {
  $('doc-cats').innerHTML = DOC_CATS.map(c =>
    `<div class="chip ${c === activeDocCat ? 'on' : ''}" onclick="pickDocCat('${c}')">${c}</div>`).join('');
}

function pickDocCat(c) { activeDocCat = c; renderDocCats(); renderDoctors(); }

function renderDoctors() {
  const list = DOCTORS.filter(d => activeDocCat === '全部' || d.fields.includes(activeDocCat));
  $('doc-list').innerHTML = list.map(d => `
    <div class="card doc-card">
      <div class="avatar">${d.emoji}</div>
      <div class="info">
        <h4>${d.name}</h4>
        <div class="title">${d.title}</div>
        <div class="tags">${d.fields.map(f => `<span class="tag tag-green">${f}</span>`).join('')}</div>
        <div class="rate">${d.status}</div>
      </div>
      <button class="btn btn-accent btn-sm book-btn" onclick="openBooking(${d.id})">查看流程</button>
    </div>`).join('');
}

function openBooking(id) {
  bookingDoc = DOCTORS.find(d => d.id === id);
  $('book-doc-brief').innerHTML = `
    <div class="doc-card" style="margin:0">
      <div class="avatar">${bookingDoc.emoji}</div>
      <div class="info">
        <h4>${bookingDoc.name}</h4>
        <div class="title">${bookingDoc.title}</div>
        <div class="rate">${bookingDoc.status}</div>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-2);margin-top:10px;line-height:1.6">${bookingDoc.intro}</p>`;
  $('bf-name').value = ''; $('bf-phone').value = store.user.phone; $('bf-age').value = ''; $('bf-desc').value = '';
  go('screen-book-form');
}

// 单选 chip 组
document.addEventListener('click', (e) => {
  const g = e.target.closest('.urgency');
  if (!g) return;
  const c = e.target.closest('.chip');
  if (!c) return;
  g.querySelectorAll('.chip').forEach(x => x.classList.remove('on'));
  c.classList.add('on');
  if (g.id === 'bf-urgency') urgency = c.dataset.v;
  if (g.id === 'bf-time') timePref = c.dataset.v;
});

function submitBooking() {
  const name = $('bf-name').value.trim();
  const phone = $('bf-phone').value.trim();
  if (!name) return toast('请填写姓名');
  if (!/^1\d{10}$/.test(phone)) return toast('请填写正确的手机号');

  store.bookRecords.push({
    doc: bookingDoc.name, name, phone, urgency, time: timePref, status: '待处理', date: today()
  });
  trackEvent('book_create', { doc: bookingDoc.name, urgency: urgency, time: timePref });
  toast('演示记录已保存于本次会话，不会发送给真实机构');
  updateStats();
  setTimeout(() => showScreen('screen-book'), 900);
}

/* ---------- 我的 / 历史 ---------- */
function updateStats() {
  $('stat-chat').textContent = store.chatCount;
  $('stat-scale').textContent = store.scaleRecords.length;
  $('stat-book').textContent = store.bookRecords.length;
}

let activeRecord = 'chat';

function selectRecordTab(chip) {
  document.querySelectorAll('#record-tabs .chip').forEach(x => x.classList.remove('on'));
  chip.classList.add('on');
  activeRecord = chip.dataset.r;
  renderRecords();
}

// 从"我的"菜单进入指定记录分类
function goRecords(tab) {
  activeRecord = tab;
  document.querySelectorAll('#record-tabs .chip').forEach(function (x) {
    x.classList.toggle('on', x.dataset.r === tab);
  });
  renderRecords();
  go('records');
}

function renderRecords() {
  const wrap = $('record-list');
  let html = '';

  if (activeRecord === 'chat') {
    if (store.chatCount === 0) return wrap.innerHTML = `<div class="empty"><span class="emoji">💬</span><p>暂无对话记录</p><p style="font-size:12px;color:var(--text-3);margin-top:4px">去和小暖聊聊你的心情吧</p><button class="btn btn-primary btn-sm mt-16" onclick="go('chat')">去对话</button></div>`;
    html = `
      <div class="card"><div class="record-item">
        <div class="r-ico ico-green">💬</div>
        <div class="r-info"><h5>与「小暖」的暖心对话</h5><p>${today()} · 共 ${store.chatCount} 次交流</p></div>
        <button class="btn btn-ghost btn-sm" onclick="go('chat')">继续聊</button>
      </div></div>`;
  }

  if (activeRecord === 'scale') {
    if (store.scaleRecords.length === 0) return wrap.innerHTML = `<div class="empty"><span class="emoji">📋</span><p>暂无测评记录</p><p style="font-size:12px;color:var(--text-3);margin-top:4px">完成一次测评后会显示在这里</p><button class="btn btn-primary btn-sm mt-16" onclick="go('scales')">去测评</button></div>`;
    html = `<div class="card">` + store.scaleRecords.slice().reverse().map(r => `
      <div class="record-item">
        <div class="r-ico ico-purple">📋</div>
        <div class="r-info"><h5>${r.name}</h5><p>${r.date} · 得分 ${r.score}</p></div>
        <span class="tag ${r.level.includes('明显') || r.level.includes('低') ? 'tag-green' : 'tag-coral'}">${r.level}</span>
      </div>`).join('') + `</div>`;
  }

  if (activeRecord === 'book') {
    if (store.bookRecords.length === 0) return wrap.innerHTML = `<div class="empty"><span class="emoji">🧑‍⚕️</span><p>暂无预约记录</p><p style="font-size:12px;color:var(--text-3);margin-top:4px">预约咨询师后会显示在这里</p><button class="btn btn-accent btn-sm mt-16" onclick="go('book')">去预约</button></div>`;
    const statusColor = { '待处理': 'tag-gold', '已确认': 'tag-green', '已完成': 'tag-gray', '已取消': 'tag-gray' };
    html = `<div class="card">` + store.bookRecords.slice().reverse().map(b => `
      <div class="record-item">
        <div class="r-ico ico-coral">🧑‍⚕️</div>
        <div class="r-info"><h5>${b.doc} · ${b.urgency}</h5><p>${b.date} · 偏好：${b.time}</p></div>
        <span class="tag ${statusColor[b.status]}">${b.status}</span>
      </div>`).join('') + `</div>`;
  }

  wrap.innerHTML = html;
}

/* ---------- 消息中心（接收医生/管理员建议） ---------- */
function refreshMessages() {
  if (!store.token) { store.messages = []; store.unreadMsgs = 0; updateMsgBadges(); return; }
  apiFetch('/api/app/messages').then(function (res) { if (res.ok) return res.json(); throw new Error(); })
    .then(function (data) {
      store.messages = (data && data.messages) || [];
      store.unreadMsgs = (data && data.unread) || 0;
      updateMsgBadges();
      const el = $('msg-list');
      if (el) renderMessagesView();
    }).catch(function () {});
}

function updateMsgBadges() {
  const n = store.unreadMsgs;
  const b = $('msg-badge');
  if (b) b.textContent = n > 0 ? n : '';
  const bh = $('msg-badge-home');
  if (bh) bh.textContent = n > 0 ? n : '';
}

function openMessages() {
  go('messages');
  renderMessagesView();
}

function renderMessagesView() {
  const wrap = $('msg-list');
  if (!wrap) return;
  const msgs = store.messages || [];
  if (!msgs.length) {
    wrap.innerHTML = `<div class="empty"><span class="emoji">📭</span><p>暂无消息</p><p style="font-size:12px;color:var(--text-3);margin-top:4px">医生/管理员发送的关怀建议会显示在这里</p></div>`;
    return;
  }
  wrap.innerHTML = msgs.map(function (m) {
    const who = m.sender_role === 'admin' ? '管理员' : '医生';
    return `
      <div class="card msg-card ${m.read ? '' : 'unread'}">
        <div class="msg-head">${m.read ? '📬' : '🔔'} <b>${m.sender_name || who}（${who}）</b><span class="msg-time">${m.created_at ? m.created_at.slice(5,16).replace('T',' ') : ''}</span></div>
        <div class="msg-body">${m.content}</div>
        ${m.read ? '' : '<div class="msg-actions"><button class="btn btn-ghost btn-sm" onclick="markMsgRead(this,' + m.id + ')">标记已读</button></div>'}
      </div>`;
  }).join('');
}

function markMsgRead(btn, id) {
  if (!store.token) return;
  apiFetch('/api/app/messages/' + id + '/read', { method: 'POST' })
    .then(function () {
      const m = store.messages.find(function (x) { return x.id === id; });
      if (m) m.read = 1;
      if (store.unreadMsgs > 0) store.unreadMsgs--;
      updateMsgBadges();
      if (btn) btn.closest('.msg-actions').remove();
      const card = btn ? btn.closest('.msg-card') : null;
      if (card) card.classList.remove('unread');
    }).catch(function () {});
}

/* ---------- 模态框 ---------- */
function showModal(html) {
  $('modal-body').innerHTML = '<div class="close" onclick="closeModal()">✕</div>' + html;
  $('modal').classList.add('show');
}
function closeModal() {
  $('modal').classList.remove('show');
}
$('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });

/* ---------- 用户协议 / 隐私政策 / 收藏 / 设置 ---------- */
function openAgreement() {
  showModal(`
    <h3>用户协议</h3>
    <div class="article-detail"><div class="body">
      <p>欢迎使用「暖愈心伴」心理健康服务平台。使用前请仔细阅读本协议。</p>
      <h3>一、服务说明</h3>
      <p>当前版本为功能原型，提供 AI 情绪支持、自我筛查演示、健康科普与专业资源预约流程演示。</p>
      <h3>二、账号与使用</h3>
      <p>用户应妥善保管账号信息，不得利用本应用从事违法或有害活动。</p>
      <h3>三、免责声明</h3>
      <p>AI 对话与测评结果仅供自我了解参考，不构成医学诊断或治疗建议。如遇严重心理困扰，请及时就医或联系专业机构。</p>
      <h3>四、协议变更</h3>
      <p>我们可能适时更新本协议，更新后将在应用内公示。</p>
    </div></div>`);
}

function openPrivacy() {
  showModal(`
    <h3>隐私政策</h3>
    <div class="article-detail"><div class="body">
      <p>当前版本为竞赛功能原型，尚未形成生产级账户、持久化、导出删除与加密体系，请勿输入姓名、学号、住址等可识别敏感信息。</p>
      <h3>一、当前数据流</h3>
      <p>登录、测评、收藏和预约记录主要保存在本次前端会话；AI 对话输入会发送至项目后端并调用第三方大模型服务生成回复。</p>
      <h3>二、使用边界</h3>
      <p>原型不用于诊断、治疗、紧急救援或正式预约。正式试点前将补充单独同意、最小化收集、传输与存储加密、留存期限、导出删除和第三方处理清单。</p>
      <h3>三、安全提示</h3>
      <p>如存在立即危险，请直接联系110、120、身边可信任的人或当地经核验的专业机构，不要依赖本原型处置紧急情况。</p>
    </div></div>`);
}

function toggleFavorite(id) {
  const a = ARTICLES.find(x => x.id === id);
  const i = store.favorites.indexOf(id);
  if (i >= 0) { store.favorites.splice(i, 1); toast('已取消收藏'); }
  else { store.favorites.push(id); toast('已收藏 ⭐'); }
  trackEvent('article_favorite', { title: (a ? a.title : '') });
}

function openFavorites() {
  const list = store.favorites.map(function (id) { return ARTICLES.find(function (a) { return a.id === id; }); }).filter(function (a) { return a; });
  if (!list.length) {
    showModal('<h3>我的收藏</h3><div class="empty"><span class="emoji">⭐</span><p>还没有收藏的内容，去科普页看看吧</p></div>');
    return;
  }
  showModal('<h3>我的收藏</h3>' + list.map(function (a) {
    return '<div class="card article-card" onclick="closeModal();openArticle(' + a.id + ')"><h4>' + a.title + '</h4><div class="meta-row"><span>👤 ' + a.author.split('·')[0] + '</span><span>👀 ' + a.reads + '</span></div></div>';
  }).join(''));
}

function openSettings() {
  showModal(`
    <h3>设置</h3>
    <div class="article-detail"><div class="body">
      <p><b>暖愈心伴 Warm Mate</b> · v1.1.2</p>
      <p>AI 引擎：DeepSeek（deepseek-chat）</p>
      <p>服务体系：AI 陪伴 · 心理测评 · 健康科普 · 咨询预约</p>
      <div class="divider"></div>
      <p style="color:var(--text-3);font-size:13px">「预防为先 · 主动关怀」—— 你的随身心理陪伴。</p>
    </div></div>
    <button class="btn btn-ghost btn-block mt-8" onclick="closeModal()">关闭</button>`);
}

/* ---------- 全局错误提示 ---------- */
window.onerror = function (msg, src, line, col) {
  try {
    const t = $('toast');
    t.textContent = '⚠️ 出错了，请稍后重试';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3000);
  } catch (e) {}
};

/* ---------- 初始化 ---------- */
function init() {
  renderChatChips();
  seedChat();
  renderScaleCats();
  renderScales();
  renderArticleCats();
  renderArticles();
  renderDocCats();
  renderDoctors();
  initHome();
  updateStats();
  renderRecords();
  $('chat-body').addEventListener('click', () => {});

  // 已登录则恢复会话并上报“打开应用”
  if (store.token) {
    apiFetch('/api/app/me').then(function (res) { if (res.ok) return res.json(); throw new Error(); })
      .then(function (u) {
        if (u && u.phone) {
          store.user = { name: u.name || ('暖友 ' + u.phone.slice(-4)), phone: u.phone };
          $('home-name').textContent = store.user.name;
        }
      }).catch(function () {});
    trackEvent('app_open');
    refreshMessages();
  }
}

init();

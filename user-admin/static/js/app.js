/* ============================================================
   暖愈心伴 · 用户数据管理平台 —— 后台逻辑
   ============================================================ */
(function () {
  const API = '/api/admin';
  const TOKEN_KEY = 'warmmate_admin_token';
  let token = localStorage.getItem(TOKEN_KEY) || '';

  let admin = null;
  let pollTimer = null;
  let lastEventId = 0;
  let usersCache = [];
  let pendingSel = [];

  const EVENT_META = {
    app_open:         { label: '打开应用',   icon: '📱', cls: 'ico-1' },
    register:         { label: '注册账号',   icon: '✅', cls: 'ico-2' },
    login:            { label: '登录',       icon: '🔑', cls: 'ico-5' },
    chat_message:     { label: 'AI 对话',    icon: '💬', cls: 'ico-3' },
    chat_reply:       { label: '对话回复',   icon: '🤖', cls: 'ico-3' },
    scale_start:      { label: '开始测评',   icon: '📋', cls: 'ico-2' },
    scale_complete:   { label: '完成测评',   icon: '📊', cls: 'ico-2' },
    book_create:      { label: '预约咨询',   icon: '🧑‍⚕️', cls: 'ico-4' },
    article_read:     { label: '阅读科普',   icon: '📖', cls: 'ico-5' },
    article_favorite: { label: '收藏文章',   icon: '⭐', cls: 'ico-4' },
    message_received: { label: '收到建议',   icon: '✉️', cls: 'ico-4' },
  };
  const EV_META = (t) => EVENT_META[t] || { label: t || '-', icon: '🔹', cls: 'ico-5' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => ((s === null || s === undefined) ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- 请求 ---------- */
  async function api(path, opts) {
    opts = opts || {};
    const headers = { 'Authorization': 'Bearer ' + token };
    if (opts.body && typeof opts.body === 'object') { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
    const r = await fetch(API + path, { ...opts, headers });
    if (r.status === 401) { logout(false); throw new Error('未登录或登录已过期'); }
    if (!r.ok) { let m = '请求失败'; try { m = (await r.json()).detail || m; } catch (e) {} throw new Error(m); }
    return r.json();
  }
  function fmtDate(s) {
    if (!s) return '—';
    try { const d = new Date(s); if (isNaN(d)) return s; return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; }
  }

  /* ---------- 登录 ---------- */
  async function doLogin() {
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;
    const btn = $('login-btn');
    $('login-err').textContent = '';
    btn.disabled = true; btn.textContent = '登录中…';
    try {
      const r = await api('/login', { method: 'POST', body: { username, password } });
      token = r.token; admin = r.admin;
      localStorage.setItem(TOKEN_KEY, token);
      enterApp();
    } catch (e) {
      $('login-err').textContent = '账号或密码错误，请重试';
    } finally { btn.disabled = false; btn.textContent = '登 录'; }
  }

  function logout(showMsg) {
    localStorage.removeItem(TOKEN_KEY);
    token = ''; admin = null;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    $('app-view').style.display = 'none';
    $('login-view').style.display = 'flex';
    if (showMsg !== false) toast('已退出登录');
  }

  async function enterApp() {
    $('login-view').style.display = 'none';
    $('app-view').style.display = 'flex';
    if (!admin) { try { admin = await api('/me'); } catch (e) {} }
    $('who').innerHTML = `<b>${esc(admin ? admin.display_name : '管理员')}</b><br><span class="tag ${admin && admin.role === 'admin' ? 'role-admin' : 'role-doctor'}">${admin ? (admin.role === 'admin' ? '管理员' : '医生') : ''}</span>`;
    buildNav();
    showView('dashboard');
  }

  /* ---------- 导航 ---------- */
  const VIEWS = {
    dashboard: { t: '实时看板', s: '监控用户的 App 使用情况' },
    users: { t: '用户管理', s: '查看用户列表与使用统计' },
    events: { t: '使用明细', s: '用户使用行为流水' },
    messages: { t: '消息下发', s: '给用户发送关怀与建议' },
  };
  function buildNav() {
    const order = ['dashboard', 'users', 'events', 'messages'];
    const icons = { dashboard: '📊', users: '👥', events: '📝', messages: '✉️' };
    $('nav').innerHTML = order.map(v => `<div class="nv ${v === curView ? 'on' : ''}" data-v="${v}" onclick="showView('${v}')"><span class="ico">${icons[v]}</span>${VIEWS[v].t}</div>`).join('');
  }
  let curView = 'dashboard';
  function showView(v) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    curView = v;
    document.querySelectorAll('#nav .nv').forEach(x => x.classList.toggle('on', x.dataset.v === v));
    $('viewTitle').textContent = VIEWS[v].t;
    $('viewSub').textContent = VIEWS[v].s;
    const view = $('view');
    view.innerHTML = '<div class="spinner"></div>';
    if (v === 'dashboard') renderDashboard();
    else if (v === 'users') renderUsers();
    else if (v === 'events') renderEvents();
    else if (v === 'messages') renderMessages();
  }

  /* ---------- 实时看板 ---------- */
  async function renderDashboard() {
    const view = $('view');
    try {
      const o = await api('/overview');
      const byType = o.by_type || [];
      const max = Math.max(1, ...byType.map(x => x.count));
      const recent = (o.recent || []);
      recent.forEach(r => { if (r.id > lastEventId) lastEventId = r.id; });
      view.innerHTML = `
        <div class="grid kpi-grid">
          <div class="kpi green"><div class="n">${o.total_users}</div><div class="l">累计用户</div></div>
          <div class="kpi coral"><div class="n">${o.total_events}</div><div class="l">累计使用事件</div></div>
          <div class="kpi gold"><div class="n">${o.active_users_today}</div><div class="l">今日活跃用户</div></div>
          <div class="kpi violet"><div class="n">${recent.length}</div><div class="l">最近 24h 内动态</div></div>
        </div>
        <div class="grid cols-2">
          <div class="card">
            <h3>使用事件分布</h3>
            ${byType.map(x => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${EV_META(x.type).icon} ${EV_META(x.type).label}</span><b class="num">${x.count}</b></div><div style="height:8px;border-radius:99px;background:#f0ece5;overflow:hidden"><div style="height:100%;background:var(--brand);width:${(x.count/max*100).toFixed(0)}%"></div></div></div>`).join('')}
          </div>
          <div class="card">
            <h3>最近活跃用户</h3>
            ${recent.length ? recent.slice(-6).reverse().map(r => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px dashed var(--line)">
                <span class="phone">${esc(r.phone)}</span>
                <span><span class="tag tag-coral">${EV_META(r.type).icon} ${EV_META(r.type).label}</span></span>
              </div>`).join('') : '<div class="empty"><p>暂无动态</p></div>'}
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0">实时事件流</h3><span class="live"><span class="dot"></span>实时刷新中（每 3 秒）</span></div>
          <div class="feed" id="live-feed"></div>
        </div>
      `;
      const feed = $('live-feed');
      feed.innerHTML = recent.slice(-8).reverse().map(feedItem).join('');
      startPolling();
    } catch (e) { view.innerHTML = `<div class="empty"><span class="emoji">⚠️</span><p>${esc(e.message)}</p></div>`; }
  }

  async function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        const r = await api('/events?after_id=' + lastEventId);
        const evs = r.events || [];
        if (evs.length) {
          evs.forEach(e => { if (e.id > lastEventId) lastEventId = e.id; });
          const feed = $('live-feed');
          if (feed) {
            const items = evs.map(feedItem).join('');
            feed.insertAdjacentHTML('afterbegin', items);
            while (feed.children.length > 30) feed.removeChild(feed.lastChild);
          }
        }
      } catch (e) { /* 静默 */ }
    }, 3000);
  }

  function feedItem(e) {
    const m = EV_META(e.type);
    let detail = '';
    try { const d = JSON.parse(e.detail || '{}'); if (d.desc) detail = esc(d.desc); } catch (err) {}
    return `
      <div class="feed-item">
        <div class="e-ico ${m.cls}">${m.icon}</div>
        <div class="e-body">
          <div class="e-title"><b class="phone">${esc(e.phone)}</b> · ${m.label}</div>
          <div class="e-time">${fmtDate(e.created_at)}</div>
          ${detail ? `<div class="e-more">${detail}</div>` : ''}
        </div>
      </div>`;
  }

  /* ---------- 用户管理 ---------- */
  async function renderUsers() {
    const view = $('view');
    try {
      const r = await api('/users');
      usersCache = r.users || [];
      view.innerHTML = `
        <div class="toolbar">
          <input id="u-search" placeholder="🔍 搜索手机号 / 昵称" oninput="renderUsersTable()" style="min-width:260px">
          <span style="color:var(--text-3);font-size:13px">共 <b>${r.count}</b> 位用户</span>
          <span style="flex:1"></span>
          <button class="btn btn-ghost btn-sm" onclick="showView('messages')">✉️ 批量下发建议</button>
        </div>
        <div class="tbl-wrap"><table class="table">
          <thead><tr><th>用户</th><th>手机号</th><th>活跃</th><th>对话</th><th>测评</th><th>预约</th><th>未读建议</th><th>最近事件</th><th>操作</th></tr></thead>
          <tbody id="u-tbody"></tbody>
        </table></div>
      `;
      renderUsersTable();
    } catch (e) { view.innerHTML = `<div class="empty"><span class="emoji">⚠️</span><p>${esc(e.message)}</p></div>`; }
  }

  function renderUsersTable() {
    const q = ($('u-search') ? $('u-search').value : '').trim().toLowerCase();
    const tbody = $('u-tbody');
    const rows = usersCache.filter(u => !q || u.phone.includes(q) || (u.name || '').toLowerCase().includes(q));
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><p>没有匹配的用户</p></div></td></tr>`; return; }
    tbody.innerHTML = rows.map(u => `
      <tr>
        <td>${esc(u.name || '-')}</td>
        <td class="phone">${esc(u.phone)}</td>
        <td class="num">${fmtDate(u.last_seen_at)}</td>
        <td class="num">${u.chat_messages}</td>
        <td class="num">${u.scales}</td>
        <td class="num">${u.bookings}</td>
        <td>${u.unread_msgs ? `<span class="tag tag-coral">${u.unread_msgs} 条</span>` : '<span class="tag tag-gray">0</span>'}</td>
        <td>${u.last_event ? `${EV_META(u.last_event.type).icon} ${fmtDate(u.last_event.created_at)}` : '—'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="openUser('${esc(u.phone)}')">详情</button></td>
      </tr>`).join('');
  }

  async function openUser(phone) {
    try {
      const d = await api('/users/' + encodeURIComponent(phone));
      const u = d.user, s = d.stats;
      const evs = (d.events || []).slice(-8).reverse();
      const msgs = (d.messages || []).slice().reverse();
      openModal(`
        <div class="close" onclick="closeModal()">✕</div>
        <h3>${esc(u.name || '用户')} <span class="phone tag tag-gray">${esc(u.phone)}</span></h3>
        <div class="kv">
          <div class="k">设备</div><div>${esc(u.device || '—')}</div>
          <div class="k">App 版本</div><div>${esc(u.app_version || '—')}</div>
          <div class="k">注册时间</div><div>${fmtDate(u.created_at)}</div>
          <div class="k">最近活跃</div><div>${fmtDate(u.last_seen_at)}</div>
          <div class="k">累计事件</div><div><b>${s.events}</b>（对话 ${s.chat_messages} · 测评 ${s.scales} · 预约 ${s.bookings}）</div>
        </div>
        <div style="margin-bottom:14px"><button class="btn btn-accent btn-sm" onclick="quickSend('${esc(u.phone)}')">✉️ 发送建议</button></div>
        <h3>近期使用</h3>
        <div class="mini-list">${evs.length ? evs.map(e => `<div class="mi">${EV_META(e.type).icon} ${EV_META(e.type).label} <span class="msg-meta">${fmtDate(e.created_at)}</span></div>`).join('') : '<div class="empty"><p>暂无</p></div>'}</div>
        <h3 style="margin-top:16px">历史建议</h3>
        <div>${msgs.slice(0, 5).map(m => `<div class="msg-bubble">${esc(m.content)}<div class="msg-meta" style="margin-top:6px">${esc(m.sender_name)}（${m.sender_role === 'admin' ? '管理员' : '医生'}） · ${fmtDate(m.created_at)} · ${m.read ? '已读' : '未读'}</div></div>`).join('') || '<div class="empty"><p>暂无建议</p></div>'}</div>
      `);
    } catch (e) { toast(e.message); }
  }

  /* ---------- 使用明细 ---------- */
  async function renderEvents() {
    const view = $('view');
    const typeOptions = Object.keys(EVENT_META).concat(['']).sort();
    try {
      const r = await api('/events?after_id=0');
      window._allEvents = r.events || [];
      view.innerHTML = `
        <div class="toolbar">
          <select id="ev-type" onchange="renderEventsTable()"><option value="">全部类型</option>${Object.keys(EVENT_META).map(t => `<option value="${t}">${EV_META(t).icon} ${EV_META(t).label}</option>`).join('')}</select>
          <input id="ev-phone" placeholder="🔍 手机号" oninput="renderEventsTable()" style="min-width:180px">
          <span style="flex:1"></span>
          <span style="color:var(--text-3);font-size:13px" id="ev-count"></span>
          <button class="btn btn-ghost btn-sm" onclick="renderEvents()">刷新</button>
        </div>
        <div class="tbl-wrap"><table class="table">
          <thead><tr><th>时间</th><th>手机号</th><th>事件</th><th>详情</th></tr></thead>
          <tbody id="ev-tbody"></tbody>
        </table></div>
      `;
      renderEventsTable();
    } catch (e) { view.innerHTML = `<div class="empty"><span class="emoji">⚠️</span><p>${esc(e.message)}</p></div>`; }
  }

  function renderEventsTable() {
    const t = $('ev-type') ? $('ev-type').value : '';
    const q = ($('ev-phone') ? $('ev-phone').value : '').trim();
    const all = window._allEvents || [];
    const rows = all.filter(e => (!t || e.type === t) && (!q || e.phone.includes(q)));
    const tbody = $('ev-tbody');
    $('ev-count').textContent = '共 ' + rows.length + ' 条';
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="4"><div class="empty"><p>暂无明细</p></div></td></tr>`; return; }
    tbody.innerHTML = rows.slice(-120).reverse().map(e => {
      let d = '';
      try { const j = JSON.parse(e.detail || '{}'); d = j.desc || ''; } catch (err) {}
      return `<tr><td class="num">${fmtDate(e.created_at)}</td><td class="phone">${esc(e.phone)}</td><td><span class="tag tag-coral">${EV_META(e.type).icon} ${EV_META(e.type).label}</span></td><td>${esc(d || '—')}</td></tr>`;
    }).join('');
  }

  /* ---------- 消息下发 ---------- */
  async function renderMessages() {
    const view = $('view');
    try {
      const r = await api('/users');
      usersCache = r.users || [];
      const h = await api('/messages');
      view.innerHTML = `
        <div class="grid cols-2">
          <div class="card">
            <h3>选择接收用户</h3>
            <div class="toolbar"><input id="m-search" placeholder="🔍 手机号 / 昵称" oninput="renderRecipients()" style="min-width:200px"></div>
            <div class="mini-list" id="m-recipients" style="max-height:280px"></div>
            <div style="margin:10px 0;font-size:13px;color:var(--text-3)">已选 <b id="m-selected">0</b> 位</div>
          </div>
          <div class="card">
            <h3>编辑建议内容</h3>
            <div class="field"><label>内容（发给所选用户）</label><textarea id="m-content" placeholder="写一段温暖、具体、可执行的关怀建议……"></textarea></div>
            <button class="btn btn-primary btn-block" id="m-send" onclick="sendMessages()">发送给所选用户</button>
            <p style="font-size:12px;color:var(--text-3);margin-top:10px">提示：消息会写入数据库；用户打开 App 的消息中心即可查看。</p>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <h3>已下发的建议</h3>
          <div id="m-history"></div>
        </div>
      `;
      $('m-history').innerHTML = renderHistory(h.messages || []);
      renderRecipients();
      if (pendingSel.length) { setSel(pendingSel); pendingSel = []; }
    } catch (e) { view.innerHTML = `<div class="empty"><span class="emoji">⚠️</span><p>${esc(e.message)}</p></div>`; }
  }

  function renderRecipients() {
    const q = ($('m-search') ? $('m-search').value : '').trim().toLowerCase();
    const rows = usersCache.filter(u => !q || u.phone.includes(q) || (u.name || '').toLowerCase().includes(q));
    const cur = selectedRecipients();
    const list = $('m-recipients');
    if (!rows.length) { list.innerHTML = '<div class="empty"><p>没有用户</p></div>'; updateSelected(); return; }
    list.innerHTML = rows.map(u => `
      <div class="mi" style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="toggleMRecipient('${esc(u.phone)}')">
        <input type="checkbox" ${cur.includes(u.phone) ? 'checked' : ''} style="width:15px;height:15px;pointer-events:none">
        <span style="flex:1"><span class="phone">${esc(u.phone)}</span> · ${esc(u.name || '-')}</span>
        <span style="font-size:12px;color:var(--text-3)">事件 ${u.events}</span>
      </div>`).join('');
    updateSelected();
  }
  function selectedRecipients() {
    const el = $('m-sel');
    return el ? el.value.split(',').filter(Boolean) : [];
  }
  function updateSelected() {
    const el = $('m-sel'); const n = selectedRecipients().length;
    if ($('m-selected')) $('m-selected').textContent = n;
  }
  function toggleMRecipient(phone) {
    let list = selectedRecipients();
    const i = list.indexOf(phone);
    if (i >= 0) list.splice(i, 1); else list.push(phone);
    setSel(list);
  }
  function setSel(list) {
    let el = $('m-sel');
    if (!el) { el = document.createElement('input'); el.id = 'm-sel'; el.type = 'hidden'; document.body.appendChild(el); }
    el.value = list.join(',');
    renderRecipientsBox();
  }
  function renderRecipientsBox() {
    const sel = selectedRecipients();
    const list = $('m-recipients');
    if (!list) return;
    const q = ($('m-search') ? $('m-search').value : '').trim().toLowerCase();
    const rows = usersCache.filter(u => !q || u.phone.includes(q) || (u.name || '').toLowerCase().includes(q));
    list.innerHTML = rows.map(u => {
      const on = sel.includes(u.phone);
      return `<div class="mi" style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="toggleMRecipient('${esc(u.phone)}')"><input type="checkbox" ${on?'checked':''} style="width:15px;height:15px;pointer-events:none"><span style="flex:1"><span class="phone">${esc(u.phone)}</span> · ${esc(u.name || '-')}</span><span style="font-size:12px;color:var(--text-3)">事件 ${u.events}</span></div>`;
    }).join('');
    updateSelected();
  }
  function renderHistory(msgs) {
    if (!msgs || !msgs.length) return '<div class="empty"><span class="emoji">📭</span><p>暂无下发记录</p></div>';
    return msgs.slice(0, 30).map(m => `
      <div style="padding:8px 0;border-bottom:1px dashed var(--line)" class="msg-bubble" style="border-bottom:none;background:transparent">
        <div>${esc(m.content)}</div>
        <div class="msg-meta" style="margin-top:6px">→ <span class="phone">${esc(m.phone)}</span> · ${esc(m.sender_name)}（${m.sender_role==='admin'?'管理员':'医生'}） · ${fmtDate(m.created_at)} · ${m.read ? '已读' : '<span style="color:var(--brand)">未读</span>'}</div>
      </div>`).join('');
  }

  async function sendMessages() {
    const phones = selectedRecipients();
    const content = $('m-content').value.trim();
    if (!phones.length) return toast('请先选择接收用户');
    if (!content) return toast('请输入建议内容');
    try {
      await api('/messages', { method: 'POST', body: { phones, content } });
      toast('已发送给 ' + phones.length + ' 位用户 🌿');
      $('m-content').value = '';
      setSel([]);
      const h = await api('/messages');
      if ($('m-history')) $('m-history').innerHTML = renderHistory(h.messages || []);
    } catch (e) { toast(e.message); }
  }

  function quickSend(phone) {
    pendingSel = [phone];
    showView('messages');
  }

  /* ---------- 模态框 ---------- */
  function openModal(html) {
    const root = $('modalRoot');
    root.innerHTML = `<div class="modal-mask show" id="modal-mask" onclick="if(event.target===this)closeModal()"><div class="sheet">${html}</div></div>`;
  }
  function closeModal() { $('modalRoot').innerHTML = ''; }

  /* ---------- 提示 ---------- */
  let toastTimer = null;
  function toast(msg) {
    let t = $('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- 暴露给内联 onclick ---------- */
  window.showView = showView;
  window.logout = logout;
  window.openUser = openUser;
  window.closeModal = closeModal;
  window.renderUsersTable = renderUsersTable;
  window.renderEventsTable = renderEventsTable;
  window.renderRecipientsBox = renderRecipientsBox;
  window.toggleMRecipient = toggleMRecipient;
  window.sendMessages = sendMessages;
  window.quickSend = quickSend;
  window.renderRecipients = renderRecipients;

  /* ---------- 启动 ---------- */
  $('login-btn').addEventListener('click', doLogin);
  $('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  if (token) { enterApp(); } else { $('login-view').style.display = 'flex'; }
})();

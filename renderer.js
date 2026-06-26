const API = window.electronAPI;
let allItems = [];
let currentFilter = null;

const TYPE_LIST = {
  all:          { icon: '◉', label: '全部' },
  tasks:        { icon: '📋', label: '任务', color: '#4ecdc4' },
  ideas:        { icon: '💡', label: '想法', color: '#ffd700' },
  credentials:  { icon: '🔑', label: '账号', color: '#7ed321' },
  notes:        { icon: '📝', label: '备忘', color: '#9b59b6' },
  bookmarks:    { icon: '🔗', label: '链接', color: '#e74c3c' },
  journal:      { icon: '📔', label: '日记', color: '#f39c12' },
  reading:      { icon: '📚', label: '待读', color: '#1abc9c' },
  quotes:       { icon: '📜', label: '语录', color: '#8e44ad' },
};

// 精简关键词 → 类型映射（用于输入时实时预览场景）
const SCENE_KEYWORDS = {
  tasks: ['做', '完成', '实现', '开发', '写', '创建', '修复', '改', '处理', '安排', '计划', '准备', '提交', '需要', '必须', '要', '得做', 'todo', '待办', '任务', '买', '去'],
  ideas: ['想法', '创意', '灵感', '建议', '点子', '主意', '构思', '我觉得', '我建议', '也许', '能不能', '设想'],
  credentials: ['密码', '账号', '用户名', '邮箱', '登录', '注册', '账户', 'password', 'login', 'email'],
  notes: ['备忘', '记住', '别忘了', '提醒', '注意', '重要', '笔记', '记录'],
  bookmarks: ['链接', '网址', '网站', 'URL', 'https://', 'http://', '推荐', '收藏', '好文'],
  journal: ['今天', '心情', '感觉', '感受', '日记', '开心', '难过', '累', '加油'],
  reading: ['阅读', '读书', '看', '读', '学习', '书', '文章', '资料', '推荐', '想读'],
  quotes: ['说过', '名言', '金句', '语录', '引用', '经典', '道理'],
};

const inputField = document.getElementById('inputField');
const compactBar = document.getElementById('compactBar');
const sceneIcon = document.getElementById('sceneIcon');
const inputHint = document.getElementById('inputHint');
const expandIndicator = document.getElementById('expandIndicator');
const expandPanel = document.getElementById('expandPanel');
const filterBar = document.getElementById('filterBar');
const contentArea = document.getElementById('contentArea');

// ===== 输入场景实时检测 =====
let sceneTimer = null;

inputField.addEventListener('input', () => {
  clearTimeout(sceneTimer);
  const text = inputField.value.trim().toLowerCase();
  if (!text) {
    compactBar.className = 'compact-bar';
    sceneIcon.className = 'scene-icon';
    sceneIcon.textContent = '';
    inputField.placeholder = '写点什么...';
    return;
  }
  sceneTimer = setTimeout(() => {
    const type = detectSceneType(text);
    if (type) {
      const info = TYPE_LIST[type];
      compactBar.className = `compact-bar scene-${type}`;
      sceneIcon.className = 'scene-icon show';
      sceneIcon.textContent = info.icon;
      inputField.placeholder = `${info.label}...`;
    } else {
      compactBar.className = 'compact-bar';
      sceneIcon.className = 'scene-icon';
      sceneIcon.textContent = '';
    }
  }, 200);
});

function detectSceneType(text) {
  const scores = {};
  for (const [type, keywords] of Object.entries(SCENE_KEYWORDS)) {
    let s = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) s += 2;
    }
    if (/https?:\/\//.test(text)) s += 5;
    if (/^[我请需].*[做写创实买].*$/.test(text) && !/[。！？；]/.test(text)) s += 3;
    if (type === 'credentials' && /@/.test(text) && /密码/.test(text)) s += 8;
    if (type === 'bookmarks' && /https?:\/\//.test(text)) s += 5;
    if (type === 'journal' && /今天/.test(text)) s += 3;
    if (s > 0) scores[type] = s;
  }
  let best = null, bestScore = 0;
  for (const [t, s] of Object.entries(scores)) {
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}

// ===== 窗口交互 =====
compactBar.addEventListener('dblclick', () => API.toggleExpand());
expandIndicator.addEventListener('click', () => API.toggleExpand());

API.onExpanded((expanded) => {
  if (expanded) {
    expandPanel.classList.remove('hidden');
    loadAllData();
  } else {
    expandPanel.classList.add('hidden');
  }
});

inputField.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const text = inputField.value.trim();
    if (!text) return;
    inputField.disabled = true;
    const orig = inputField.placeholder;
    inputField.placeholder = '...';
    try {
      const result = await API.classifyAndSave(text);
      if (result) {
        inputHint.textContent = result.icon || TYPE_LIST[result.type]?.icon || '';
        inputHint.classList.add('show');
        inputField.value = '';
        compactBar.className = 'compact-bar';
        inputField.placeholder = '写点什么...';
        if (!expandPanel.classList.contains('hidden')) loadAllData();
        setTimeout(() => inputHint.classList.remove('show'), 1200);
      }
    } catch (e) {
      console.error(e);
    } finally {
      inputField.disabled = false;
      inputField.placeholder = orig;
      inputField.focus();
    }
  }
});

// ===== 数据加载 =====
async function loadAllData() {
  allItems = await API.getAllData();
  renderFilter();
  renderCards();
}

// ===== 筛选 =====
function getFilterLabel() {
  if (!currentFilter || currentFilter === 'all') return '全部';
  const info = TYPE_LIST[currentFilter];
  return info ? `${info.icon} ${info.label}` : '全部';
}

function renderFilter() {
  filterBar.innerHTML = `
    <span class="filter-label">${getFilterLabel()}</span>
    <span class="filter-arrow">▾</span>
  `;
}

filterBar.addEventListener('click', (e) => {
  e.stopPropagation();
  const existing = document.querySelector('.filter-dropdown');
  if (existing) { existing.remove(); return; }
  const dd = document.createElement('div');
  dd.className = 'filter-dropdown';
  dd.innerHTML = Object.entries(TYPE_LIST).map(([key, info]) => `
    <button class="filter-option ${key === (currentFilter || 'all') ? 'active' : ''}" data-type="${key}">
      ${info.icon} ${info.label}
    </button>
  `).join('');
  filterBar.appendChild(dd);
  dd.querySelectorAll('.filter-option').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const type = btn.dataset.type;
      currentFilter = type === 'all' ? null : type;
      dd.remove();
      renderFilter();
      renderCards();
    });
  });
});

document.addEventListener('click', () => {
  const dd = document.querySelector('.filter-dropdown');
  if (dd) dd.remove();
});

// ===== ⭐ 类型专属卡片渲染 =====
function renderCards() {
  let items = allItems;
  if (currentFilter) items = items.filter(i => i.type === currentFilter);

  if (items.length === 0) {
    contentArea.innerHTML = '<div class="empty-state"><div class="icon">⋯</div><div class="text">还没有记录</div></div>';
    return;
  }

  contentArea.innerHTML = items.map(item => {
    return `<div class="item-card" data-id="${item.id}" data-type="${item.type}">${renderCardBody(item)}</div>`;
  }).join('');

  bindCardEvents(items);
}

function renderCardBody(item) {
  const actions = `
    <div class="card-actions">
      <button class="card-action-btn" data-action="edit" title="编辑">✎</button>
      <button class="card-action-btn danger" data-action="delete" title="删除">✕</button>
    </div>
  `;

  switch (item.type) {
    case 'tasks': return renderTask(item, actions);
    case 'credentials': return renderCredential(item, actions);
    case 'journal': return renderJournal(item, actions);
    case 'ideas': return renderIdea(item, actions);
    case 'bookmarks': return renderBookmark(item, actions);
    case 'reading': return renderReading(item, actions);
    case 'quotes': return renderQuote(item, actions);
    case 'notes': return renderNote(item, actions);
    default: return renderDefault(item, actions);
  }
}

/* 📋 任务 */
function renderTask(item, actions) {
  const done = item.status === 'done';
  const pct = done ? 100 : 0;
  const priorityMap = { high: '高优', medium: '中优', low: '普通' };
  return `
    ${actions}
    <div class="task-card">
      <div class="task-row">
        <div class="task-checkbox ${done ? 'checked' : ''}" data-action="toggle-task">${done ? '✓' : ''}</div>
        <div class="task-info">
          <div class="task-title ${done ? 'done' : ''}">${escapeHtml(item.text)}</div>
          <div class="task-priority">${priorityMap[item.priority] || '普通'}</div>
        </div>
        <div class="task-badge">${done ? 'DONE' : 'NEW QUEST'}</div>
      </div>
      <div class="task-bar"><div class="task-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
}

/* 🔑 账号 */
function renderCredential(item, actions) {
  const p = item.parsed || {};
  const pwdDisplay = item.masked !== false ? '••••••••' : (p.password || '');
  return `
    ${actions}
    <div class="cred-card">
      <div class="cred-row">
        <div class="cred-icon">🔒</div>
        <div class="cred-info">
          ${p.url ? `<div class="cred-site">${escapeHtml(p.url)}</div>` : ''}
          ${p.username ? `<div class="cred-username">${escapeHtml(p.username)}</div>` : ''}
          <div class="cred-pwd" data-action="reveal-pwd" data-id="${item.id}">${pwdDisplay}</div>
        </div>
        <button class="cred-reveal-btn" data-action="toggle-mask" data-id="${item.id}">${item.masked !== false ? '揭开' : '隐藏'}</button>
        ${p.password ? `<button class="cred-copy-btn" data-action="copy-pwd" data-id="${item.id}">复制</button>` : ''}
      </div>
    </div>`;
}

/* 📔 日记 */
function renderJournal(item, actions) {
  const moodEmoji = { happy: '😊', sad: '😢', tired: '😴', anxious: '😰', calm: '😌', angry: '😠', neutral: '😐' };
  const moodLabel = { happy: '开心', sad: '难过', tired: '疲惫', anxious: '焦虑', calm: '平静', angry: '生气', neutral: '平静' };
  const d = new Date(item.timestamp);
  const dateStr = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
  return `
    ${actions}
    <div class="journal-card">
      <div class="journal-header">
        <span class="journal-date">${dateStr}</span>
        <span class="journal-mood">${moodEmoji[item.mood] || '😐'}</span>
      </div>
      <div class="journal-body">${escapeHtml(item.text)}</div>
      <div class="journal-footer">心情: ${moodLabel[item.mood] || '平静'}</div>
    </div>`;
}

/* 💡 想法 */
function renderIdea(item, actions) {
  return `
    ${actions}
    <div class="idea-card">
      <div class="idea-glow">💡</div>
      <div class="idea-title">${escapeHtml(item.text)}</div>
      ${item.notes && item.notes.length ? `<div class="idea-desc">${escapeHtml(item.notes[0])}</div>` : ''}
      <span class="idea-tag">${item.expanded ? '📝 已展开' : '+ 延伸笔记'}</span>
    </div>`;
}

/* 🔗 链接 */
function renderBookmark(item, actions) {
  const urls = item.urls || item.text.match(/https?:\/\/[^\s]+/g) || [];
  const url = urls[0] || '';
  let domain = '';
  try { if (url) domain = new URL(url).hostname; } catch(e) {}
  return `
    ${actions}
    <div class="link-card">
      <div class="link-row">
        <div class="link-favicon">🌐</div>
        <div class="link-text">
          <div class="link-name">${domain || escapeHtml(item.text.slice(0, 30))}</div>
          <div class="link-url">${escapeHtml(url)}</div>
        </div>
        ${url ? `<button class="link-btn" data-action="open-url" data-url="${escapeHtml(url)}">打开</button>` : ''}
      </div>
    </div>`;
}

/* 📚 待读 */
function renderReading(item, actions) {
  const pct = item.progress || 0;
  return `
    ${actions}
    <div class="reading-card">
      <div class="reading-row">
        <div class="reading-icon">📖</div>
        <div class="reading-info">
          <div class="reading-name">${escapeHtml(item.text)}</div>
          ${item.author ? `<div class="reading-author">${escapeHtml(item.author)}</div>` : ''}
        </div>
        <div class="reading-progress-num">${pct}%</div>
      </div>
      <div class="reading-bar"><div class="reading-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
}

/* 📜 语录 */
function renderQuote(item, actions) {
  return `
    ${actions}
    <div class="quote-card">
      <div class="quote-mark">"</div>
      <div class="quote-body">${escapeHtml(item.text)}</div>
      ${item.author ? `<div class="quote-author">—— ${escapeHtml(item.author)}</div>` : ''}
    </div>`;
}

/* 📝 备忘 */
function renderNote(item, actions) {
  const tags = (item.extra && item.extra.tags) || [];
  return `
    ${actions}
    <div class="memo-card">
      <div class="memo-pin"></div>
      <div class="memo-title">${escapeHtml(item.text)}</div>
      ${tags.length ? tags.map(t => `<span class="memo-tag">#${escapeHtml(t)}</span>`).join('') : ''}
    </div>`;
}

/* 兜底 */
function renderDefault(item, actions) {
  return `
    ${actions}
    <div style="padding:12px 14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:16px">${item.icon || ''}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:#444">${escapeHtml(item.text)}</div>
        <div style="font-size:10px;color:#ccc;margin-top:2px">${formatTime(item.timestamp)}</div>
      </div>
    </div>`;
}

// ===== 卡片事件绑定 =====
function bindCardEvents(items) {
  // 编辑
  contentArea.querySelectorAll('[data-action="edit"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = el.closest('.item-card');
      const item = items.find(i => i.id === card.dataset.id);
      if (!item) return;
      startEdit(card, item);
    });
  });

  // 删除
  contentArea.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = el.closest('.item-card');
      await API.deleteItem(card.dataset.id);
      loadAllData();
    });
  });

  // 任务切换
  contentArea.querySelectorAll('[data-action="toggle-task"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = el.closest('.item-card');
      const item = items.find(i => i.id === card.dataset.id);
      if (!item) return;
      const newStatus = item.status === 'done' ? 'pending' : 'done';
      await API.updateItem(item.id, { status: newStatus });
      loadAllData();
    });
  });

  // 密码掩码切换
  contentArea.querySelectorAll('[data-action="toggle-mask"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = el.closest('.item-card');
      const item = items.find(i => i.id === card.dataset.id);
      if (!item) return;
      const newMask = item.masked === false ? true : false;
      await API.updateItem(item.id, { masked: newMask });
      loadAllData();
    });
  });

  // 复制密码
  contentArea.querySelectorAll('[data-action="copy-pwd"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = el.closest('.item-card');
      const item = items.find(i => i.id === card.dataset.id);
      if (!item || !item.parsed?.password) return;
      try {
        await navigator.clipboard.writeText(item.parsed.password);
        el.textContent = '已复制';
        setTimeout(() => { el.textContent = '复制'; }, 1500);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = item.parsed.password;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        el.textContent = '已复制';
        setTimeout(() => { el.textContent = '复制'; }, 1500);
      }
    });
  });

  // 打开链接
  contentArea.querySelectorAll('[data-action="open-url"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = el.dataset.url;
      if (url) window.open(url, '_blank');
    });
  });
}

// ===== 行内编辑 =====
function startEdit(card, item) {
  const existingTextarea = card.querySelector('textarea');
  if (existingTextarea) return;

  const original = item.text;
  const body = card.querySelector('.card-actions')?.nextElementSibling || card.querySelector('.task-card') || card;
  const wrapper = document.createElement('div');
  wrapper.style.padding = '12px 14px';

  const textarea = document.createElement('textarea');
  textarea.className = 'edit-input';
  textarea.value = original;
  textarea.rows = 2;

  const saveBtn = document.createElement('button');
  saveBtn.className = 'edit-btn save';
  saveBtn.textContent = '保存';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'edit-btn cancel';
  cancelBtn.textContent = '取消';

  const actions = document.createElement('div');
  actions.className = 'edit-actions';
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  wrapper.appendChild(textarea);
  wrapper.appendChild(actions);

  const oldContent = card.innerHTML;
  card.innerHTML = '';
  card.appendChild(wrapper);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  const finish = async (save) => {
    if (save) {
      const v = textarea.value.trim();
      if (v && v !== original) {
        await API.updateItem(item.id, { text: v });
      }
    }
    loadAllData();
  };

  saveBtn.addEventListener('click', (ev) => { ev.stopPropagation(); finish(true); });
  cancelBtn.addEventListener('click', (ev) => { ev.stopPropagation(); finish(false); });
  textarea.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
    if (ev.key === 'Escape') { finish(false); }
  });
}

// ===== 工具函数 =====
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const n = new Date();
  const diff = n - d;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (d.getDate() === n.getDate() && d.getMonth() === n.getMonth())
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(n);
  y.setDate(y.getDate() - 1);
  if (d.getDate() === y.getDate() && d.getMonth() === y.getMonth()) return '昨天';
  if (d.getFullYear() === n.getFullYear())
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ===== 全局快捷键 =====
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    inputField.focus();
    inputField.select();
  }
  if (e.key === 'Escape' && !expandPanel.classList.contains('hidden')) {
    API.toggleExpand();
  }
});

inputField.focus();

if (!expandPanel.classList.contains('hidden')) {
  loadAllData();
}

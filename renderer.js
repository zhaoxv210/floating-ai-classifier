// =============================================================
// 渲染器 - 处理所有UI交互和渲染
// =============================================================

const API = window.electronAPI;
let currentTab = 'all';
let allItems = [];
let searchQuery = '';
let selectMode = false;
let selectedIds = new Set();

// 类型列表（用于重新分类下拉菜单）
const TYPE_LIST = {
  tasks:       { icon: '📋', label: '任务' },
  ideas:       { icon: '💡', label: '想法' },
  credentials: { icon: '🔑', label: '账号' },
  notes:       { icon: '📝', label: '备忘' },
  bookmarks:   { icon: '🔗', label: '链接' },
  journal:     { icon: '📔', label: '日记' },
  reading:     { icon: '📚', label: '待读' },
  quotes:      { icon: '📜', label: '语录' },
};

// ===== DOM引用 =====
const inputField = document.getElementById('inputField');
const expandBtn = document.getElementById('expandBtn');
const quitBtn = document.getElementById('quitBtn');
const expandPanel = document.getElementById('expandPanel');
const tabBar = document.getElementById('tabBar');
const searchField = document.getElementById('searchField');
const contentArea = document.getElementById('contentArea');
const feedbackBadge = document.getElementById('feedbackBadge');
const notification = document.getElementById('notification');
const dragHandle = document.getElementById('dragHandle');
const selectModeBtn = document.getElementById('selectModeBtn');
const batchBar = document.getElementById('batchBar');
const selectedCountEl = document.getElementById('selectedCount');

// ===== 窗口控制 =====
// 拖动由 CSS -webkit-app-region: drag 原生处理

// 展开/收缩
expandBtn.addEventListener('click', () => {
  API.toggleExpand();
});

// 展开状态监听
API.onExpanded((expanded) => {
  if (expanded) {
    expandPanel.classList.remove('hidden');
    expandBtn.textContent = '📂';
    expandBtn.title = '收起面板';
    loadAllData();
  } else {
    expandPanel.classList.add('hidden');
    expandBtn.textContent = '📁';
    expandBtn.title = '展开面板';
  }
});

// 退出
quitBtn.addEventListener('click', () => {
  window.close();
});

// ===== 主输入逻辑 =====

inputField.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const text = inputField.value.trim();
    if (!text) return;
    
    inputField.disabled = true;
    inputField.placeholder = '🤔 AI分析中...';
    
    try {
      const result = await API.classifyAndSave(text);
      if (result) {
        showFeedback(result);
        inputField.value = '';
        // 如果面板是展开的，刷新数据
        if (!expandPanel.classList.contains('hidden')) {
          loadAllData();
        }
      }
    } catch (err) {
      console.error('分类失败:', err);
      showNotification('⚠️ 分类失败，请重试');
    } finally {
      inputField.disabled = false;
      inputField.placeholder = '输入内容，AI自动分类...';
      inputField.focus();
    }
  }
});

// ===== 反馈显示 =====

let feedbackTimer = null;

function showFeedback(result) {
  // Badge显示
  feedbackBadge.textContent = result.icon;
  feedbackBadge.style.background = result.color;
  feedbackBadge.classList.add('show');
  
  // 通知显示
  showNotification(`${result.icon} 已归类 → ${result.category}`);
  
  // 清除旧定时器
  if (feedbackTimer) clearTimeout(feedbackTimer);
  
  // 3秒后隐藏Badge
  feedbackTimer = setTimeout(() => {
    feedbackBadge.classList.remove('show');
    feedbackBadge.style.background = 'transparent';
    feedbackBadge.textContent = '';
  }, 3000);
}

function showNotification(text) {
  notification.textContent = text;
  notification.classList.remove('hidden');
  
  setTimeout(() => {
    notification.classList.add('hidden');
  }, 2000);
}

// ===== 数据加载与渲染 =====

async function loadAllData() {
  try {
    allItems = await API.getAllData();
    renderTabs();
    renderCards();
  } catch (err) {
    console.error('加载数据失败:', err);
  }
}

function renderTabs() {
  // 统计各类型
  const typeCount = {};
  for (const item of allItems) {
    if (!typeCount[item.type]) {
      typeCount[item.type] = { count: 0, icon: item.icon, label: item.category };
    }
    typeCount[item.type].count++;
  }

  // 构建标签HTML
  let html = `<button class="tab-btn ${currentTab === 'all' ? 'active' : ''}" data-tab="all">
    全部 <span class="tab-count">${allItems.length}</span>
  </button>`;

  const typeOrder = ['tasks', 'ideas', 'credentials', 'notes', 'bookmarks', 'journal', 'reading', 'quotes'];
  for (const type of typeOrder) {
    if (typeCount[type]) {
      const { count, icon, label } = typeCount[type];
      const labelText = (label && icon && label.startsWith(icon)) ? label.slice(icon.length).trim() : (label || '');
      html += `<button class="tab-btn ${currentTab === type ? 'active' : ''}" data-tab="${type}">
        ${icon} ${labelText} <span class="tab-count">${count}</span>
      </button>`;
    }
  }

  tabBar.innerHTML = html;

  // 绑定点击事件
  tabBar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      renderTabs();
      renderCards();
    });
  });
}

function renderCards() {
  // 过滤
  let items = allItems;
  if (currentTab !== 'all') {
    items = items.filter(item => item.type === currentTab);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(item => 
      item.text.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.extra?.tags && item.extra.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  if (items.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <div class="icon">📭</div>
        <div class="text">还没有记录，输入内容试试吧</div>
      </div>
    `;
    return;
  }

  contentArea.innerHTML = items.map(item => renderCard(item)).join('');

  // 绑定卡片事件
  bindCardEvents(items);
}

// ===== 卡片渲染 =====

function renderCard(item) {
  const timeStr = formatTime(item.timestamp);
  const statusClass = item.status === 'done' ? 'checked' : '';
  const textDoneClass = item.status === 'done' ? 'done' : '';

  let extraContent = '';

  // 不同类型特殊渲染
  switch (item.type) {
    case 'tasks':
      extraContent = renderTaskExtra(item);
      break;
    case 'ideas':
      extraContent = renderIdeaExtra(item);
      break;
    case 'credentials':
      extraContent = renderCredentialExtra(item);
      break;
    case 'bookmarks':
      extraContent = renderBookmarkExtra(item);
      break;
    case 'journal':
      extraContent = renderJournalExtra(item);
      break;
    case 'reading':
      extraContent = renderReadingExtra(item);
      break;
    case 'quotes':
      extraContent = renderQuoteExtra(item);
      break;
  }

  // 如果 category 字符串以 icon 开头（默认规则中含 emoji），去掉重复的前缀
  const categoryLabel = (item.category && item.icon && item.category.startsWith(item.icon))
    ? item.category.slice(item.icon.length).trim()
    : (item.category || '');

  return `
    <div class="item-card ${selectMode ? 'select-mode' : ''} ${selectedIds.has(item.id) ? 'selected' : ''}" data-id="${item.id}" data-type="${item.type}">
      ${selectMode ? `<span class="select-checkbox ${selectedIds.has(item.id) ? 'checked' : ''}" data-action="select" data-id="${item.id}"></span>` : ''}
      <button class="delete-btn" data-action="delete" data-id="${item.id}">✕</button>
      <button class="edit-btn" data-action="edit" data-id="${item.id}" title="编辑">✎</button>
      <div class="card-header">
        <div class="card-category-badge" style="background: ${item.color}18; color: ${item.color}">
          <span class="icon">${item.icon}</span>
          ${categoryLabel}
          <span class="reclassify-trigger" data-action="reclassify" data-id="${item.id}" title="重新分类">↕</span>
        </div>
        <div class="card-time">${timeStr}</div>
      </div>
      <div class="reclassify-dropdown hidden" data-dropdown-id="${item.id}">
        ${Object.entries(TYPE_LIST).map(([key, info]) => `
          <button class="reclassify-option ${key === item.type ? 'current' : ''}" data-action="reclassify-to" data-id="${item.id}" data-type="${key}">
            ${info.icon} ${info.label}
          </button>
        `).join('')}
      </div>
      <div class="card-text ${textDoneClass}">
        ${item.type === 'tasks' ? `
          <span class="card-checkbox ${statusClass}" data-action="toggle-task" data-id="${item.id}"></span>
        ` : ''}
        ${item.type !== 'quotes' ? escapeHtml(item.text) : ''}
        ${item.priority ? `<span class="priority-badge ${item.priority}">● ${item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}</span>` : ''}
      </div>
      ${item.extra && item.extra.tags && item.extra.tags.length > 0 ? `
        <div class="card-tags">
          ${item.extra.tags.map(t => `<span class="tag-badge">#${escapeHtml(t)}</span>`).join('')}
        </div>
      ` : ''}
      ${extraContent}
    </div>
  `;
}

// 任务附加
function renderTaskExtra(item) {
  let html = '<div class="action-bar">';
  if (item.status === 'pending') {
    html += `<button class="action-btn" data-action="toggle-task" data-id="${item.id}">✅ 标记完成</button>`;
  } else {
    html += `<button class="action-btn" data-action="toggle-task" data-id="${item.id}">↩️ 重新打开</button>`;
  }
  html += `</div>`;
  return html;
}

// 想法附加
function renderIdeaExtra(item) {
  let html = '';
  if (item.notes && item.notes.length > 0) {
    html += '<div class="idea-notes">';
    for (const note of item.notes) {
      html += `<div class="idea-note-item">${escapeHtml(note)}</div>`;
    }
    html += '</div>';
  }
  html += `<button class="idea-expand-btn" data-action="add-idea-note" data-id="${item.id}">+ 添加想法延伸</button>`;
  return html;
}

// 账号密码附加
function renderCredentialExtra(item) {
  if (!item.parsed) return '';
  const p = item.parsed;
  let html = '<div class="credential-display">';
  
  if (p.email) {
    html += `
      <div class="credential-row">
        <span class="credential-label">📧 邮箱</span>
        <span class="credential-value" data-copy="${escapeAttr(p.email)}">${escapeHtml(p.email)}</span>
        <button class="credential-copy-btn" data-action="copy" data-value="${escapeAttr(p.email)}">复制</button>
      </div>
    `;
  }
  if (p.username) {
    html += `
      <div class="credential-row">
        <span class="credential-label">👤 账号</span>
        <span class="credential-value" data-copy="${escapeAttr(p.username)}">${escapeHtml(p.username)}</span>
        <button class="credential-copy-btn" data-action="copy" data-value="${escapeAttr(p.username)}">复制</button>
      </div>
    `;
  }
  if (p.password) {
    html += `
      <div class="credential-row">
        <span class="credential-label">🔑 密码</span>
        <span class="credential-value masked" data-action="toggle-mask" data-password="${escapeAttr(p.password)}">${escapeHtml(p.password)}</span>
        <button class="credential-copy-btn" data-action="copy" data-value="${escapeAttr(p.password)}">复制</button>
      </div>
    `;
  }
  if (p.url) {
    html += `
      <div class="credential-row">
        <span class="credential-label">🔗 网址</span>
        <span class="credential-value" style="color:#4A90D9;filter:none" data-action="open-url" data-url="${escapeAttr(p.url)}">${escapeHtml(p.url)}</span>
      </div>
    `;
  }
  
  html += '</div>';
  return html;
}

// 书签附加
function renderBookmarkExtra(item) {
  if (!item.urls || item.urls.length === 0) return '';
  return item.urls.map(url => `
    <div class="link-url" data-action="open-url" data-url="${escapeAttr(url)}">
      🔗 ${escapeHtml(url)}
    </div>
  `).join('');
}

// 日记附加
function renderJournalExtra(item) {
  const moodIcons = {
    happy: '😊',
    sad: '😢',
    tired: '😴',
    anxious: '😰',
    calm: '😌',
    angry: '😠',
    neutral: '😐',
  };
  if (item.mood) {
    return `<span class="mood-indicator">心情: ${moodIcons[item.mood] || '😐'}</span>`;
  }
  return '';
}

// 阅读附加
function renderReadingExtra(item) {
  if (item.progress !== undefined) {
    return `<div class="action-bar"><span class="action-btn">进度: ${item.progress}%</span></div>`;
  }
  return '';
}

// 语录附加
function renderQuoteExtra(item) {
  return '<div class="quote-text">' + escapeHtml(item.text) + '</div>';
}

// ===== 事件绑定 =====

function bindCardEvents(items) {
  // 任务切换 (通过按钮)
  contentArea.querySelectorAll('[data-action="toggle-task"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const item = items.find(i => i.id === id);
      if (!item) return;
      try {
        const newStatus = item.status === 'done' ? 'pending' : 'done';
        await API.updateItem(id, { status: newStatus });
        loadAllData();
      } catch {
        showNotification('⚠️ 操作失败，请重试');
      }
    });
  });

  // 删除
  contentArea.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      try {
        await API.deleteItem(id);
        showNotification('🗑️ 已删除');
        loadAllData();
      } catch {
        showNotification('⚠️ 删除失败，请重试');
      }
    });
  });

  // 复制
  contentArea.querySelectorAll('[data-action="copy"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const value = el.dataset.value;
      try {
        await navigator.clipboard.writeText(value);
        showNotification('📋 已复制到剪贴板');
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showNotification('📋 已复制到剪贴板');
      }
    });
  });

  // 打开URL
  contentArea.querySelectorAll('[data-action="open-url"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = el.dataset.url || el.textContent.replace(/[^\x00-\x7F]/g, '').trim();
      if (url) window.open(url, '_blank');
    });
  });

  // 密码掩码切换（点击切换，兼容触屏）
  contentArea.querySelectorAll('[data-action="toggle-mask"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      el.classList.toggle('masked');
    });
  });

  // 添加想法延伸
  contentArea.querySelectorAll('[data-action="add-idea-note"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const item = items.find(i => i.id === id);
      if (!item) return;
      
      // 使用内联输入框替代 prompt()
      const note = await showInlineInput(el, '添加延伸想法:');
      if (note && note.trim()) {
        const notes = item.notes || [];
        notes.push(note.trim());
        await API.updateItem(id, { notes });
        loadAllData();
        showNotification('💡 想法已延伸');
      }
    });
  });

  // 重新分类 - 打开下拉菜单
  contentArea.querySelectorAll('[data-action="reclassify"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const dropdown = contentArea.querySelector(`[data-dropdown-id="${id}"]`);
      if (!dropdown) return;
      // 关闭其他下拉菜单
      contentArea.querySelectorAll('.reclassify-dropdown:not(.hidden)').forEach(d => {
        if (d !== dropdown) d.classList.add('hidden');
      });
      dropdown.classList.toggle('hidden');
    });
  });

  // 重新分类 - 选择新类型
  contentArea.querySelectorAll('[data-action="reclassify-to"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const newType = el.dataset.type;
      try {
        await API.reclassifyItem(id, newType);
        showNotification('🔄 已重新分类');
        loadAllData();
      } catch {
        showNotification('⚠️ 重新分类失败');
      }
    });
  });

  // 编辑条目
  contentArea.querySelectorAll('[data-action="edit"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const item = items.find(i => i.id === id);
      if (!item) return;

      const card = el.closest('.item-card');
      const textEl = card.querySelector('.card-text');
      if (!textEl || textEl.querySelector('.edit-input')) return;

      // 保存原始内容用于取消
      const originalHtml = textEl.innerHTML;
      const originalText = item.text;

      // 替换为编辑输入框
      const input = document.createElement('textarea');
      input.className = 'edit-input';
      input.value = originalText;

      const saveBtn = document.createElement('button');
      saveBtn.className = 'edit-save-btn';
      saveBtn.textContent = '保存';

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'edit-cancel-btn';
      cancelBtn.textContent = '取消';

      const editWrap = document.createElement('div');
      editWrap.className = 'edit-wrap';
      editWrap.appendChild(input);
      editWrap.appendChild(saveBtn);
      editWrap.appendChild(cancelBtn);

      textEl.innerHTML = '';
      textEl.appendChild(editWrap);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);

      const finishEdit = async (save) => {
        if (save) {
          const newText = input.value.trim();
          if (newText && newText !== originalText) {
            await API.updateItem(id, { text: newText });
            showNotification('✏️ 已更新');
          }
        }
        loadAllData();
      };

      saveBtn.addEventListener('click', (ev) => { ev.stopPropagation(); finishEdit(true); });
      cancelBtn.addEventListener('click', (ev) => { ev.stopPropagation(); finishEdit(false); });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.stopPropagation(); ev.preventDefault(); finishEdit(true); }
        if (ev.key === 'Escape') { ev.stopPropagation(); finishEdit(false); }
      });
    });
  });

  // 多选 - 勾选条目
  contentArea.querySelectorAll('[data-action="select"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
      } else {
        selectedIds.add(id);
      }
      updateSelectedCount();
      renderCards();
    });
  });
}

// ===== 多选模式控制 =====

selectModeBtn.addEventListener('click', () => {
  selectMode = !selectMode;
  if (!selectMode) {
    selectedIds.clear();
    batchBar.classList.add('hidden');
  }
  selectModeBtn.textContent = selectMode ? '☑' : '☐';
  selectModeBtn.classList.toggle('active', selectMode);
  renderCards();
});

// 批量操作栏事件
batchBar.querySelectorAll('[data-batch]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const action = btn.dataset.batch;
    if (action === 'select-all') {
      // 全选当前可见条目
      let items = allItems;
      if (currentTab !== 'all') {
        items = items.filter(item => item.type === currentTab);
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        items = items.filter(item =>
          item.text.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      items.forEach(item => selectedIds.add(item.id));
      updateSelectedCount();
      renderCards();
    } else if (action === 'delete') {
      if (selectedIds.size === 0) return;
      try {
        await API.batchDelete([...selectedIds]);
        showNotification(`🗑️ 已删除 ${selectedIds.size} 条`);
        selectedIds.clear();
        exitSelectMode();
        loadAllData();
      } catch {
        showNotification('⚠️ 批量删除失败');
      }
    } else if (action === 'cancel') {
      exitSelectMode();
    }
  });
});

function updateSelectedCount() {
  selectedCountEl.textContent = selectedIds.size;
  if (selectMode && selectedIds.size > 0) {
    batchBar.classList.remove('hidden');
  } else {
    batchBar.classList.add('hidden');
  }
}

function exitSelectMode() {
  selectMode = false;
  selectedIds.clear();
  selectModeBtn.textContent = '☐';
  selectModeBtn.classList.remove('active');
  batchBar.classList.add('hidden');
  renderCards();
}

// ===== 数据导出 =====

document.querySelectorAll('[data-export]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const format = btn.dataset.export;
    try {
      const content = await API.exportData(format);
      if (!content) {
        showNotification('📭 没有数据可导出');
        return;
      }
      // 创建下载
      const ext = format === 'csv' ? 'csv' : format === 'markdown' ? 'md' : 'json';
      const mime = format === 'csv' ? 'text/csv' : format === 'markdown' ? 'text/markdown' : 'application/json';
      const blob = new Blob(['\uFEFF' + content], { type: mime + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `分类数据_${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification(`📥 已导出 ${format.toUpperCase()} 文件`);
    } catch {
      showNotification('⚠️ 导出失败');
    }
  });
});

// ===== 内联输入（替代 prompt） =====

function showInlineInput(anchorEl, placeholder) {
  return new Promise((resolve) => {
    // 移除已有的内联输入
    const existing = document.querySelector('.inline-input-wrap');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'inline-input-wrap';
    wrap.innerHTML = `
      <input type="text" class="inline-input" placeholder="${escapeAttr(placeholder)}">
      <button class="inline-input-ok">确定</button>
      <button class="inline-input-cancel">取消</button>
    `;

    const input = wrap.querySelector('.inline-input');
    const okBtn = wrap.querySelector('.inline-input-ok');
    const cancelBtn = wrap.querySelector('.inline-input-cancel');

    const finish = (value) => {
      wrap.remove();
      resolve(value);
    };

    okBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      finish(input.value || null);
    });
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      finish(null);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.stopPropagation();
        finish(input.value || null);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        finish(null);
      }
    });

    anchorEl.parentElement.insertBefore(wrap, anchorEl.nextSibling);
    input.focus();
  });
}

// ===== 搜索 =====

searchField.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  renderCards();
});

// ===== 工具函数 =====

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  // 今天
  if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth()) {
    return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  // 今年
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===== 初始化 =====

// 焦点自动在输入框
inputField.focus();

// 点击空白处关闭重新分类下拉菜单
document.addEventListener('click', () => {
  document.querySelectorAll('.reclassify-dropdown:not(.hidden)').forEach(d => {
    d.classList.add('hidden');
  });
});

// 快捷键
document.addEventListener('keydown', (e) => {
  // Ctrl+N: 聚焦输入框
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    inputField.focus();
    inputField.select();
  }
  // Ctrl+F: 聚焦搜索框（仅在面板展开时）
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    if (!expandPanel.classList.contains('hidden')) {
      e.preventDefault();
      searchField.focus();
      searchField.select();
    }
  }
  // Esc: 关闭面板 / 退出多选 / 取消搜索
  if (e.key === 'Escape') {
    if (selectMode) {
      exitSelectMode();
    } else if (document.activeElement === searchField) {
      searchField.value = '';
      searchQuery = '';
      searchField.blur();
      renderCards();
    } else if (!expandPanel.classList.contains('hidden')) {
      API.toggleExpand();
    }
  }
});

// 隐藏默认加载未展开时的面板
if (!expandPanel.classList.contains('hidden')) {
  loadAllData();
}

console.log('🚀 AI浮动分类窗已启动');
console.log('💡 快捷键: Ctrl+Shift+Space (显示/隐藏) | Ctrl+N (输入) | Ctrl+F (搜索) | Esc (关闭)');
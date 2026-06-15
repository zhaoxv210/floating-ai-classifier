const API = window.electronAPI;
let allItems = [];
let currentFilter = null;

const TYPE_LIST = {
  all:          { icon: '',    label: '全部' },
  tasks:        { icon: '', label: '任务' },
  ideas:        { icon: '',   label: '想法' },
  credentials:  { icon: '', label: '账号' },
  notes:        { icon: '',   label: '备忘' },
  bookmarks:    { icon: '',  label: '链接' },
  journal:      { icon: '',  label: '日记' },
  reading:      { icon: '', label: '待读' },
  quotes:       { icon: '',  label: '语录' },
};

const inputField = document.getElementById('inputField');
const compactBar = document.getElementById('compactBar');
const inputHint = document.getElementById('inputHint');
const expandIndicator = document.getElementById('expandIndicator');
const expandPanel = document.getElementById('expandPanel');
const filterBar = document.getElementById('filterBar');
const contentArea = document.getElementById('contentArea');

compactBar.addEventListener('dblclick', () => {
  API.toggleExpand();
});

expandIndicator.addEventListener('click', () => {
  API.toggleExpand();
});

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
        inputHint.textContent = result.icon;
        inputHint.classList.add('show');
        inputField.value = '';
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

async function loadAllData() {
  allItems = await API.getAllData();
  renderFilter();
  renderCards();
}

function getFilterLabel() {
  if (!currentFilter || currentFilter === 'all') return '全部';
  const info = TYPE_LIST[currentFilter];
  return info ? info.label : '全部';
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
      ${info.label}
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

function renderCards() {
  let items = allItems;
  if (currentFilter) items = items.filter(i => i.type === currentFilter);

  if (items.length === 0) {
    contentArea.innerHTML = '<div class="empty-state"><div class="icon">⋯</div><div class="text">还没有记录</div></div>';
    return;
  }

  contentArea.innerHTML = items.map(item => {
    const done = item.status === 'done' ? 'done' : '';
    return `
      <div class="item-card" data-id="${item.id}" data-type="${item.type}">
        <div class="card-context-menu">
          <button class="context-btn" data-action="edit" title="编辑">✎</button>
          <button class="context-btn danger" data-action="delete" title="删除">✕</button>
        </div>
        <div class="card-icon">${item.icon || ''}</div>
        <div class="card-body">
          <div class="card-text ${done}" data-action="click-card">${escapeHtml(item.text)}</div>
          <div class="card-meta">${formatTime(item.timestamp)}${item.category ? ' · ' + item.category.replace(item.icon || '', '').trim() : ''}</div>
        </div>
      </div>
    `;
  }).join('');

  bindCardEvents(items);
}

function bindCardEvents(items) {
  contentArea.querySelectorAll('[data-action="click-card"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = el.closest('.item-card');
      const item = items.find(i => i.id === card.dataset.id);
      if (!item) return;

      switch (item.type) {
        case 'tasks': {
          const newStatus = item.status === 'done' ? 'pending' : 'done';
          await API.updateItem(item.id, { status: newStatus });
          loadAllData();
          break;
        }
        case 'bookmarks': {
          const urls = item.text.match(/https?:\/\/[^\s]+/g);
          if (urls) window.open(urls[0], '_blank');
          break;
        }
        case 'credentials': {
          const pwd = item.parsed?.password;
          if (pwd) {
            try {
              await navigator.clipboard.writeText(pwd);
            } catch (e) {
              const ta = document.createElement('textarea');
              ta.value = pwd;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
          }
          break;
        }
      }
    });
  });

  contentArea.querySelectorAll('[data-action="delete"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = el.closest('.item-card');
      await API.deleteItem(card.dataset.id);
      loadAllData();
    });
  });

  contentArea.querySelectorAll('[data-action="edit"]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = el.closest('.item-card');
      const item = items.find(i => i.id === card.dataset.id);
      if (!item) return;

      const textEl = card.querySelector('.card-text');
      if (textEl.querySelector('textarea')) return;

      const original = item.text;
      const textarea = document.createElement('textarea');
      textarea.className = 'edit-input';
      textarea.value = original;

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

      textEl.innerHTML = '';
      textEl.appendChild(textarea);
      textEl.appendChild(actions);
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
    });
  });
}

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

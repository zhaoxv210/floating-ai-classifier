const fs = require('fs');
const path = require('path');
const os = require('os');
let safeStorage;
try {
  safeStorage = require('electron').safeStorage;
} catch (e) {
  safeStorage = null;
}

class Store {
  constructor() {
    this.dataDir = path.join(os.homedir(), '.floating-classifier');
    this.dataFile = path.join(this.dataDir, 'data.json');
    this.canEncrypt = safeStorage ? safeStorage.isEncryptionAvailable() : false;
    this.data = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf-8');
        const data = JSON.parse(raw);
        this._decryptItems(data.items || []);
        return data;
      }
    } catch (e) {
      console.error('加载数据失败:', e);
    }
    return { items: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  save() {
    try {
      this.data.updatedAt = new Date().toISOString();
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const dataCopy = JSON.parse(JSON.stringify(this.data));
      this._encryptItems(dataCopy.items);
      fs.writeFileSync(this.dataFile, JSON.stringify(dataCopy, null, 2), 'utf-8');
    } catch (e) {
      console.error('保存数据失败:', e);
    }
  }

  _encryptItems(items) {
    if (!this.canEncrypt) return;
    for (const item of items) {
      if (item.parsed && item.parsed.password && typeof item.parsed.password === 'string') {
        try {
          const encrypted = safeStorage.encryptString(item.parsed.password);
          item.parsed.password = { __e: true, d: encrypted.toString('base64') };
        } catch (e) {
          console.error('加密密码失败:', e);
        }
      }
    }
  }

  _decryptItems(items) {
    if (!this.canEncrypt) return;
    for (const item of items) {
      if (item.parsed && item.parsed.password && typeof item.parsed.password === 'object' && item.parsed.password.__e) {
        try {
          const buf = Buffer.from(item.parsed.password.d, 'base64');
          item.parsed.password = safeStorage.decryptString(buf);
        } catch (e) {
          console.error('解密密码失败:', e);
        }
      }
    }
  }

  getAll() {
    return this.data.items;
  }

  getByType(type) {
    return this.data.items.filter(item => item.type === type);
  }

  getById(id) {
    return this.data.items.find(item => item.id === id);
  }

  add(item) {
    this.data.items.unshift(item); // 新数据放前面
    return item;
  }

  update(id, updates) {
    const index = this.data.items.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data.items[index] = { ...this.data.items[index], ...updates, updatedAt: new Date().toISOString() };
      return this.data.items[index];
    }
    return null;
  }

  delete(id) {
    const index = this.data.items.findIndex(item => item.id === id);
    if (index !== -1) {
      this.data.items.splice(index, 1);
      return true;
    }
    return false;
  }

  batchDelete(ids) {
    const idSet = new Set(ids);
    this.data.items = this.data.items.filter(item => !idSet.has(item.id));
    return ids.length;
  }

  getStats() {
    const items = this.data.items;
    const stats = {
      total: items.length,
      byType: {},
      today: 0,
      week: 0,
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    for (const item of items) {
      // 按类型统计
      if (!stats.byType[item.type]) {
        stats.byType[item.type] = { count: 0, label: item.category, icon: item.icon };
      }
      stats.byType[item.type].count++;

      // 时间统计
      const itemDate = new Date(item.timestamp);
      if (itemDate >= todayStart) stats.today++;
      if (itemDate >= weekStart) stats.week++;
    }

    return stats;
  }

  search(query) {
    const q = query.toLowerCase();
    return this.data.items.filter(item => 
      item.text.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.extra && item.extra.tags && item.extra.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  exportToJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  exportToCSV() {
    const items = this.data.items;
    if (items.length === 0) return '';
    const headers = ['类型', '分类', '内容', '时间', '优先级', '状态', '标签'];
    const rows = items.map(item => [
      item.type,
      item.category || '',
      `"${(item.text || '').replace(/"/g, '""')}"`,
      item.timestamp || '',
      item.priority || '',
      item.status || '',
      (item.extra && item.extra.tags) ? item.extra.tags.join(';') : '',
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  exportToMarkdown() {
    const items = this.data.items;
    if (items.length === 0) return '';
    let md = '# AI 浮动分类窗 - 数据导出\n\n';
    md += `> 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

    const byType = {};
    for (const item of items) {
      if (!byType[item.type]) byType[item.type] = [];
      byType[item.type].push(item);
    }

    for (const [type, typeItems] of Object.entries(byType)) {
      const first = typeItems[0];
      md += `## ${first.icon || ''} ${first.category || type}\n\n`;
      for (const item of typeItems) {
        const time = new Date(item.timestamp).toLocaleString('zh-CN');
        const status = item.status === 'done' ? ' [x]' : item.status === 'pending' ? ' [ ]' : '';
        md += `- ${status} ${item.text} _${time}_\n`;
      }
      md += '\n';
    }
    return md;
  }

  importFromJSON(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      if (data.items && Array.isArray(data.items)) {
        this.data.items = [...data.items, ...this.data.items];
        this.save();
        return true;
      }
    } catch (e) {
      console.error('导入数据失败:', e);
    }
    return false;
  }

  clear() {
    this.data.items = [];
    this.save();
  }
}

module.exports = Store;
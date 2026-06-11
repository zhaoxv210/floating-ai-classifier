const fs = require('fs');
const path = require('path');
const os = require('os');

class Store {
  constructor() {
    // 数据目录：用户数据目录下的 .floating-classifier
    this.dataDir = path.join(os.homedir(), '.floating-classifier');
    this.dataFile = path.join(this.dataDir, 'data.json');
    this.data = this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf-8');
        return JSON.parse(raw);
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
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('保存数据失败:', e);
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
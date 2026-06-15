const fs = require('fs');
const path = require('path');

// 默认分类规则 - 关键词匹配 + 智能启发式
const DEFAULT_RULES = {
  // ===== 任务类型 =====
  tasks: {
    label: '📋 任务',
    icon: '📋',
    color: '#4A90D9',
    keywords: [
      '做', '完成', '实现', '开发', '写', '创建', '构建', '修复', '改', '处理',
      '安排', '计划', '准备', '提交', '审核', '测试', '部署', '优化', '重构',
      '需要', '必须', '应该', '要', '得做', 'todo', '待办', '任务',
    ],
    patterns: [
      /我要(做|写|实现|开发|完成|创建|改|修|处理)/i,
      /(需要|必须|应该)(做|完成|实现|处理|修)/i,
      /(安排|计划|准备)(.*)(会议|任务|工作|报告)/i,
      /请(帮|协助|处理|完成|做)/i,
    ],
    // 任务的额外操作
    actions: ['checkbox', 'priority', 'dueDate'],
    defaultStatus: 'pending', // pending | done | cancelled
  },

  // ===== 想法类型 =====
  ideas: {
    label: '💡 想法',
    icon: '💡',
    color: '#F5A623',
    keywords: [
      '想法', '创意', '灵感', '建议', '点子', '主意', '构思', '概念',
      '我觉得', '我想', '我建议', '也许可以', '能不能', '可否',
      '设想', '蓝图', '愿景',
    ],
    patterns: [
      /我(有|想到|觉得|认为|建议|提议)(一个|个)?(想法|创意|点子|主意)/i,
      /(灵感|启发)来自于/i,
      /如果(能|可以)(.*)(就|会)(更|太|很好)/i,
      /何不|为何不|要不(我们|咱们)/i,
    ],
    actions: ['expand', 'note', 'references'],
  },

  // ===== 账号密码类型 =====
  credentials: {
    label: '🔑 账号',
    icon: '🔑',
    color: '#7ED321',
    keywords: [
      '密码', '账号', '用户名', '邮箱', '登录', '注册', '账户',
      'password', 'username', 'login', 'email', 'account',
    ],
    patterns: [
      /(账号|账户|用户名|帐号)\s*[：:]\s*\S+/i,
      /(密码|passwd)\s*[：:]\s*\S+/i,
      /(邮箱|email)\s*[：:]\s*\S+/i,
      /\S+@\S+\.\S+\s+密码/i,
    ],
    actions: ['masked', 'copy', 'open-url'],
    // 自动检测账号密码对
    extractCredentials: true,
  },

  // ===== 备忘录类型 =====
  notes: {
    label: '📝 备忘',
    icon: '📝',
    color: '#9B59B6',
    keywords: [
      '备忘', '记住', '别忘了', '提醒', '注意', '重要',
      '笔记', '记录', '摘录', '摘要', '总结',
    ],
    patterns: [
      /(备忘|提醒|注意)(一下|一?下)?[：:]/i,
      /记住[：:]/i,
      /重要[：:].*/i,
    ],
    actions: ['pin', 'tag'],
  },

  // ===== 书签/链接类型 =====
  bookmarks: {
    label: '🔗 链接',
    icon: '🔗',
    color: '#E74C3C',
    keywords: [
      '链接', '网址', '网站', 'URL', '地址', '收藏',
      '推荐', '好文', '文章', '视频',
    ],
    patterns: [
      /https?:\/\/[^\s]+/i,
      /(推荐|分享)(一个|个)?(链接|网址|网站|文章|视频)/i,
      /(这个|这篇|这个)(文章|网站|视频|页面)(很|非常|不错|值得)/i,
    ],
    actions: ['open-url', 'preview'],
    // 自动提取URL
    extractUrls: true,
  },

  // ===== 日记/心情类型 =====
  journal: {
    label: '📔 日记',
    icon: '📔',
    color: '#F39C12',
    keywords: [
      '今天', '心情', '感觉', '感受', '日记', '感慨',
      '开心', '难过', '累', '加油', '努力',
    ],
    patterns: [
      /今天(.*)(了|啊|吧|呢)/i,
      /(开心|难过|兴奋|疲惫|焦虑|无聊|充实的)(一?天|感觉)/i,
      /(记录|写日记)(.*)/i,
    ],
    actions: ['mood', 'date'],
  },

  // ===== 待阅读类型 =====
  reading: {
    label: '📚 待读',
    icon: '📚',
    color: '#1ABC9C',
    keywords: [
      '阅读', '读书', '看', '读', '学习', '了解',
      '书', '文章', '资料', '文档',
    ],
    patterns: [
      /(推荐|想读|在读|读完)(.*)(书|文章|资料|文档)/i,
      /(有(什么|哪些)?(书|文章|资料)(推荐|可以看)?)/i,
      /有空(读|看|学习)(一下|一?下)/i,
    ],
    actions: ['progress', 'rating'],
  },

  // ===== 灵感/引用 =====
  quotes: {
    label: '📜 语录',
    icon: '📜',
    color: '#8E44AD',
    keywords: [
      '说过', '名言', '金句', '语录', '引用', 'quote',
      '经典', '道理', '话',
    ],
    patterns: [
      /["""].*[""]/i,
      /(.*)(曾|说过|讲道|认为):/i,
      /(名言|金句|语录)[：:]/i,
    ],
    actions: ['copy', 'author'],
  },
};

class Classifier {
  constructor(store) {
    this.store = store;
    this.rulesFile = path.join(store.dataDir, 'classification-rules.json');
    this.rules = this.loadRules();
    const cfg = store.getOllamaConfig();
    this.ollamaConfig = { ...cfg, enabled: false };
  }

  setOllamaConfig(config) {
    this.ollamaConfig = { ...this.ollamaConfig, ...config };
  }

  loadRules() {
    try {
      if (fs.existsSync(this.rulesFile)) {
        let data = fs.readFileSync(this.rulesFile, 'utf-8');
        if (data.charCodeAt(0) === 0xFEFF) data = data.slice(1);
        return JSON.parse(data, reviveRule);
      }
    } catch (e) {
      console.error('加载分类规则失败:', e);
    }
    // 如果规则文件不存在或加载失败，从默认规则创建
    const defaultData = {};
    for (const [key, value] of Object.entries(DEFAULT_RULES)) {
      defaultData[key] = deepClone(value);
    }
    return defaultData;
  }

  saveRules() {
    try {
      const dir = path.dirname(this.rulesFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.rulesFile, JSON.stringify(this.rules, serializeRule, 2), 'utf-8');
    } catch (e) {
      console.error('保存分类规则失败:', e);
    }
  }

  getRules() {
    return this.rules;
  }

  updateRules(newRules) {
    this.rules = newRules;
  }

  /**
   * Ollama AI 分类
   */
  async classifyWithOllama(text) {
    if (!this.ollamaConfig.enabled) return null;

    const { host, model } = this.ollamaConfig;
    const url = `${host.replace(/\/+$/, '')}/api/generate`;

    const prompt = `你是一个文本分类助手。将用户输入的文本分类到以下类别之一：

tasks: 📋 任务 — 需要执行/完成的事情，如"要做xxx"、"帮我xxx"、"安排会议"
ideas: 💡 想法 — 创意、灵感、建议，如"我想到一个点子"、"也许可以xx"
credentials: 🔑 账号 — 账号密码、登录信息，如"邮箱xxx密码xxx"
notes: 📝 备忘 — 需要记住的信息，如"别忘了xx"、"提醒xx"
bookmarks: 🔗 链接 — 网址、推荐的文章/视频
journal: 📔 日记 — 个人经历、感受、日常记录，如"今天xxx了"、"心情xxx"
reading: 📚 待读 — 想看的书/文章/资料
quotes: 📜 语录 — 名言、引用、某人说过的话

要求：
- 只返回 JSON：{"type": "类型key", "reason": "简短中文原因"}
- 如果是个人经历、感受、日常描述 → journal
- 如果是需要做的事 → tasks
- 不确定则 "notes"
- 不要返回其他内容

输入文本：${text}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, temperature: 0.1 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;

      const data = await res.json();
      const responseText = data.response || '';

      let parsed;
      const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }

      if (parsed && parsed.type && this.rules[parsed.type]) {
        return parsed.type;
      }
      return null;
    } catch (e) {
      console.error('Ollama 分类失败:', e.message);
      return null;
    }
  }

  /**
   * 分类主逻辑
   * 支持强制分类：输入 #类型名 内容 来强制指定分类
   */
  async classify(text) {
    // 0. 检查强制分类前缀 (#类型名)
    const forceMatch = text.match(/^#([a-zA-Z\u4e00-\u9fa5]+)[\s:：]+/);
    let forceType = null;
    let cleanText = text;

    if (forceMatch) {
      const typeHint = forceMatch[1].toLowerCase();
      // 类型名映射（支持中文和英文）
      const typeMap = {
        '任务': 'tasks', 'task': 'tasks', 'todo': 'tasks', '待办': 'tasks',
        '想法': 'ideas', 'idea': 'ideas', '创意': 'ideas',
        '账号': 'credentials', 'account': 'credentials', '密码': 'credentials', 'credential': 'credentials',
        '备忘': 'notes', 'note': 'notes', '笔记': 'notes', '备忘录': 'notes',
        '链接': 'bookmarks', 'link': 'bookmarks', 'bookmark': 'bookmarks', '书签': 'bookmarks',
        '日记': 'journal', 'journal': 'journal', '心情': 'journal',
        '待读': 'reading', 'reading': 'reading', '阅读': 'reading',
        '语录': 'quotes', 'quote': 'quotes', '名言': 'quotes',
      };
      forceType = typeMap[typeHint] || typeHint;
      cleanText = text.slice(forceMatch[0].length).trim();

      // 如果强制类型有效，直接返回
      if (this.rules[forceType]) {
        return this.buildResult(cleanText, forceType, 100, 'forced');
      }
    }

    // 如果启用了 Ollama，优先使用 AI 分类
    if (this.ollamaConfig.enabled) {
      const ollamaType = await this.classifyWithOllama(cleanText);
      if (ollamaType) {
        return this.buildResult(cleanText, ollamaType, 95, 'ollama');
      }
    }

    // 1. 计算每个分类的匹配分数
    const scores = {};
    const matches = {};

    for (const [type, rule] of Object.entries(this.rules)) {
      let score = 0;
      const matchedItems = [];

      // 关键词匹配
      for (const keyword of rule.keywords) {
        if (cleanText.includes(keyword)) {
          score += 2;
          matchedItems.push({ type: 'keyword', value: keyword });
        }
      }

      // 正则匹配
      for (const pattern of rule.patterns) {
        const match = cleanText.match(pattern);
        if (match) {
          score += 5;
          matchedItems.push({ type: 'pattern', value: match[0] });
        }
      }

      // URL检测 - 如果包含URL且该类型支持提取URL
      if (rule.extractUrls && /https?:\/\/[^\s]+/.test(cleanText)) {
        score += 3;
        matchedItems.push({ type: 'url', value: cleanText.match(/https?:\/\/[^\s]+/)[0] });
      }

      // 账号密码对检测
      if (rule.extractCredentials) {
        const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(cleanText);
        const hasPwd = /密码[：:]\s*\S+/.test(cleanText) || /password[：:]\s*\S+/i.test(cleanText);
        if (hasEmail && hasPwd) {
          score += 10; // 强匹配
          matchedItems.push({ type: 'credential_pair' });
        }
      }

      // 检测是否像待办事项（以动词开头且简短）
      if (type === 'tasks' && cleanText.length < 50) {
        if (/[我请需].*[做写创实].*/.test(cleanText) && !/[。！？；]/.test(cleanText)) {
          score += 1;
        }
      }

      if (score > 0) {
        scores[type] = score;
        matches[type] = matchedItems;
      }
    }

    // 2. 确定最佳分类
    let bestType = 'notes'; // 默认为备忘录
    let bestScore = 0;

    for (const [type, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // 3. 构建结果对象
    return this.buildResult(cleanText, bestType, bestScore, this.ollamaConfig.enabled ? 'ollama_fallback' : 'auto');
  }

  /**
   * 构建分类结果对象
   */
  buildResult(text, type, score, source) {
    const rule = this.rules[type];
    const result = {
      id: this.generateId(),
      text: text,
      type: type,
      category: rule.label,
      color: rule.color,
      icon: rule.icon,
      timestamp: new Date().toISOString(),
      score: score,
      source: source, // 'auto' | 'forced'
      extra: this.extractExtra(text, type),
    };

    // 添加类型特定的默认属性
    switch (type) {
      case 'tasks':
        result.status = 'pending';
        result.priority = this.detectPriority(text);
        break;
      case 'ideas':
        result.expanded = false;
        result.notes = [];
        break;
      case 'credentials':
        result.masked = true;
        result.parsed = this.parseCredentials(text);
        break;
      case 'bookmarks':
        result.urls = text.match(/https?:\/\/[^\s]+/g) || [];
        break;
      case 'journal':
        result.mood = this.detectMood(text);
        break;
      case 'reading':
        result.progress = 0;
        break;
      case 'quotes':
        result.author = '';
        break;
    }

    return result;
  }

  /**
   * 解析账号信息
   */
  parseCredentials(text) {
    const result = { username: '', password: '', url: '', email: '' };
    
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) result.email = emailMatch[1];

    const userMatch = text.match(/(?:账号|用户名|账户)[：:\s]+(\S+)/);
    if (userMatch) result.username = userMatch[1];

    const pwdMatch = text.match(/(?:密码|passwd|password)[：:\s]+(\S+)/i);
    if (pwdMatch) result.password = pwdMatch[1];

    const urlMatch = text.match(/https?:\/\/[^\s]+/);
    if (urlMatch) result.url = urlMatch[0];

    return result;
  }

  /**
   * 检测优先级
   */
  detectPriority(text) {
    if (/紧急|立刻|马上|尽快|urgent|asap/i.test(text)) return 'high';
    if (/重要|关键|核心|重点|important/i.test(text)) return 'medium';
    return 'low';
  }

  /**
   * 检测心情
   */
  detectMood(text) {
    const moodMap = {
      happy: ['开心', '高兴', '兴奋', '快乐', '愉快', '爽'],
      sad: ['难过', '伤心', '悲伤', '失落', '沮丧', '郁闷'],
      tired: ['累', '疲惫', '疲劳', '困', '倦'],
      anxious: ['焦虑', '紧张', '担心', '不安', '慌'],
      calm: ['平静', '放松', '安心', '淡定'],
      angry: ['生气', '愤怒', '烦', '烦躁', '不爽'],
    };
    
    for (const [mood, keywords] of Object.entries(moodMap)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) return mood;
      }
    }
    return 'neutral';
  }

  /**
   * 提取额外信息
   */
  extractExtra(text, type) {
    const extra = {};

    // 提取日期
    const datePatterns = [
      /(?:今天|明天|后天|大后天|下周|下个月)/i,
      /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
      /(\d{1,2}月\d{1,2}日)/,
    ];
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        extra.date = match[1] || match[0];
        break;
      }
    }

    // 提取标签 (常用于备忘或想法)
    const tagMatch = text.match(/#(\S+)/g);
    if (tagMatch) {
      extra.tags = tagMatch.map(t => t.replace('#', ''));
    }

    return extra;
  }

  /**
   * 重新分类 - 将条目切换到指定类型
   */
  reclassify(item, newType) {
    const rule = this.rules[newType];
    if (!rule) return item;

    item.type = newType;
    item.category = rule.label;
    item.color = rule.color;
    item.icon = rule.icon;
    item.extra = this.extractExtra(item.text, newType);

    // 重置类型特定属性
    delete item.status;
    delete item.priority;
    delete item.expanded;
    delete item.notes;
    delete item.masked;
    delete item.parsed;
    delete item.urls;
    delete item.mood;
    delete item.progress;
    delete item.author;

    switch (newType) {
      case 'tasks':
        item.status = 'pending';
        item.priority = this.detectPriority(item.text);
        break;
      case 'ideas':
        item.expanded = false;
        item.notes = [];
        break;
      case 'credentials':
        item.masked = true;
        item.parsed = this.parseCredentials(item.text);
        break;
      case 'bookmarks':
        item.urls = item.text.match(/https?:\/\/[^\s]+/g) || [];
        break;
      case 'journal':
        item.mood = this.detectMood(item.text);
        break;
      case 'reading':
        item.progress = 0;
        break;
      case 'quotes':
        item.author = '';
        break;
    }

    return item;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  }
}

function deepClone(obj) {
  if (obj instanceof RegExp) return new RegExp(obj.source, obj.flags);
  if (Array.isArray(obj)) return obj.map(deepClone);
  if (obj && typeof obj === 'object') {
    const copy = {};
    for (const k of Object.keys(obj)) {
      copy[k] = deepClone(obj[k]);
    }
    return copy;
  }
  return obj;
}

function serializeRule(key, value) {
  if (value instanceof RegExp) return { __regexp: true, source: value.source, flags: value.flags };
  return value;
}

function reviveRule(key, value) {
  if (value && value.__regexp === true) return new RegExp(value.source, value.flags);
  return value;
}

module.exports = Classifier;
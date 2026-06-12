const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const Store = require('./store');
const Classifier = require('./classifier');

// 禁用硬件加速，解决 Windows 透明窗口 DWM 蓝色条问题
app.disableHardwareAcceleration();

let mainWindow;
let store;
let classifier;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 60,
    title: '',
    x: Math.round((width - 400) / 2),
    y: 100,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile('index.html');
  mainWindow.setIgnoreMouseEvents(false);

  // 展开/收缩
  let expanded = false;
  ipcMain.on('toggle-expand', () => {
    expanded = !expanded;
    if (expanded) {
      mainWindow.setBounds({ width: 400, height: 500 });
      mainWindow.webContents.send('expanded', true);
    } else {
      mainWindow.setBounds({ width: 400, height: 60 });
      mainWindow.webContents.send('expanded', false);
    }
  });
}

app.whenReady().then(() => {
  store = new Store();
  classifier = new Classifier(store);
  createWindow();

  // 将 store 中的 Ollama 配置同步到 classifier
  classifier.setOllamaConfig(store.getOllamaConfig());

  ipcMain.handle('classify-and-save', async (event, text) => {
    if (!text || text.trim() === '') return null;
    const result = await classifier.classify(text.trim());
    store.add(result);
    store.save();
    return result;
  });

  ipcMain.handle('get-all-data', () => store.getAll());

  ipcMain.handle('update-item', (event, id, updates) => {
    store.update(id, updates);
    store.save();
    return store.getAll();
  });

  ipcMain.handle('delete-item', (event, id) => {
    store.delete(id);
    store.save();
    return store.getAll();
  });

  ipcMain.handle('get-classification-rules', () => classifier.getRules());

  ipcMain.handle('update-classification-rules', (event, rules) => {
    classifier.updateRules(rules);
    classifier.saveRules();
    return classifier.getRules();
  });

  // IPC: 重新分类
  ipcMain.handle('reclassify-item', (event, id, newType) => {
    const item = store.getById(id);
    if (!item) return null;
    classifier.reclassify(item, newType);
    store.save();
    return store.getAll();
  });

  ipcMain.handle('get-stats', () => store.getStats());

  // IPC: Ollama 配置
  ipcMain.handle('get-ollama-config', () => store.getOllamaConfig());

  ipcMain.handle('set-ollama-config', (event, config) => {
    const updated = store.setOllamaConfig(config);
    classifier.setOllamaConfig(updated);
    return updated;
  });

  ipcMain.handle('test-ollama-connection', async (event, config) => {
    const { host, model } = config;
    const url = `${host.replace(/\/+$/, '')}/api/generate`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: 'hi', stream: false }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
    if (mainWindow) mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

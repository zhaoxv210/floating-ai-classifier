const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const Store = require('./store');
const Classifier = require('./classifier');

let mainWindow;
let store;
let classifier;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 400,
    height: 60,
    x: Math.round((width - 400) / 2),
    y: 100,
    frame: false,
    transparent: true,
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
  
  // 点击穿透 - 可通过快捷键切换
  mainWindow.setIgnoreMouseEvents(false);
  
  // 双击展开/收缩
  let expanded = false;
  ipcMain.on('toggle-expand', () => {
    expanded = !expanded;
    if (expanded) {
      mainWindow.setSize(400, 500);
      mainWindow.webContents.send('expanded', true);
    } else {
      mainWindow.setSize(400, 60);
      mainWindow.webContents.send('expanded', false);
    }
  });

  // 窗口拖动
  ipcMain.on('window-drag', (event, offsetX, offsetY) => {
    const [winX, winY] = mainWindow.getPosition();
    mainWindow.setPosition(winX + offsetX, winY + offsetY);
  });
}

app.whenReady().then(() => {
  store = new Store();
  classifier = new Classifier(store);
  
  createWindow();

  // IPC: 分类并保存
  ipcMain.handle('classify-and-save', async (event, text) => {
    if (!text || text.trim() === '') return null;
    const result = classifier.classify(text.trim());
    store.add(result);
    store.save();
    return result;
  });

  // IPC: 获取所有数据
  ipcMain.handle('get-all-data', () => {
    return store.getAll();
  });

  // IPC: 更新条目
  ipcMain.handle('update-item', (event, id, updates) => {
    store.update(id, updates);
    store.save();
    return store.getAll();
  });

  // IPC: 删除条目
  ipcMain.handle('delete-item', (event, id) => {
    store.delete(id);
    store.save();
    return store.getAll();
  });

  // IPC: 读取分类规则
  ipcMain.handle('get-classification-rules', () => {
    return classifier.getRules();
  });

  // IPC: 更新分类规则
  ipcMain.handle('update-classification-rules', (event, rules) => {
    classifier.updateRules(rules);
    classifier.saveRules();
    return classifier.getRules();
  });

  // IPC: 获取统计
  ipcMain.handle('get-stats', () => {
    return store.getStats();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 全局快捷键
app.whenReady().then(() => {
  globalShortcut.register('CmdOrCtrl+Shift+Space', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
});

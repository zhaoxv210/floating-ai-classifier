const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 分类并保存
  classifyAndSave: (text) => ipcRenderer.invoke('classify-and-save', text),
  
  // 获取所有数据
  getAllData: () => ipcRenderer.invoke('get-all-data'),
  
  // 更新条目
  updateItem: (id, updates) => ipcRenderer.invoke('update-item', id, updates),
  
  // 删除条目
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  
  // 获取分类规则
  getClassificationRules: () => ipcRenderer.invoke('get-classification-rules'),
  
  // 更新分类规则
  updateClassificationRules: (rules) => ipcRenderer.invoke('update-classification-rules', rules),
  
  // 获取统计
  getStats: () => ipcRenderer.invoke('get-stats'),
  
  // 窗口控制
  toggleExpand: () => ipcRenderer.send('toggle-expand'),
  
  // 监听展开状态
  onExpanded: (callback) => {
    ipcRenderer.on('expanded', (event, expanded) => callback(expanded));
  },

  // 窗口拖动
  startDrag: (x, y) => ipcRenderer.send('window-drag', x, y),
});
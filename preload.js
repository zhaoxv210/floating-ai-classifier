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

  // 批量删除
  batchDelete: (ids) => ipcRenderer.invoke('batch-delete', ids),

  // 重新分类
  reclassifyItem: (id, newType) => ipcRenderer.invoke('reclassify-item', id, newType),

  // 获取分类规则
  getClassificationRules: () => ipcRenderer.invoke('get-classification-rules'),
  
  // 更新分类规则
  updateClassificationRules: (rules) => ipcRenderer.invoke('update-classification-rules', rules),
  
  // 获取统计
  getStats: () => ipcRenderer.invoke('get-stats'),

  // 导出数据
  exportData: (format) => ipcRenderer.invoke('export-data', format),
  
  // 窗口控制
  toggleExpand: () => ipcRenderer.send('toggle-expand'),
  
  // 监听展开状态
  onExpanded: (callback) => {
    ipcRenderer.on('expanded', (event, expanded) => callback(expanded));
  },

  // Ollama 配置
  getOllamaConfig: () => ipcRenderer.invoke('get-ollama-config'),
  setOllamaConfig: (config) => ipcRenderer.invoke('set-ollama-config', config),
  testOllamaConnection: (config) => ipcRenderer.invoke('test-ollama-connection', config),
});
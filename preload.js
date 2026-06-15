const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  classifyAndSave: (text) => ipcRenderer.invoke('classify-and-save', text),
  getAllData: () => ipcRenderer.invoke('get-all-data'),
  updateItem: (id, updates) => ipcRenderer.invoke('update-item', id, updates),
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  toggleExpand: () => ipcRenderer.send('toggle-expand'),
  onExpanded: (callback) => {
    ipcRenderer.on('expanded', (event, expanded) => callback(expanded));
  },
});

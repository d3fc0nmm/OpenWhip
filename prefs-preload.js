const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prefs', {
  getMessages: () => ipcRenderer.invoke('prefs:get'),
  saveMessages: (payload) => ipcRenderer.invoke('prefs:save', payload),
  resetDefaults: () => ipcRenderer.invoke('prefs:reset'),
});

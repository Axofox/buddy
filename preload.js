const { contextBridge, ipcRenderer } = require('electron');

const IN = ['look', 'squash', 'say', 'dismiss', 'mode', 'config', 'night', 'poked', 'open-form', 'typing'];
const OUT = ['drag-start', 'drag-end', 'menu', 'bubble-rect', 'alerting', 'form-closed', 'open-ask', 'ask', 'open-link'];

contextBridge.exposeInMainWorld('buddy', {
  on: (channel, cb) => {
    if (IN.includes(channel)) ipcRenderer.on(channel, (_e, data) => cb(data));
  },
  send: (channel, data) => {
    if (OUT.includes(channel)) ipcRenderer.send(channel, data);
  },
  addReminder: (text, when) => ipcRenderer.invoke('add-reminder', { text, when }),
  addCalendar: (url) => ipcRenderer.invoke('add-calendar', url),
});

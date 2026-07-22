const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beckettDesktop", {
  readClipboard: () => ipcRenderer.invoke("clipboard:read"),
  openWeb: (pathName) => ipcRenderer.invoke("web:open", pathName),
  startMeeting: (meeting) => ipcRenderer.invoke("meeting:start", meeting),
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke("overlay:set-always-on-top", enabled),
  setPaused: (paused) => ipcRenderer.invoke("companion:pause", paused),
  getStatus: () => ipcRenderer.invoke("companion:status"),
});

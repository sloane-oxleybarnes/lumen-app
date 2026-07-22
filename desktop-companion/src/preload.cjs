const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beckettDesktop", {
  readClipboard: () => ipcRenderer.invoke("clipboard:read"),
  openWeb: (pathName) => ipcRenderer.invoke("web:open", pathName),
  startMeeting: (meeting) => ipcRenderer.invoke("meeting:start", meeting),
});

// Secure Electron bridge: exposes only approved desktop APIs to the browser renderer.
const { contextBridge, ipcRenderer } = require("electron");

const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  openJsonFile: () => ipcRenderer.invoke("dialog:openJsonFile"),
  saveFile: (options) => ipcRenderer.invoke("dialog:saveFile", options),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable: (callback) => subscribe("update-available", callback),
  onUpdateNotAvailable: (callback) => subscribe("update-not-available", callback),
  onUpdateDownloadProgress: (callback) => subscribe("update-download-progress", callback),
  onUpdateDownloaded: (callback) => subscribe("update-downloaded", callback),
  onUpdateError: (callback) => subscribe("update-error", callback)
});

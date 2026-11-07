export const isElectron = () =>
  typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

export const openJsonFile = () => window.electronAPI?.openJsonFile?.() ?? null;

export const saveFile = (options) => window.electronAPI?.saveFile?.(options) ?? null;

export const getAppVersion = () => window.electronAPI?.getAppVersion?.() ?? null;

export const checkForUpdates = async () => {
  const result = await window.electronAPI?.checkForUpdates?.();
  if (result?.status === 'error') {
    throw new Error(result.message || 'Update check failed');
  }
  return result;
};

export const downloadUpdate = async () => {
  const result = await window.electronAPI?.downloadUpdate?.();
  if (result?.status === 'error') {
    throw new Error(result.message || 'Download failed');
  }
  return result;
};

export const installUpdate = () => window.electronAPI?.installUpdate?.();

export const onUpdateAvailable = (callback) =>
  window.electronAPI?.onUpdateAvailable?.(callback) ?? (() => {});

export const onUpdateNotAvailable = (callback) =>
  window.electronAPI?.onUpdateNotAvailable?.(callback) ?? (() => {});

export const onUpdateDownloadProgress = (callback) =>
  window.electronAPI?.onUpdateDownloadProgress?.(callback) ?? (() => {});

export const onUpdateDownloaded = (callback) =>
  window.electronAPI?.onUpdateDownloaded?.(callback) ?? (() => {});

export const onUpdateError = (callback) =>
  window.electronAPI?.onUpdateError?.(callback) ?? (() => {});

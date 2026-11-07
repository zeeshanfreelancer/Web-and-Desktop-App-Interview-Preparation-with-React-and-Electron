// Electron main process: creates the desktop window, handles file dialogs, and manages app updates.
const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
const isDev = !app.isPackaged;
const sessionDataPath = path.join(app.getPath("temp"), "Interview Prep", "SessionData");

fs.mkdirSync(sessionDataPath, { recursive: true });
app.setPath("sessionData", sessionDataPath);

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("update-available", (info) => {
    sendToRenderer("update-available", {
      version: info.version,
      releaseDate: info.releaseDate
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendToRenderer("update-not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("update-download-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendToRenderer("update-downloaded", {
      version: info.version
    });
  });

  autoUpdater.on("error", (error) => {
    const message = error?.message || "Update failed";
    if (/latest\.yml|ENOENT|404|HttpError/i.test(message)) {
      console.warn("Update check skipped:", message);
      return;
    }
    sendToRenderer("update-error", message);
  });
}

function scheduleUpdateCheck() {
  if (isDev) return;

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      sendToRenderer("update-error", error?.message || "Update check failed");
    });
  }, 3000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isDev && !url.startsWith("file://")) {
      event.preventDefault();
    }
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(process.resourcesPath, "client", "dist", "index.html");

    if (!fs.existsSync(indexPath)) {
      dialog.showErrorBox(
        "Interview Prep failed to start",
        `App files were not found.\n\nExpected:\n${indexPath}\n\nPlease reinstall the application.`
      );
      app.quit();
      return;
    }

    mainWindow.loadFile(indexPath);
    mainWindow.webContents.once("did-finish-load", scheduleUpdateCheck);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("dialog:openJsonFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Import questions",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });

  if (canceled || filePaths.length === 0) return null;

  const filePath = filePaths[0];
  const content = await fsPromises.readFile(filePath, "utf-8");
  return { filePath, content };
});

ipcMain.handle("dialog:saveFile", async (_event, { defaultPath, filters, content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "Save file",
    defaultPath,
    filters: filters ?? [{ name: "All Files", extensions: ["*"] }]
  });

  if (canceled || !filePath) return null;

  const payload = typeof content === "string" ? content : Buffer.from(content);
  await fsPromises.writeFile(filePath, payload);
  return filePath;
});

ipcMain.handle("get-app-version", () => app.getVersion());

ipcMain.handle("check-for-updates", async () => {
  if (isDev) return { status: "dev" };

  try {
    const result = await autoUpdater.checkForUpdates();
    return {
      status: "ok",
      version: result?.updateInfo?.version ?? app.getVersion()
    };
  } catch (error) {
    return { status: "error", message: error.message };
  }
});

ipcMain.handle("download-update", async () => {
  if (isDev) return { status: "dev" };

  try {
    await autoUpdater.downloadUpdate();
    return { status: "ok" };
  } catch (error) {
    return { status: "error", message: error.message };
  }
});

ipcMain.handle("install-update", () => {
  if (isDev) return { status: "dev" };
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  setupAutoUpdater();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

if (!isDev) {
  app.commandLine.appendSwitch("--no-sandbox");
  app.commandLine.appendSwitch("--disable-dev-shm-usage");
  app.commandLine.appendSwitch("--max-old-space-size=256");
}

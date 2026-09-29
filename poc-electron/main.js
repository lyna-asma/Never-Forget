
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let widgetCount = 0;

function createWidget() {
  widgetCount++;

  const widget = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  widget.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.on("toggle-always-on-top", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);

  if (!widget) return;

  widget.setAlwaysOnTop(!widget.isAlwaysOnTop());
});

ipcMain.on("move-window", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);

  if (!widget) return;

  widget.setPosition(100, 100);
});

ipcMain.on("create-widget", () => {
  createWidget();
});

app.whenReady().then(() => {
  createWidget();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWidget();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});


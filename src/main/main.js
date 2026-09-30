const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// This function creates one independent widget window.
// Later, the widget's saved data will be passed into this function.
function createWidget() {
  const widget = new BrowserWindow({
    width: 400,
    height: 300,

    // These are the window behaviors we already tested successfully in the POC.
    transparent: true,
    frame: false,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: true,

    // The renderer stays separated from Node.js and Electron.
    // preload.js is the controlled bridge between them.
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the visible widget interface.
  widget.loadFile(path.join(__dirname, "../renderer/index.html"));
}

// The renderer asks to toggle the current widget's always-on-top state.
// We find the BrowserWindow that sent the request and change its setting.
ipcMain.on("toggle-always-on-top", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);

  if (!widget) return;

  widget.setAlwaysOnTop(!widget.isAlwaysOnTop());
});

// The renderer asks to move the current widget.
// This is still using the POC's fixed position for now.
// Later, the position will come from the widget's saved data.
ipcMain.on("move-window", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);

  if (!widget) return;

  widget.setPosition(100, 100);
});

// The renderer asks the application to create another widget.
ipcMain.on("create-widget", () => {
  createWidget();
});

// Electron must finish starting before we create the first widget.
app.whenReady().then(() => {
  createWidget();

  // macOS convention: recreate a window if the application is activated
  // while no widget windows currently exist.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWidget();
    }
  });
});

// On Windows/Linux, closing all windows exits the application.
// macOS normally keeps the application running until the user quits it.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
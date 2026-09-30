const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

const { loadWidgets, saveWidgets } = require("./storage");

// The currently loaded widget data.
// For this milestone we only support one widget.
let widgets = [];

function createWidget(widgetData) {
  const widget = new BrowserWindow({
    width: widgetData.width,
    height: widgetData.height,
    x: widgetData.x,
    y: widgetData.y,

    transparent: true,
    frame: false,
    resizable: true,
    alwaysOnTop: widgetData.alwaysOnTop,
    skipTaskbar: true,

    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  widget.loadFile(path.join(__dirname, "../renderer/index.html"));

  // Save the widget's position whenever the user finishes moving it.
  widget.on("moved", () => {
    const [x, y] = widget.getPosition();

    widgets[0].x = x;
    widgets[0].y = y;

    saveWidgets(app, widgets);
  });

  // Save the widget's size whenever the user finishes resizing it.
  widget.on("resized", () => {
    const [width, height] = widget.getSize();

    widgets[0].width = width;
    widgets[0].height = height;

    saveWidgets(app, widgets);
  });

  return widget;
}

// Renderer asks to toggle always-on-top.
ipcMain.on("toggle-always-on-top", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);

  if (!widget) return;

  const newValue = !widget.isAlwaysOnTop();

  widget.setAlwaysOnTop(newValue);

  widgets[0].alwaysOnTop = newValue;

  saveWidgets(app, widgets);
});

// Renderer asks to move the widget.
// This is still the POC button, so it moves to a fixed position.
ipcMain.on("move-window", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);

  if (!widget) return;

  widget.setPosition(100, 100);
});

// Renderer asks for another widget.
// Multiple-widget persistence is not implemented yet.
ipcMain.on("create-widget", () => {
  const newWidget = {
    x: 100,
    y: 100,
    width: 400,
    height: 300,
    alwaysOnTop: false
  };

  widgets.push(newWidget);

  saveWidgets(app, widgets);

  createWidget(newWidget);
});

app.whenReady().then(() => {
  widgets = loadWidgets(app);

  // First launch: create the initial widget.
  if (widgets.length === 0) {
    widgets.push({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      alwaysOnTop: false
    });

    saveWidgets(app, widgets);
  }

  // For now, create the first saved widget.
  createWidget(widgets[0]);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWidget(widgets[0]);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
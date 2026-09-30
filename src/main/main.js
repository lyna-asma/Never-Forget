const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const crypto = require("crypto");

const { loadWidgets, saveWidgets } = require("./storage");

let widgets = [];

// Creates a unique ID for every widget.
function createWidgetId() {
  return crypto.randomUUID();
}


// Find the saved data belonging to a specific widget.
function findWidgetData(widgetId) {
  return widgets.find((widget) => widget.id === widgetId);
}

// Create one Electron window from one saved widget object.
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

  // Store the widget ID on the window itself.
  // This lets Electron know which saved widget this window represents.
  widget.widgetId = widgetData.id;

  widget.loadFile(path.join(__dirname, "../renderer/index.html"));

  // Save this widget's new position after it is moved.
  widget.on("moved", () => {
    const savedWidget = findWidgetData(widget.widgetId);

    if (!savedWidget) return;

    const [x, y] = widget.getPosition();

    savedWidget.x = x;
    savedWidget.y = y;

    saveWidgets(app, widgets);
  });

  // Save this widget's new size after it is resized.
  widget.on("resized", () => {
    const savedWidget = findWidgetData(widget.widgetId);

    if (!savedWidget) return;

    const [width, height] = widget.getSize();

    savedWidget.width = width;
    savedWidget.height = height;

    saveWidgets(app, widgets);
  });

  return widget;
}

// Renderer asks to toggle always-on-top.
ipcMain.on("toggle-always-on-top", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);

  if (!widget) return;

  const savedWidget = findWidgetData(widget.widgetId);

  if (!savedWidget) return;

  const newValue = !widget.isAlwaysOnTop();

  widget.setAlwaysOnTop(newValue);

  savedWidget.alwaysOnTop = newValue;

  saveWidgets(app, widgets);
});



// Renderer asks the application to create another widget.
ipcMain.on("create-widget", () => {
const offset = widgets.length * 30;

const newWidget = {
  id: createWidgetId(),
  x: 100 + offset,
  y: 100 + offset,
  width: 400,
  height: 300,
  alwaysOnTop: false
};

  widgets.push(newWidget);

  saveWidgets(app, widgets);

  createWidget(newWidget);
});

ipcMain.on("delete-widget", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);

  if (!widget) return;

  const widgetId = widget.widgetId;

  widgets = widgets.filter((savedWidget) => savedWidget.id !== widgetId);

  saveWidgets(app, widgets);

  widget.destroy();
});

app.whenReady().then(() => {
  widgets = loadWidgets(app);

  // Existing data from the previous version does not have IDs.
  // Give those widgets an ID before using them.
  for (const widget of widgets) {
    if (!widget.id) {
      widget.id = createWidgetId();
    }
  }

  // First launch: create the initial widget.
  if (widgets.length === 0) {
    widgets.push({
      id: createWidgetId(),
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      alwaysOnTop: false
    });
  }

  // Save in case IDs were added to existing data.
  saveWidgets(app, widgets);

  // Recreate every saved widget.
  for (const widgetData of widgets) {
    createWidget(widgetData);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      for (const widgetData of widgets) {
        createWidget(widgetData);
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
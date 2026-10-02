const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  dialog,
  screen
} = require("electron");

const path = require("path");
const fs = require("fs");

const {
  loadWidgets,
  saveWidgets
} = require("./storage");

const {
  createWidget,
  cloneWidget
} = require("./widgetFactory");

const {
  WIDGET_TYPES
} = require("./widgetTypes");

const {
  loadNotionConfig,
  saveNotionConfig
} = require("../notion/notionStorage");

const {
  testToken,
  listAccessiblePages,
  resolvePage,
  findRegionsOnPage
} = require("../notion/notionClient");

const {
  connectWidgetToRegion,
  pushLocalToNotion,
  pullNotionToLocal,
  disconnectWidget
} = require("../notion/notionSync");

// Ensure the application name is set consistently so user data
// is always saved to the "never-forget" folder.
app.name = "never-forget";

// Prevent multiple instances from running at the same time and conflicting
// over the Chromium cache and GPU files.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // If a second instance is started, bring open widgets to the front
    for (const win of widgetWindows.values()) {
      if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
      }
    }
  });
}

let widgets = [];
let widgetWindows = new Map(); // Maps widgetId -> BrowserWindow instance
let editingWidget = null;
let managerWindow = null;
let tray = null;
let isQuitting = false;

// Debounce map for automatic background syncing to Notion
const syncTimeouts = new Map();

// --------------------------------------------------
// Widget data helpers
// --------------------------------------------------

function findWidgetData(widgetId) {
  return widgets.find((widget) => widget.id === widgetId);
}

function saveAllWidgets() {
  saveWidgets(app, widgets);
}

// --------------------------------------------------
// Automatic background synchronization
// --------------------------------------------------

// When a user makes local edits to a Notion-connected widget,
// this quietly pushes those edits to Notion 2 seconds after
// the user finishes typing, without freezing or slowing down the UI.
function scheduleBackgroundSync(widget, delayMs = 2000) {
  if (!widget.notion?.connected || !widget.notion?.regionBlockId) {
    return;
  }

  const existingTimer = syncTimeouts.get(widget.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(async () => {
    syncTimeouts.delete(widget.id);

    const config = loadNotionConfig(app);
    if (!config.token) {
      return;
    }

    const result = await pushLocalToNotion(widget, config.token);
    if (result.success) {
      saveAllWidgets();
      notifyManager();
    }
  }, delayMs);

  syncTimeouts.set(widget.id, timer);
}

// --------------------------------------------------
// Automatic background pull from Notion
// --------------------------------------------------

// Quietly checks Notion for any changes made externally (e.g. on mobile or web)
// and updates the desktop widgets automatically without interrupting current typing.
async function syncAllConnectedWidgetsFromNotion() {
  const config = loadNotionConfig(app);
  if (!config.token || !config.connected) {
    return;
  }

  const connectedWidgets = widgets.filter(
    (w) => w.notion?.connected && w.notion?.regionBlockId
  );
  if (connectedWidgets.length === 0) {
    return;
  }

  let updatedAny = false;

  for (const widget of connectedWidgets) {
    const win = widgetWindows.get(widget.id);

    // If user is currently actively editing/typing in this widget, skip to prevent interrupting them
    if (win && win.isEditing) {
      continue;
    }

    // If an outgoing push is waiting to be sent to Notion, skip pulling for now
    if (syncTimeouts.has(widget.id)) {
      continue;
    }

    const result = await pullNotionToLocal(widget, config.token);

    if (result.success && result.changed) {
      updatedAny = true;
      if (win && !win.isDestroyed()) {
        win.webContents.send("widget-data", widget);
      }
    }
  }

  if (updatedAny) {
    saveAllWidgets();
    notifyManager();
  }
}

let notionPollInterval = null;

function startNotionPolling() {
  if (notionPollInterval) {
    clearInterval(notionPollInterval);
  }

  // Initial pull 3 seconds after launch to fetch any updates made while app was closed
  setTimeout(() => {
    syncAllConnectedWidgetsFromNotion();
  }, 3000);

  // Periodic check every 60 seconds (1 minute)
  notionPollInterval = setInterval(() => {
    syncAllConnectedWidgetsFromNotion();
  }, 60000);
}

// --------------------------------------------------
// Window position safety
// --------------------------------------------------

// Checks if a saved window position is visible and reachable
// on the user's current monitors.
function getSafeWindowPosition(position, width, height) {
  const displays = screen.getAllDisplays();

  let wantedX = position?.x ?? 100;
  let wantedY = position?.y ?? 100;

  for (const display of displays) {
    const area = display.workArea;

    const overlapsHorizontally =
      wantedX + 80 > area.x &&
      wantedX < area.x + area.width - 80;

    const overlapsVertically =
      wantedY + 40 > area.y &&
      wantedY < area.y + area.height - 40;

    if (overlapsHorizontally && overlapsVertically) {
      const safeY = Math.max(area.y, Math.min(wantedY, area.y + area.height - 50));
      const safeX = Math.max(area.x - width + 80, Math.min(wantedX, area.x + area.width - 80));

      return {
        x: safeX,
        y: safeY
      };
    }
  }

  const primaryDisplay = screen.getPrimaryDisplay();

  return {
    x: primaryDisplay.workArea.x + 100,
    y: primaryDisplay.workArea.y + 100
  };
}

// --------------------------------------------------
// Edit mode
// --------------------------------------------------

function setWidgetEditMode(widget, shouldEdit) {
  if (!widget || widget.isDestroyed()) {
    return;
  }

  if (shouldEdit && editingWidget && editingWidget !== widget) {
    setWidgetEditMode(editingWidget, false);
  }

  widget.isEditing = shouldEdit;

  if (shouldEdit) {
    editingWidget = widget;
  } else if (editingWidget === widget) {
    editingWidget = null;
  }

  if (!widget.webContents.isDestroyed()) {
    widget.webContents.send("edit-mode-changed", shouldEdit);
  }

  // When exiting edit mode, push any pending changes to Notion quickly
  if (!shouldEdit) {
    const savedWidget = findWidgetData(widget.widgetId);
    if (savedWidget?.notion?.connected) {
      scheduleBackgroundSync(savedWidget, 300);
    }
  }
}

// --------------------------------------------------
// Create widget window
// --------------------------------------------------

function createWidgetWindow(widgetData) {
  const existingWindow = widgetWindows.get(widgetData.id);
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const safePosition = getSafeWindowPosition(
    widgetData.position,
    widgetData.size.width,
    widgetData.size.height
  );

  const positionChanged =
    safePosition.x !== widgetData.position.x ||
    safePosition.y !== widgetData.position.y;

  if (positionChanged) {
    widgetData.position = safePosition;
    saveAllWidgets();
  }

  const widget = new BrowserWindow({
    width: widgetData.size.width,
    height: widgetData.size.height,
    x: safePosition.x,
    y: safePosition.y,

    minWidth: 180,
    minHeight: 120,

    transparent: true,
    frame: false,
    resizable: true,

    alwaysOnTop: widgetData.window.alwaysOnTop,
    skipTaskbar: true,

    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  widget.widgetId = widgetData.id;
  widget.isEditing = false;
  widgetWindows.set(widgetData.id, widget);

  widget.loadFile(path.join(__dirname, "../renderer/index.html"));

  widget.webContents.on("did-finish-load", () => {
    if (widget.webContents.isDestroyed()) {
      return;
    }

    widget.webContents.send("widget-data", widgetData);
  });

  widget.on("system-context-menu", (event) => {
    event.preventDefault();
    showWidgetMenu(widget);
  });

  if (process.platform === "win32") {
    // 0x00A5 = WM_NCRBUTTONUP (right-click release in non-client / -webkit-app-region: drag areas)
    // 0x007B = WM_CONTEXTMENU (context menu invocation)
    widget.hookWindowMessage(0x00A5, () => {
      showWidgetMenu(widget);
    });
    widget.hookWindowMessage(0x007B, () => {
      showWidgetMenu(widget);
    });
  }

  widget.on("moved", () => {
    const savedWidget = findWidgetData(widget.widgetId);
    if (!savedWidget) {
      return;
    }

    const [x, y] = widget.getPosition();
    savedWidget.position = { x, y };
    saveAllWidgets();
  });

  widget.on("resized", () => {
    const savedWidget = findWidgetData(widget.widgetId);
    if (!savedWidget) {
      return;
    }

    const [width, height] = widget.getSize();
    savedWidget.size = { width, height };
    saveAllWidgets();
  });

  widget.on("blur", () => {
    if (widget.isEditing) {
      setWidgetEditMode(widget, false);
    }
  });

  widget.on("closed", () => {
    widgetWindows.delete(widgetData.id);

    if (editingWidget === widget) {
      editingWidget = null;
    }

    notifyManager();
  });

  return widget;
}

// --------------------------------------------------
// Save widget content from renderer
// --------------------------------------------------

ipcMain.on("save-widget-content", (event, data) => {
  const widget = BrowserWindow.fromWebContents(event.sender);
  if (!widget) {
    return;
  }

  const savedWidget = findWidgetData(widget.widgetId);
  if (!savedWidget) {
    return;
  }

  if (savedWidget.type === WIDGET_TYPES.TASK) {
    if (typeof data.title === "string") {
      savedWidget.content.title = data.title;
    }

    if (Array.isArray(data.blocks)) {
      savedWidget.content.blocks = data.blocks;
    }
  }

  if (savedWidget.type === WIDGET_TYPES.IMAGE) {
    if (typeof data.source === "string" || data.source === null) {
      savedWidget.content.source = data.source;
    }

    if (typeof data.altText === "string") {
      savedWidget.content.altText = data.altText;
    }
  }

  if (data.style && typeof data.style === "object") {
    savedWidget.style = {
      ...savedWidget.style,
      ...data.style
    };
  }

  saveAllWidgets();
  notifyManager();

  // If this widget is linked to Notion, schedule a background sync
  if (savedWidget.notion?.connected) {
    scheduleBackgroundSync(savedWidget);
  }
});

// --------------------------------------------------
// File picker for image widgets
// --------------------------------------------------

ipcMain.handle("select-image-file", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);

  const result = await dialog.showOpenDialog(window, {
    title: "Select an image for your widget",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "svg", "webp", "gif"]
      }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mimeMap = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      svg: "image/svg+xml",
      webp: "image/webp",
      gif: "image/gif"
    };
    const mimeType = mimeMap[ext] || "image/png";
    return `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
  } catch (err) {
    console.error("Failed to read image file:", err);
    return null;
  }
});

// --------------------------------------------------
// Delete widget
// --------------------------------------------------

async function deleteWidget(widget, parentWindow = null) {
  if (!widget || widget.isDestroyed()) {
    return;
  }

  const dialogParent = parentWindow || widget;

  const result = await dialog.showMessageBox(dialogParent, {
    type: "question",
    buttons: ["Delete", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title: "Delete widget",
    message: "Delete this widget?",
    detail: "This removes the widget permanently from Never-Forget."
  });

  if (result.response !== 0) {
    return;
  }

  const widgetId = widget.widgetId;

  widgets = widgets.filter((savedWidget) => savedWidget.id !== widgetId);
  saveAllWidgets();

  if (editingWidget === widget) {
    editingWidget = null;
  }

  widgetWindows.delete(widgetId);
  widget.destroy();

  notifyManager();
}

// --------------------------------------------------
// Duplicate widget
// --------------------------------------------------

function duplicateWidget(widget) {
  const original = findWidgetData(widget.widgetId);
  if (!original) {
    return;
  }

  const newWidget = cloneWidget(original);

  // If original was connected to Notion, duplicate starts as local-first
  // and will prompt or link to a new region rather than fighting over the same region
  if (original.notion?.connected) {
    newWidget.notion = {
      connected: false,
      pageId: original.notion.pageId,
      status: "disconnected"
    };
  }

  widgets.push(newWidget);
  saveAllWidgets();

  createWidgetWindow(newWidget);
  notifyManager();
}

// --------------------------------------------------
// Widget Styling Updaters
// --------------------------------------------------

function updateWidgetTheme(widget, savedWidget, theme) {
  if (!savedWidget) {
    return;
  }
  savedWidget.style = {
    ...savedWidget.style,
    theme
  };
  saveAllWidgets();
  notifyManager();
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send("widget-data", savedWidget);
  }
}

function updateWidgetFont(widget, savedWidget, fontFamily) {
  if (!savedWidget) {
    return;
  }
  savedWidget.style = {
    ...savedWidget.style,
    fontFamily
  };
  saveAllWidgets();
  notifyManager();
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send("widget-data", savedWidget);
  }
}

function updateWidgetFontSize(widget, savedWidget, fontSize) {
  if (!savedWidget) {
    return;
  }
  savedWidget.style = {
    ...savedWidget.style,
    fontSize
  };
  saveAllWidgets();
  notifyManager();
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send("widget-data", savedWidget);
  }
}

function updateWidgetRadius(widget, savedWidget, radius) {
  if (!savedWidget) {
    return;
  }
  savedWidget.style = {
    ...savedWidget.style,
    borderRadius: radius
  };
  saveAllWidgets();
  notifyManager();
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send("widget-data", savedWidget);
  }
}

function updateWidgetFit(widget, savedWidget, fit) {
  if (!savedWidget) {
    return;
  }
  savedWidget.style = {
    ...savedWidget.style,
    objectFit: fit
  };
  saveAllWidgets();
  notifyManager();
  if (widget && !widget.isDestroyed()) {
    widget.webContents.send("widget-data", savedWidget);
  }
}

// --------------------------------------------------
// Widget context menu
// --------------------------------------------------

let lastMenuTime = 0;

function showWidgetMenu(widget) {
  if (!widget || widget.isDestroyed()) {
    return;
  }

  const now = Date.now();
  if (now - lastMenuTime < 300) {
    return;
  }
  lastMenuTime = now;

  const savedWidget = findWidgetData(widget.widgetId);

  const menuTemplate = [
    {
      label: "Add Widget",
      submenu: [
        {
          label: "Task / List",
          click: () => {
            const newWidget = createWidget(WIDGET_TYPES.TASK, widgets.length);
            widgets.push(newWidget);
            saveAllWidgets();
            createWidgetWindow(newWidget);
            notifyManager();
          }
        },
        {
          label: "Image",
          click: () => {
            const newWidget = createWidget(WIDGET_TYPES.IMAGE, widgets.length);
            widgets.push(newWidget);
            saveAllWidgets();
            createWidgetWindow(newWidget);
            notifyManager();
          }
        }
      ]
    },
    {
      label: "Manage Widgets...",
      click: () => {
        createManagerWindow();
      }
    },
    {
      type: "separator"
    }
  ];

  // If widget is connected to Notion, show Sync options
  if (savedWidget?.notion?.connected) {
    menuTemplate.push({
      label: "Sync with Notion now",
      click: async () => {
        const config = loadNotionConfig(app);
        if (config.token) {
          await pushLocalToNotion(savedWidget, config.token);
          saveAllWidgets();
          notifyManager();
        }
      }
    });

    menuTemplate.push({
      type: "separator"
    });
  }

  const currentTheme = savedWidget?.style?.theme || (savedWidget?.type === WIDGET_TYPES.IMAGE ? "transparent" : "white");
  const currentRadius = savedWidget?.style?.borderRadius ?? 16;
  const currentFont = savedWidget?.style?.fontFamily || "sans";
  const currentFontSize = savedWidget?.style?.fontSize ?? 15;
  const currentFit = savedWidget?.style?.objectFit || "cover";

  // Themes submenu (for Task widgets)
  if (savedWidget?.type === WIDGET_TYPES.TASK) {
    menuTemplate.push(
      {
        label: "Theme",
        submenu: [
          {
            label: "🗡️ Demon Slayer",
            type: "radio",
            checked: currentTheme === "demon-slayer",
            click: () => updateWidgetTheme(widget, savedWidget, "demon-slayer")
          },
          {
            label: "🎯 Valorant Protocol",
            type: "radio",
            checked: currentTheme === "valorant",
            click: () => updateWidgetTheme(widget, savedWidget, "valorant")
          },
          { type: "separator" },
          {
            label: "🟡 Classic Yellow",
            type: "radio",
            checked: currentTheme === "yellow",
            click: () => updateWidgetTheme(widget, savedWidget, "yellow")
          },
          {
            label: "🔵 Pastel Sky Blue",
            type: "radio",
            checked: currentTheme === "blue",
            click: () => updateWidgetTheme(widget, savedWidget, "blue")
          },
          {
            label: "🟢 Mint Sage Green",
            type: "radio",
            checked: currentTheme === "mint",
            click: () => updateWidgetTheme(widget, savedWidget, "mint")
          },
          {
            label: "🟣 Lavender Dream",
            type: "radio",
            checked: currentTheme === "lavender",
            click: () => updateWidgetTheme(widget, savedWidget, "lavender")
          },
          {
            label: "🌸 Rose Peach",
            type: "radio",
            checked: currentTheme === "rose",
            click: () => updateWidgetTheme(widget, savedWidget, "rose")
          },
          {
            label: "🌑 Dark Obsidian",
            type: "radio",
            checked: currentTheme === "dark",
            click: () => updateWidgetTheme(widget, savedWidget, "dark")
          },
          {
            label: "⚪ Clean White",
            type: "radio",
            checked: currentTheme === "white",
            click: () => updateWidgetTheme(widget, savedWidget, "white")
          }
        ]
      },
      {
        label: "Font Style",
        submenu: [
          {
            label: "Modern Sans",
            type: "radio",
            checked: currentFont === "sans",
            click: () => updateWidgetFont(widget, savedWidget, "sans")
          },
          {
            label: "Tactical Gamer",
            type: "radio",
            checked: currentFont === "tactical",
            click: () => updateWidgetFont(widget, savedWidget, "tactical")
          },
          {
            label: "Handwritten Note",
            type: "radio",
            checked: currentFont === "handwritten",
            click: () => updateWidgetFont(widget, savedWidget, "handwritten")
          },
          {
            label: "Monospace Code",
            type: "radio",
            checked: currentFont === "mono",
            click: () => updateWidgetFont(widget, savedWidget, "mono")
          }
        ]
      },
      {
        label: "Font Size",
        submenu: [
          {
            label: "Small (13px)",
            type: "radio",
            checked: currentFontSize === 13,
            click: () => updateWidgetFontSize(widget, savedWidget, 13)
          },
          {
            label: "Normal (15px)",
            type: "radio",
            checked: currentFontSize === 15,
            click: () => updateWidgetFontSize(widget, savedWidget, 15)
          },
          {
            label: "Large (18px)",
            type: "radio",
            checked: currentFontSize === 18,
            click: () => updateWidgetFontSize(widget, savedWidget, 18)
          },
          {
            label: "Extra Large (22px)",
            type: "radio",
            checked: currentFontSize === 22,
            click: () => updateWidgetFontSize(widget, savedWidget, 22)
          }
        ]
      },
      {
        label: "Corner Radius",
        submenu: [
          {
            label: "Sharp (0px)",
            type: "radio",
            checked: currentRadius === 0,
            click: () => updateWidgetRadius(widget, savedWidget, 0)
          },
          {
            label: "Small (8px)",
            type: "radio",
            checked: currentRadius === 8,
            click: () => updateWidgetRadius(widget, savedWidget, 8)
          },
          {
            label: "Medium (16px)",
            type: "radio",
            checked: currentRadius === 16,
            click: () => updateWidgetRadius(widget, savedWidget, 16)
          },
          {
            label: "Large (24px)",
            type: "radio",
            checked: currentRadius === 24,
            click: () => updateWidgetRadius(widget, savedWidget, 24)
          },
          {
            label: "Round / Pill",
            type: "radio",
            checked: currentRadius >= 999,
            click: () => updateWidgetRadius(widget, savedWidget, 999)
          }
        ]
      },
      {
        type: "separator"
      }
    );
  }

  // If widget is an image widget, add options for picture, corner radius, and sizing
  if (savedWidget?.type === WIDGET_TYPES.IMAGE) {
    menuTemplate.push(
      {
        label: "Change Picture...",
        click: async () => {
          const result = await dialog.showOpenDialog(widget, {
            title: "Select an image for your widget",
            properties: ["openFile"],
            filters: [
              {
                name: "Images",
                extensions: ["png", "jpg", "jpeg", "svg", "webp", "gif"]
              }
            ]
          });

          if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            try {
              const fileBuffer = await fs.promises.readFile(filePath);
              const ext = path.extname(filePath).toLowerCase().replace(".", "");
              const mimeMap = {
                png: "image/png",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                svg: "image/svg+xml",
                webp: "image/webp",
                gif: "image/gif"
              };
              const mimeType = mimeMap[ext] || "image/png";
              savedWidget.content.source = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
              saveAllWidgets();
              notifyManager();

              if (!widget.isDestroyed()) {
                widget.webContents.send("widget-data", savedWidget);
              }
            } catch (err) {
              console.error("Failed to load picture:", err);
            }
          }
        }
      },
      {
        label: "Corner Radius",
        submenu: [
          {
            label: "Sharp (0px)",
            type: "radio",
            checked: currentRadius === 0,
            click: () => updateWidgetRadius(widget, savedWidget, 0)
          },
          {
            label: "Small (8px)",
            type: "radio",
            checked: currentRadius === 8,
            click: () => updateWidgetRadius(widget, savedWidget, 8)
          },
          {
            label: "Medium (16px)",
            type: "radio",
            checked: currentRadius === 16,
            click: () => updateWidgetRadius(widget, savedWidget, 16)
          },
          {
            label: "Large (24px)",
            type: "radio",
            checked: currentRadius === 24,
            click: () => updateWidgetRadius(widget, savedWidget, 24)
          },
          {
            label: "Extra Large (36px)",
            type: "radio",
            checked: currentRadius === 36,
            click: () => updateWidgetRadius(widget, savedWidget, 36)
          },
          {
            label: "Round / Circle",
            type: "radio",
            checked: currentRadius >= 999,
            click: () => updateWidgetRadius(widget, savedWidget, 999)
          }
        ]
      },
      {
        label: "Image Sizing",
        submenu: [
          {
            label: "Fill Widget (Cover)",
            type: "radio",
            checked: currentFit === "cover",
            click: () => updateWidgetFit(widget, savedWidget, "cover")
          },
          {
            label: "Fit Inside (Contain)",
            type: "radio",
            checked: currentFit === "contain",
            click: () => updateWidgetFit(widget, savedWidget, "contain")
          }
        ]
      },
      {
        type: "separator"
      }
    );
  }

  menuTemplate.push(
    {
      label: widget.isEditing ? "Exit edit mode" : "Edit",
      click: () => {
        setWidgetEditMode(widget, !widget.isEditing);
      }
    },
    {
      label: "Always on top",
      type: "checkbox",
      checked: widget.isAlwaysOnTop(),
      click: () => {
        if (!savedWidget) {
          return;
        }

        const newValue = !widget.isAlwaysOnTop();
        widget.setAlwaysOnTop(newValue);
        savedWidget.window.alwaysOnTop = newValue;

        saveAllWidgets();
        notifyManager();
      }
    },
    {
      label: "Duplicate",
      click: () => {
        duplicateWidget(widget);
      }
    },
    {
      type: "separator"
    },
    {
      label: "Delete",
      click: () => {
        deleteWidget(widget);
      }
    }
  );

  const menu = Menu.buildFromTemplate(menuTemplate);

  menu.popup({
    window: widget
  });
}

// --------------------------------------------------
// Widget IPC listeners
// --------------------------------------------------

ipcMain.on("show-widget-menu", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);
  if (!widget) {
    return;
  }

  showWidgetMenu(widget);
});

ipcMain.on("exit-edit-mode", (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);
  if (!widget) {
    return;
  }

  setWidgetEditMode(widget, false);
});

ipcMain.on("delete-current-widget", async (event) => {
  const widget = BrowserWindow.fromWebContents(event.sender);
  if (widget && !widget.isDestroyed()) {
    await deleteWidget(widget);
  }
});

// Window dragging handlers (smooth client-side pointer dragging)
const dragStates = new Map();

ipcMain.on("start-window-drag", (event, { screenX, screenY }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return;
  }

  const [winX, winY] = window.getPosition();
  dragStates.set(window.id, {
    initialWinX: winX,
    initialWinY: winY,
    startCursorX: screenX,
    startCursorY: screenY
  });
});

ipcMain.on("drag-window-to", (event, { screenX, screenY }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return;
  }

  const state = dragStates.get(window.id);
  if (!state) {
    return;
  }

  const newX = Math.round(state.initialWinX + (screenX - state.startCursorX));
  const newY = Math.round(state.initialWinY + (screenY - state.startCursorY));
  window.setPosition(newX, newY);
});

ipcMain.on("stop-window-drag", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed()) {
    return;
  }

  dragStates.delete(window.id);

  const savedWidget = findWidgetData(window.widgetId);
  if (savedWidget) {
    const [x, y] = window.getPosition();
    savedWidget.position = { x, y };
    saveAllWidgets();
  }
});

ipcMain.on("create-widget", (_event, type) => {
  const widgetType =
    type === WIDGET_TYPES.IMAGE
      ? WIDGET_TYPES.IMAGE
      : WIDGET_TYPES.TASK;

  const newWidget = createWidget(widgetType, widgets.length);

  widgets.push(newWidget);
  saveAllWidgets();

  createWidgetWindow(newWidget);
  notifyManager();
});

// --------------------------------------------------
// Manager window
// --------------------------------------------------

function createManagerWindow() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.focus();
    return;
  }

  managerWindow = new BrowserWindow({
    width: 760,
    height: 560,

    minWidth: 540,
    minHeight: 400,

    title: "Never-Forget — Manage Widgets & Notion",

    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  managerWindow.loadFile(path.join(__dirname, "../renderer/manager.html"));

  managerWindow.on("closed", () => {
    managerWindow = null;
  });

  managerWindow.webContents.on("did-finish-load", () => {
    sendManagerData();
  });
}

function sendManagerData() {
  if (!managerWindow || managerWindow.isDestroyed()) {
    return;
  }

  const notionConfig = loadNotionConfig(app);

  managerWindow.webContents.send(
    "manager-data",
    {
      widgets: widgets.map((widget) => ({
        id: widget.id,
        type: widget.type,

        title:
          widget.type === WIDGET_TYPES.TASK
            ? widget.content.title
            : "Image widget",

        alwaysOnTop: widget.window.alwaysOnTop,
        isOpen: widgetWindows.has(widget.id),
        style: widget.style,

        notion: widget.notion ? {
          connected: widget.notion.connected === true,
          pageId: widget.notion.pageId,
          regionTitle: widget.notion.regionTitle,
          status: widget.notion.status || "disconnected",
          error: widget.notion.error
        } : null
      })),

      notionConfig: {
        connected: notionConfig.connected === true,
        botName: notionConfig.botName,
        workspaceName: notionConfig.workspaceName,
        hasToken: typeof notionConfig.token === "string" && notionConfig.token.trim().length > 0
      }
    }
  );
}

function notifyManager() {
  sendManagerData();
}

ipcMain.on("open-widget-manager", () => {
  createManagerWindow();
});

ipcMain.on("manager-delete-widget", async (_event, widgetId) => {
  const widget = widgetWindows.get(widgetId);

  if (widget && !widget.isDestroyed()) {
    await deleteWidget(widget, managerWindow);
    return;
  }

  widgets = widgets.filter((item) => item.id !== widgetId);
  saveAllWidgets();
  notifyManager();
});

ipcMain.on("manager-focus-widget", (_event, widgetId) => {
  const existingWindow = widgetWindows.get(widgetId);

  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.show();
    existingWindow.focus();
    return;
  }

  const savedWidget = findWidgetData(widgetId);
  if (savedWidget) {
    createWidgetWindow(savedWidget);
    notifyManager();
  }
});

ipcMain.on("manager-update-widget-style", (_event, { widgetId, style }) => {
  const savedWidget = findWidgetData(widgetId);
  if (!savedWidget) {
    return;
  }

  savedWidget.style = {
    ...savedWidget.style,
    ...style
  };

  saveAllWidgets();
  notifyManager();

  const win = widgetWindows.get(widgetId);
  if (win && !win.isDestroyed()) {
    win.webContents.send("widget-data", savedWidget);
  }
});

// --------------------------------------------------
// Notion IPC Handlers
// --------------------------------------------------

ipcMain.handle("notion-get-config", () => {
  const config = loadNotionConfig(app);
  return {
    connected: config.connected === true,
    botName: config.botName,
    workspaceName: config.workspaceName,
    hasToken: Boolean(config.token)
  };
});

ipcMain.handle("notion-save-token", async (_event, token) => {
  if (!token || !token.trim()) {
    saveNotionConfig(app, { token: "", connected: false });
    notifyManager();
    return { success: true, connected: false };
  }

  const testResult = await testToken(token.trim());

  if (!testResult.valid) {
    return {
      success: false,
      error: testResult.error
    };
  }

  saveNotionConfig(app, {
    token: token.trim(),
    botName: testResult.botName,
    workspaceName: testResult.workspaceName,
    connected: true
  });

  notifyManager();

  return {
    success: true,
    botName: testResult.botName,
    workspaceName: testResult.workspaceName
  };
});

ipcMain.handle("notion-list-pages", async () => {
  const config = loadNotionConfig(app);
  if (!config.token) {
    return { success: false, error: "Please enter your Notion Integration Token first." };
  }

  return await listAccessiblePages(config.token);
});

ipcMain.handle("notion-resolve-page", async (_event, pageUrlOrId) => {
  const config = loadNotionConfig(app);
  if (!config.token) {
    return { success: false, error: "Please enter your Notion Integration Token first." };
  }

  return await resolvePage(config.token, pageUrlOrId);
});

ipcMain.handle("notion-list-regions", async (_event, pageId) => {
  const config = loadNotionConfig(app);
  if (!config.token) {
    return { success: false, error: "Notion is not connected." };
  }

  return await findRegionsOnPage(config.token, pageId);
});

ipcMain.handle("notion-connect-widget", async (_event, { widgetId, pageId, regionBlockId, regionTitle }) => {
  const config = loadNotionConfig(app);
  if (!config.token) {
    return { success: false, error: "Notion is not connected." };
  }

  const widget = findWidgetData(widgetId);
  if (!widget) {
    return { success: false, error: "Widget not found." };
  }

  const result = await connectWidgetToRegion(widget, config.token, pageId, regionBlockId, regionTitle);

  if (result.success) {
    saveAllWidgets();
    notifyManager();

    // Inform the widget window of the new connection
    const window = widgetWindows.get(widgetId);
    if (window && !window.isDestroyed()) {
      window.webContents.send("widget-data", widget);
    }
  }

  return result;
});

ipcMain.handle("notion-sync-widget", async (_event, widgetId) => {
  const config = loadNotionConfig(app);
  if (!config.token) {
    return { success: false, error: "Notion is not connected." };
  }

  const widget = findWidgetData(widgetId);
  if (!widget) {
    return { success: false, error: "Widget not found." };
  }

  // Pull remote changes from Notion
  const pullResult = await pullNotionToLocal(widget, config.token);

  if (pullResult.success) {
    saveAllWidgets();
    notifyManager();

    const window = widgetWindows.get(widgetId);
    if (window && !window.isDestroyed()) {
      window.webContents.send("widget-data", widget);
    }

    return { success: true };
  }

  return pullResult;
});

ipcMain.handle("notion-disconnect-widget", (_event, widgetId) => {
  const widget = findWidgetData(widgetId);
  if (!widget) {
    return { success: false, error: "Widget not found." };
  }

  disconnectWidget(widget);
  saveAllWidgets();
  notifyManager();

  const window = widgetWindows.get(widgetId);
  if (window && !window.isDestroyed()) {
    window.webContents.send("widget-data", widget);
  }

  return { success: true };
});

// --------------------------------------------------
// System Tray Icon
// --------------------------------------------------

function createTrayIcon() {
  const iconPath = path.join(__dirname, "../../assets/icon.png");

  let iconImage;
  if (fs.existsSync(iconPath)) {
    iconImage = nativeImage.createFromPath(iconPath);
  } else {
    iconImage = nativeImage.createEmpty();
  }

  tray = new Tray(iconImage);
  tray.setToolTip("Never-Forget — Desktop Widgets");

  const trayMenu = Menu.buildFromTemplate([
    {
      label: "Never-Forget",
      enabled: false
    },
    {
      type: "separator"
    },
    {
      label: "Add Task Widget",
      click: () => {
        const newWidget = createWidget(WIDGET_TYPES.TASK, widgets.length);
        widgets.push(newWidget);
        saveAllWidgets();
        createWidgetWindow(newWidget);
        notifyManager();
      }
    },
    {
      label: "Add Image Widget",
      click: () => {
        const newWidget = createWidget(WIDGET_TYPES.IMAGE, widgets.length);
        widgets.push(newWidget);
        saveAllWidgets();
        createWidgetWindow(newWidget);
        notifyManager();
      }
    },
    {
      type: "separator"
    },
    {
      label: "Manage Widgets & Notion...",
      click: () => {
        createManagerWindow();
      }
    },
    {
      label: "Show All Widgets",
      click: () => {
        for (const widgetData of widgets) {
          createWidgetWindow(widgetData);
        }
      }
    },
    {
      type: "separator"
    },
    {
      label: "Quit Never-Forget",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(trayMenu);

  tray.on("click", () => {
    createManagerWindow();
  });
}

// --------------------------------------------------
// App startup
// --------------------------------------------------

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) {
    return;
  }

  widgets = loadWidgets(app);

  if (widgets.length === 0) {
    widgets.push(createWidget(WIDGET_TYPES.TASK, 0));
  }

  saveAllWidgets();

  for (const widgetData of widgets) {
    createWidgetWindow(widgetData);
  }

  createTrayIcon();
  startNotionPolling();

  app.on("activate", () => {
    if (widgetWindows.size === 0) {
      for (const widgetData of widgets) {
        createWidgetWindow(widgetData);
      }
    }
  });
});

// --------------------------------------------------
// Application shutdown
// --------------------------------------------------

app.on("before-quit", () => {
  isQuitting = true;
  if (notionPollInterval) {
    clearInterval(notionPollInterval);
    notionPollInterval = null;
  }
});

app.on("window-all-closed", () => {
  if (isQuitting) {
    app.quit();
  }
});
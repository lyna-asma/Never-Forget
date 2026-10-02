const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  screen
} = require("electron");

const path = require("path");
const crypto = require("crypto");

const {
  loadWidgets,
  saveWidgets
} = require("./storage");

const {
  createWidget
} = require("./widgetFactory");

const {
  WIDGET_TYPES
} = require("./widgetTypes");

let widgets = [];

let editingWidget = null;

let managerWindow = null;


// --------------------------------------------------
// Widget data helpers
// --------------------------------------------------

function findWidgetData(widgetId) {
  return widgets.find(
    (widget) => widget.id === widgetId
  );
}

function saveAllWidgets() {
  saveWidgets(app, widgets);
}


// --------------------------------------------------
// Window position safety
// --------------------------------------------------

function getSafeWindowPosition(
  position,
  width,
  height
) {
  const displays = screen.getAllDisplays();

  const wantedX = position?.x ?? 100;
  const wantedY = position?.y ?? 100;

  const isVisibleOnDisplay = (display) => {
    const area = display.workArea;

    const right =
      wantedX + width;

    const bottom =
      wantedY + height;

    const overlapsHorizontally =
      right > area.x &&
      wantedX < area.x + area.width;

    const overlapsVertically =
      bottom > area.y &&
      wantedY < area.y + area.height;

    return (
      overlapsHorizontally &&
      overlapsVertically
    );
  };

  if (
    displays.some(isVisibleOnDisplay)
  ) {
    return {
      x: wantedX,
      y: wantedY
    };
  }

  const primaryDisplay =
    screen.getPrimaryDisplay();

  return {
    x: primaryDisplay.workArea.x + 100,
    y: primaryDisplay.workArea.y + 100
  };
}


// --------------------------------------------------
// Edit mode
// --------------------------------------------------

function setWidgetEditMode(
  widget,
  shouldEdit
) {
  if (
    !widget ||
    widget.isDestroyed()
  ) {
    return;
  }

  if (
    shouldEdit &&
    editingWidget &&
    editingWidget !== widget
  ) {
    setWidgetEditMode(
      editingWidget,
      false
    );
  }

  widget.isEditing =
    shouldEdit;

  if (shouldEdit) {
    editingWidget = widget;
  } else if (
    editingWidget === widget
  ) {
    editingWidget = null;
  }

  if (
    !widget.webContents.isDestroyed()
  ) {
    widget.webContents.send(
      "edit-mode-changed",
      shouldEdit
    );
  }
}


// --------------------------------------------------
// Create widget window
// --------------------------------------------------

function createWidgetWindow(
  widgetData
) {
  const safePosition =
    getSafeWindowPosition(
      widgetData.position,
      widgetData.size.width,
      widgetData.size.height
    );

  const positionChanged =
    safePosition.x !==
      widgetData.position.x ||
    safePosition.y !==
      widgetData.position.y;

  if (positionChanged) {
    widgetData.position =
      safePosition;

    saveAllWidgets();
  }

  const widget =
    new BrowserWindow({
      width:
        widgetData.size.width,

      height:
        widgetData.size.height,

      x:
        safePosition.x,

      y:
        safePosition.y,

      minWidth: 180,
      minHeight: 120,

      transparent: true,
      frame: false,
      resizable: true,

      alwaysOnTop:
        widgetData.window.alwaysOnTop,

      skipTaskbar: true,

      webPreferences: {
        preload: path.join(
          __dirname,
          "../preload/preload.js"
        ),

        contextIsolation: true,
        nodeIntegration: false
      }
    });

  widget.widgetId =
    widgetData.id;

  widget.isEditing = false;

  widget.loadFile(
    path.join(
      __dirname,
      "../renderer/index.html"
    )
  );

  widget.webContents.on(
    "did-finish-load",
    () => {
      if (
        widget.webContents.isDestroyed()
      ) {
        return;
      }

      widget.webContents.send(
        "widget-data",
        widgetData
      );
    }
  );


  // -----------------------------------------------
  // Position persistence
  // -----------------------------------------------

  widget.on(
    "moved",
    () => {
      const savedWidget =
        findWidgetData(
          widget.widgetId
        );

      if (!savedWidget) {
        return;
      }

      const [x, y] =
        widget.getPosition();

      savedWidget.position = {
        x,
        y
      };

      saveAllWidgets();
    }
  );


  // -----------------------------------------------
  // Size persistence
  // -----------------------------------------------

  widget.on(
    "resized",
    () => {
      const savedWidget =
        findWidgetData(
          widget.widgetId
        );

      if (!savedWidget) {
        return;
      }

      const [
        width,
        height
      ] = widget.getSize();

      savedWidget.size = {
        width,
        height
      };

      saveAllWidgets();
    }
  );


  // -----------------------------------------------
  // Leaving the window exits edit mode
  // -----------------------------------------------

  widget.on(
    "blur",
    () => {
      if (widget.isEditing) {
        setWidgetEditMode(
          widget,
          false
        );
      }
    }
  );


  widget.on(
    "closed",
    () => {
      if (
        editingWidget === widget
      ) {
        editingWidget = null;
      }
    }
  );

  return widget;
}


// --------------------------------------------------
// Save widget content
// --------------------------------------------------

ipcMain.on(
  "save-widget-content",
  (
    event,
    data
  ) => {
    const widget =
      BrowserWindow.fromWebContents(
        event.sender
      );

    if (!widget) {
      return;
    }

    const savedWidget =
      findWidgetData(
        widget.widgetId
      );

    if (!savedWidget) {
      return;
    }

    if (
      savedWidget.type ===
      WIDGET_TYPES.TASK
    ) {
      if (
        typeof data.title ===
        "string"
      ) {
        savedWidget.content.title =
          data.title;
      }

      if (
        Array.isArray(data.blocks)
      ) {
        savedWidget.content.blocks =
          data.blocks;
      }
    }

    if (
      savedWidget.type ===
      WIDGET_TYPES.IMAGE
    ) {
      if (
        typeof data.source ===
        "string"
      ) {
        savedWidget.content.source =
          data.source;
      }

      if (
        typeof data.altText ===
        "string"
      ) {
        savedWidget.content.altText =
          data.altText;
      }
    }

    saveAllWidgets();
  }
);


// --------------------------------------------------
// Delete widget
// --------------------------------------------------

async function deleteWidget(
  widget
) {
  if (
    !widget ||
    widget.isDestroyed()
  ) {
    return;
  }

  const result =
    await dialog.showMessageBox(
      widget,
      {
        type: "question",

        buttons: [
          "Delete",
          "Cancel"
        ],

        defaultId: 1,
        cancelId: 1,

        title:
          "Delete widget",

        message:
          "Delete this widget?",

        detail:
          "This removes the widget permanently from Never-Forget."
      }
    );

  if (
    result.response !== 0
  ) {
    return;
  }

  const widgetId =
    widget.widgetId;

  widgets =
    widgets.filter(
      (savedWidget) =>
        savedWidget.id !==
        widgetId
    );

  saveAllWidgets();

  if (
    editingWidget === widget
  ) {
    editingWidget = null;
  }

  widget.destroy();

  notifyManager();
}


// --------------------------------------------------
// Duplicate widget
// --------------------------------------------------

function duplicateWidget(
  widget
) {
  const original =
    findWidgetData(
      widget.widgetId
    );

  if (!original) {
    return;
  }

  const newWidget = {
    ...original,

    id: crypto.randomUUID(),

    position: {
      x:
        original.position.x + 30,

      y:
        original.position.y + 30
    }
  };

  if (
    original.type ===
    WIDGET_TYPES.TASK
  ) {
    newWidget.content = {
      ...original.content,

      blocks:
        original.content.blocks.map(
          (block) => ({
            ...block,

            id:
              crypto.randomUUID()
          })
        )
    };
  }

  if (
    original.type ===
    WIDGET_TYPES.IMAGE
  ) {
    newWidget.content = {
      ...original.content
    };
  }

  widgets.push(
    newWidget
  );

  saveAllWidgets();

  createWidgetWindow(
    newWidget
  );

  notifyManager();
}


// --------------------------------------------------
// Widget context menu
// --------------------------------------------------

function showWidgetMenu(
  widget
) {
  if (
    !widget ||
    widget.isDestroyed()
  ) {
    return;
  }

  const menu =
    Menu.buildFromTemplate([
      {
        label:
          widget.isEditing
            ? "Exit edit mode"
            : "Edit",

        click: () => {
          setWidgetEditMode(
            widget,
            !widget.isEditing
          );
        }
      },

      {
        type: "separator"
      },

      {
        label:
          "Always on top",

        type: "checkbox",

        checked:
          widget.isAlwaysOnTop(),

        click: () => {
          const savedWidget =
            findWidgetData(
              widget.widgetId
            );

          if (!savedWidget) {
            return;
          }

          const newValue =
            !widget.isAlwaysOnTop();

          widget.setAlwaysOnTop(
            newValue
          );

          savedWidget.window.alwaysOnTop =
            newValue;

          saveAllWidgets();

          notifyManager();
        }
      },

      {
        label:
          "Duplicate",

        click: () => {
          duplicateWidget(
            widget
          );
        }
      },

      {
        type: "separator"
      },

      {
        label:
          "Delete",

        click: () => {
          deleteWidget(
            widget
          );
        }
      }
    ]);

  menu.popup({
    window: widget
  });
}


// --------------------------------------------------
// Widget IPC
// --------------------------------------------------

ipcMain.on(
  "show-widget-menu",
  (event) => {
    const widget =
      BrowserWindow.fromWebContents(
        event.sender
      );

    if (!widget) {
      return;
    }

    showWidgetMenu(
      widget
    );
  }
);

ipcMain.on(
  "exit-edit-mode",
  (event) => {
    const widget =
      BrowserWindow.fromWebContents(
        event.sender
      );

    if (!widget) {
      return;
    }

    setWidgetEditMode(
      widget,
      false
    );
  }
);


// --------------------------------------------------
// Create widgets
// --------------------------------------------------

ipcMain.on(
  "create-widget",
  (
    _event,
    type
  ) => {
    const widgetType =
      type === WIDGET_TYPES.IMAGE
        ? WIDGET_TYPES.IMAGE
        : WIDGET_TYPES.TASK;

    const newWidget =
      createWidget(
        widgetType,
        widgets.length
      );

    widgets.push(
      newWidget
    );

    saveAllWidgets();

    createWidgetWindow(
      newWidget
    );

    notifyManager();
  }
);


// --------------------------------------------------
// Manager window
// --------------------------------------------------

function createManagerWindow() {
  if (
    managerWindow &&
    !managerWindow.isDestroyed()
  ) {
    managerWindow.focus();
    return;
  }

  managerWindow =
    new BrowserWindow({
      width: 650,
      height: 500,

      minWidth: 500,
      minHeight: 350,

      title:
        "Never-Forget — Manage Widgets",

      webPreferences: {
        preload: path.join(
          __dirname,
          "../preload/preload.js"
        ),

        contextIsolation: true,
        nodeIntegration: false
      }
    });

  managerWindow.loadFile(
    path.join(
      __dirname,
      "../renderer/manager.html"
    )
  );

  managerWindow.on(
    "closed",
    () => {
      managerWindow = null;
    }
  );

  managerWindow.webContents.on(
    "did-finish-load",
    () => {
      sendManagerData();
    }
  );
}

function sendManagerData() {
  if (
    !managerWindow ||
    managerWindow.isDestroyed()
  ) {
    return;
  }

  managerWindow.webContents.send(
    "manager-data",
    widgets.map(
      (widget) => ({
        id: widget.id,
        type: widget.type,

        title:
          widget.type ===
          WIDGET_TYPES.TASK
            ? widget.content.title
            : "Image widget",

        alwaysOnTop:
          widget.window.alwaysOnTop
      })
    )
  );
}

function notifyManager() {
  sendManagerData();
}

ipcMain.on(
  "open-widget-manager",
  () => {
    createManagerWindow();
  }
);

ipcMain.on(
  "manager-delete-widget",
  async (
    _event,
    widgetId
  ) => {
    const widget =
      BrowserWindow
        .getAllWindows()
        .find(
          (window) =>
            window.widgetId ===
            widgetId
        );

    if (widget) {
      await deleteWidget(
        widget
      );

      return;
    }

    widgets =
      widgets.filter(
        (item) =>
          item.id !== widgetId
      );

    saveAllWidgets();

    notifyManager();
  }
);

ipcMain.on(
  "manager-focus-widget",
  (
    _event,
    widgetId
  ) => {
    const widget =
      BrowserWindow
        .getAllWindows()
        .find(
          (window) =>
            window.widgetId ===
            widgetId
        );

    if (!widget) {
      return;
    }

    widget.show();
    widget.focus();
  }
);


// --------------------------------------------------
// App startup
// --------------------------------------------------

app.whenReady().then(
  () => {
    widgets =
      loadWidgets(app);

    if (
      widgets.length === 0
    ) {
      widgets.push(
        createWidget(
          WIDGET_TYPES.TASK,
          0
        )
      );
    }

    saveAllWidgets();

    for (
      const widgetData of widgets
    ) {
      createWidgetWindow(
        widgetData
      );
    }

    // Desktop context menu.
    const desktopMenu =
      Menu.buildFromTemplate([
        {
          label:
            "Add Widget",

          submenu: [
            {
              label:
                "Task / List",

              click: () => {
                const newWidget =
                  createWidget(
                    WIDGET_TYPES.TASK,
                    widgets.length
                  );

                widgets.push(
                  newWidget
                );

                saveAllWidgets();

                createWidgetWindow(
                  newWidget
                );

                notifyManager();
              }
            },

            {
              label:
                "Image",

              click: () => {
                const newWidget =
                  createWidget(
                    WIDGET_TYPES.IMAGE,
                    widgets.length
                  );

                widgets.push(
                  newWidget
                );

                saveAllWidgets();

                createWidgetWindow(
                  newWidget
                );

                notifyManager();
              }
            }
          ]
        },

        {
          type: "separator"
        },

        {
          label:
            "Manage Widgets",

          click: () => {
            createManagerWindow();
          }
        }
      ]);

    ipcMain.on(
      "show-desktop-menu",
      () => {
        desktopMenu.popup();
      }
    );

    app.on(
      "activate",
      () => {
        if (
          BrowserWindow
            .getAllWindows()
            .length === 0
        ) {
          for (
            const widgetData of widgets
          ) {
            createWidgetWindow(
              widgetData
            );
          }
        }
      }
    );
  }
);


// --------------------------------------------------
// Application shutdown
// --------------------------------------------------

app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);
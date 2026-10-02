const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
  "widgetAPI",
  {
    showWidgetMenu() {
      ipcRenderer.send(
        "show-widget-menu"
      );
    },

    showDesktopMenu() {
      ipcRenderer.send(
        "show-desktop-menu"
      );
    },

    exitEditMode() {
      ipcRenderer.send(
        "exit-edit-mode"
      );
    },

    saveWidgetContent(data) {
      ipcRenderer.send(
        "save-widget-content",
        data
      );
    },

    onWidgetData(callback) {
      ipcRenderer.on(
        "widget-data",
        (
          _event,
          data
        ) => {
          callback(data);
        }
      );
    },

    onEditModeChanged(
      callback
    ) {
      ipcRenderer.on(
        "edit-mode-changed",
        (
          _event,
          editing
        ) => {
          callback(editing);
        }
      );
    },

    createWidget(type) {
      ipcRenderer.send(
        "create-widget",
        type
      );
    },

    openWidgetManager() {
      ipcRenderer.send(
        "open-widget-manager"
      );
    },

    onManagerData(callback) {
      ipcRenderer.on(
        "manager-data",
        (
          _event,
          data
        ) => {
          callback(data);
        }
      );
    },

    focusWidget(widgetId) {
      ipcRenderer.send(
        "manager-focus-widget",
        widgetId
      );
    },

    deleteWidget(widgetId) {
      ipcRenderer.send(
        "manager-delete-widget",
        widgetId
      );
    }
  }
);
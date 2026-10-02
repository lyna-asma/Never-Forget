const {
  contextBridge,
  ipcRenderer
} = require("electron");

// Expose a safe, controlled API bridge to the renderer window.
// nodeIntegration is disabled and contextIsolation is enabled.
contextBridge.exposeInMainWorld(
  "widgetAPI",
  {
    showWidgetMenu() {
      ipcRenderer.send("show-widget-menu");
    },

    showDesktopMenu() {
      ipcRenderer.send("show-desktop-menu");
    },

    exitEditMode() {
      ipcRenderer.send("exit-edit-mode");
    },

    deleteCurrentWidget() {
      ipcRenderer.send("delete-current-widget");
    },

    startWindowDrag(screenX, screenY) {
      ipcRenderer.send("start-window-drag", { screenX, screenY });
    },

    dragWindowTo(screenX, screenY) {
      ipcRenderer.send("drag-window-to", { screenX, screenY });
    },

    stopWindowDrag() {
      ipcRenderer.send("stop-window-drag");
    },

    saveWidgetContent(data) {
      ipcRenderer.send("save-widget-content", data);
    },

    selectImageFile() {
      return ipcRenderer.invoke("select-image-file");
    },

    onWidgetData(callback) {
      ipcRenderer.on("widget-data", (_event, data) => {
        callback(data);
      });
    },

    onEditModeChanged(callback) {
      ipcRenderer.on("edit-mode-changed", (_event, editing) => {
        callback(editing);
      });
    },

    createWidget(type) {
      ipcRenderer.send("create-widget", type);
    },

    openWidgetManager() {
      ipcRenderer.send("open-widget-manager");
    },

    onManagerData(callback) {
      ipcRenderer.on("manager-data", (_event, data) => {
        callback(data);
      });
    },

    focusWidget(widgetId) {
      ipcRenderer.send("manager-focus-widget", widgetId);
    },

    deleteWidget(widgetId) {
      ipcRenderer.send("manager-delete-widget", widgetId);
    },

    updateWidgetStyle(widgetId, style) {
      ipcRenderer.send("manager-update-widget-style", { widgetId, style });
    },

    // --------------------------------------------------
    // Notion Integration Bridge
    // --------------------------------------------------
    notion: {
      getConfig() {
        return ipcRenderer.invoke("notion-get-config");
      },

      saveToken(token) {
        return ipcRenderer.invoke("notion-save-token", token);
      },

      listPages() {
        return ipcRenderer.invoke("notion-list-pages");
      },

      resolvePage(pageUrlOrId) {
        return ipcRenderer.invoke("notion-resolve-page", pageUrlOrId);
      },

      listRegions(pageId) {
        return ipcRenderer.invoke("notion-list-regions", pageId);
      },

      connectWidget(widgetId, pageId, regionBlockId, regionTitle) {
        return ipcRenderer.invoke("notion-connect-widget", {
          widgetId,
          pageId,
          regionBlockId,
          regionTitle
        });
      },

      syncWidget(widgetId) {
        return ipcRenderer.invoke("notion-sync-widget", widgetId);
      },

      disconnectWidget(widgetId) {
        return ipcRenderer.invoke("notion-disconnect-widget", widgetId);
      }
    }
  }
);
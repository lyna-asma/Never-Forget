
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widgetAPI", {
  toggleAlwaysOnTop() {
    ipcRenderer.send("toggle-always-on-top");
  },

  moveWindow() {
    ipcRenderer.send("move-window");
  },

  createWidget() {
    ipcRenderer.send("create-widget");
  }
});


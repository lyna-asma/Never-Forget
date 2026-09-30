// The preload runs between the renderer and Electron's main process.
// It gives the renderer access only to the desktop actions we explicitly expose.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widgetAPI", {
  // Ask the main process to toggle the widget's always-on-top state.
  toggleAlwaysOnTop() {
    ipcRenderer.send("toggle-always-on-top");
  },

  // Ask the main process to move this widget.
  moveWindow() {
    ipcRenderer.send("move-window");
  },

  // Ask the main process to create another widget window.
  createWidget() {
    ipcRenderer.send("create-widget");
  }
});
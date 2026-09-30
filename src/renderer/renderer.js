// The renderer talks to Electron through the small API exposed by preload.js.
// It does not access Electron or Node.js directly.


document
  .getElementById("top-button")
  .addEventListener("click", () => {
    window.widgetAPI.toggleAlwaysOnTop();
  });

document
  .getElementById("create-button")
  .addEventListener("click", () => {
    window.widgetAPI.createWidget();
  });

  document
  .getElementById("delete-button")
  .addEventListener("click", () => {
    window.widgetAPI.deleteWidget();
  });
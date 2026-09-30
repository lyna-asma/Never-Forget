const fs = require("fs");
const path = require("path");

// Electron gives us a safe location for application data.
// This is outside the project folder and is different on each OS.
function getWidgetsFilePath(app) {
  return path.join(app.getPath("userData"), "widgets.json");
}

// Load the saved widgets.
// If this is the first launch, there is nothing to load yet.
function loadWidgets(app) {
  const filePath = getWidgetsFilePath(app);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const file = fs.readFileSync(filePath, "utf-8");

  return JSON.parse(file);
}

// Save the current widgets.
function saveWidgets(app, widgets) {
  const filePath = getWidgetsFilePath(app);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  fs.writeFileSync(
    filePath,
    JSON.stringify(widgets, null, 2),
    "utf-8"
  );
}

module.exports = {
  loadWidgets,
  saveWidgets
};
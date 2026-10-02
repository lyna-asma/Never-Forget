// ============================================================
// NOTION CONFIG STORAGE
// ============================================================
//
// This file saves and loads the user's Notion integration token
// inside the app's secure userData directory.
//
// Storing this separately from widgets.json keeps user credentials
// clean, isolated, and safe.

const fs = require("fs");
const path = require("path");

function getConfigFilePath(app) {
  return path.join(app.getPath("userData"), "notion-config.json");
}

function loadNotionConfig(app) {
  const filePath = getConfigFilePath(app);

  if (!fs.existsSync(filePath)) {
    return {
      token: "",
      botName: "",
      workspaceName: "",
      connected: false
    };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) {
      return { token: "", connected: false };
    }

    const parsed = JSON.parse(raw);
    return {
      token: typeof parsed.token === "string" ? parsed.token : "",
      botName: typeof parsed.botName === "string" ? parsed.botName : "",
      workspaceName: typeof parsed.workspaceName === "string" ? parsed.workspaceName : "",
      connected: parsed.connected === true
    };
  } catch (error) {
    console.error("Could not load notion-config.json:", error.message);
    return { token: "", connected: false };
  }
}

function saveNotionConfig(app, config) {
  const filePath = getConfigFilePath(app);

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
    fs.renameSync(tempPath, filePath);

    return true;
  } catch (error) {
    console.error("Could not save notion-config.json:", error.message);
    return false;
  }
}

module.exports = {
  loadNotionConfig,
  saveNotionConfig
};

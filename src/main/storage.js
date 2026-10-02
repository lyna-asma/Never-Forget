const fs = require("fs");
const path = require("path");

const {
  createWidgetId
} = require("./widgetFactory");

const {
  WIDGET_TYPES
} = require("./widgetTypes");

// --------------------------------------------------
// File path helper
// --------------------------------------------------

// Returns the path to widgets.json inside the user's
// standard application data folder on Windows, macOS, or Linux.
function getWidgetsFilePath(app) {
  return path.join(
    app.getPath("userData"),
    "widgets.json"
  );
}

// --------------------------------------------------
// Default visual styles
// --------------------------------------------------

function getDefaultTaskStyle() {
  return {
    theme: "white",
    backgroundColor: "#ffffff",
    textColor: "#222222",
    fontSize: 15,
    fontFamily: "sans",
    borderRadius: 16
  };
}

function getDefaultImageStyle() {
  return {
    theme: "transparent",
    backgroundColor: "transparent",
    textColor: "#222222",
    fontSize: 15,
    fontFamily: "sans",
    borderRadius: 16,
    objectFit: "cover"
  };
}

// --------------------------------------------------
// Content block normalization
// --------------------------------------------------

// Makes sure each content block has an id, a supported type
// (text, bullet, or checkbox), and safe text content.
function normalizeBlock(block) {
  if (!block || typeof block !== "object") {
    return {
      id: createWidgetId(),
      type: "text",
      text: ""
    };
  }

  const allowedTypes = ["text", "bullet", "checkbox"];
  const type = allowedTypes.includes(block.type) ? block.type : "text";

  const normalized = {
    id:
      typeof block.id === "string" && block.id.trim().length > 0
        ? block.id
        : createWidgetId(),

    type,

    text:
      typeof block.text === "string"
        ? block.text
        : ""
  };

  // Checkbox blocks also store whether they are checked (done) or unchecked
  if (type === "checkbox") {
    normalized.checked = block.checked === true;
  }

  return normalized;
}

// --------------------------------------------------
// Migration for older widget structures
// --------------------------------------------------

// Early versions of Never-Forget stored x, y, width, and height
// directly at the root, and stored content as a simple text string.
// This function detects those older widgets and converts them
// into the modern structured shape without losing the user's data.
function migrateOldWidget(widget) {
  if (!widget || typeof widget !== "object") {
    return null;
  }

  const isModernTask =
    widget.type === WIDGET_TYPES.TASK &&
    widget.position &&
    widget.size &&
    widget.content &&
    Array.isArray(widget.content.blocks);

  const isModernImage =
    widget.type === WIDGET_TYPES.IMAGE &&
    widget.position &&
    widget.size &&
    widget.content &&
    typeof widget.content === "object";

  // If the widget is already using the modern structure,
  // we do not need to convert anything.
  if (isModernTask || isModernImage) {
    return widget;
  }

  // Otherwise, this is a legacy widget.
  // We migrate its root-level values into the structured shape.
  return {
    id:
      typeof widget.id === "string" && widget.id.trim().length > 0
        ? widget.id
        : createWidgetId(),

    type: WIDGET_TYPES.TASK,

    position: {
      x:
        typeof widget.position?.x === "number"
          ? widget.position.x
          : typeof widget.x === "number"
            ? widget.x
            : 100,

      y:
        typeof widget.position?.y === "number"
          ? widget.position.y
          : typeof widget.y === "number"
            ? widget.y
            : 100
    },

    size: {
      width:
        typeof widget.size?.width === "number"
          ? widget.size.width
          : typeof widget.width === "number"
            ? widget.width
            : 400,

      height:
        typeof widget.size?.height === "number"
          ? widget.size.height
          : typeof widget.height === "number"
            ? widget.height
            : 300
    },

    window: {
      alwaysOnTop:
        widget.window?.alwaysOnTop === true ||
        widget.alwaysOnTop === true
    },

    style: getDefaultTaskStyle(),

    content: {
      title:
        typeof widget.title === "string"
          ? widget.title
          : typeof widget.content?.title === "string"
            ? widget.content.title
            : "Never-Forget",

      blocks:
        Array.isArray(widget.content?.blocks) && widget.content.blocks.length > 0
          ? widget.content.blocks.map(normalizeBlock)
          : [
              {
                id: createWidgetId(),
                type: "text",
                text:
                  typeof widget.content === "string"
                    ? widget.content
                    : "My first real widget."
              }
            ]
    }
  };
}

// --------------------------------------------------
// Widget normalization
// --------------------------------------------------

// Ensures every loaded widget has all required properties,
// valid numbers, and the correct content structure for its type.
function normalizeWidget(rawWidget) {
  const widget = migrateOldWidget(rawWidget);

  if (!widget) {
    return null;
  }

  const widgetType =
    widget.type === WIDGET_TYPES.IMAGE
      ? WIDGET_TYPES.IMAGE
      : WIDGET_TYPES.TASK;

  const defaultStyle =
    widgetType === WIDGET_TYPES.IMAGE
      ? getDefaultImageStyle()
      : getDefaultTaskStyle();

  const normalized = {
    id:
      typeof widget.id === "string" && widget.id.trim().length > 0
        ? widget.id
        : createWidgetId(),

    type: widgetType,

    position: {
      x:
        typeof widget.position?.x === "number"
          ? widget.position.x
          : 100,

      y:
        typeof widget.position?.y === "number"
          ? widget.position.y
          : 100
    },

    size: {
      width:
        typeof widget.size?.width === "number" && widget.size.width >= 180
          ? widget.size.width
          : 400,

      height:
        typeof widget.size?.height === "number" && widget.size.height >= 120
          ? widget.size.height
          : 300
    },

    window: {
      alwaysOnTop: widget.window?.alwaysOnTop === true
    },

    style: {
      ...defaultStyle,
      ...(widget.style || {})
    },

    content: {}
  };

  // Build the content object based on the specific widget type.
  if (normalized.type === WIDGET_TYPES.IMAGE) {
    let source =
      typeof widget.content?.source === "string"
        ? widget.content.source
        : null;

    // Migrate file:// URLs to base64 data URLs so Chromium never blocks them
    if (source && source.startsWith("file://")) {
      try {
        const { fileURLToPath } = require("url");
        const filePath = fileURLToPath(source);
        if (fs.existsSync(filePath)) {
          const fileBuffer = fs.readFileSync(filePath);
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
          source = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
        }
      } catch (err) {
        console.error("Failed to migrate file:// image URL:", err);
      }
    }

    normalized.content = {
      source,
      altText:
        typeof widget.content?.altText === "string"
          ? widget.content.altText
          : ""
    };

    return normalized;
  }

  // Task / List widget content
  const title =
    typeof widget.content?.title === "string"
      ? widget.content.title
      : "Never-Forget";

  const rawBlocks =
    Array.isArray(widget.content?.blocks)
      ? widget.content.blocks
      : [];

  const blocks = rawBlocks.map(normalizeBlock);

  // If a task widget has no blocks at all, give it one initial empty block
  // so the user can easily click and start typing.
  if (blocks.length === 0) {
    blocks.push(
      normalizeBlock({
        type: "text",
        text: "My first real widget."
      })
    );
  }

  normalized.content = {
    title,
    blocks
  };

  return normalized;
}

// --------------------------------------------------
// Load widgets from disk
// --------------------------------------------------

function loadWidgets(app) {
  const filePath = getWidgetsFilePath(app);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const file = fs.readFileSync(filePath, "utf-8");

    if (!file.trim()) {
      return [];
    }

    const parsed = JSON.parse(file);

    // Support both raw array format and versioned wrapper format.
    let widgetList = [];

    if (Array.isArray(parsed)) {
      widgetList = parsed;
    } else if (parsed && Array.isArray(parsed.widgets)) {
      widgetList = parsed.widgets;
    } else {
      throw new Error("widgets.json must contain an array of widgets.");
    }

    return widgetList
      .map(normalizeWidget)
      .filter((widget) => widget !== null);
  } catch (error) {
    console.error("Could not load widgets.json:", error.message);
    return [];
  }
}

// --------------------------------------------------
// Save widgets to disk
// --------------------------------------------------

function saveWidgets(app, widgets) {
  const filePath = getWidgetsFilePath(app);

  try {
    fs.mkdirSync(path.dirname(filePath), {
      recursive: true
    });

    // Write to a temporary file first, then atomically rename it.
    // This prevents corruption if the application exits while writing.
    const tempPath = `${filePath}.tmp`;

    fs.writeFileSync(
      tempPath,
      JSON.stringify(widgets, null, 2),
      "utf-8"
    );

    fs.renameSync(tempPath, filePath);
  } catch (error) {
    console.error("Could not save widgets.json:", error.message);
  }
}

module.exports = {
  getWidgetsFilePath,
  getDefaultTaskStyle,
  getDefaultImageStyle,
  normalizeBlock,
  migrateOldWidget,
  normalizeWidget,
  loadWidgets,
  saveWidgets
};
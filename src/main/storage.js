const fs = require("fs");
const path = require("path");

const {
  createWidgetId
} = require("./widgetFactory");

const {
  WIDGET_TYPES
} = require("./widgetTypes");

function getWidgetsFilePath(app) {
  return path.join(
    app.getPath("userData"),
    "widgets.json"
  );
}

function getDefaultStyle() {
  return {
    backgroundColor: "#ffffff",
    textColor: "#222222",
    fontSize: 16,
    borderRadius: 16
  };
}

function normalizeBlock(block) {
  if (!block || typeof block !== "object") {
    return {
      id: createWidgetId(),
      type: "text",
      text: ""
    };
  }

  return {
    id:
      typeof block.id === "string"
        ? block.id
        : createWidgetId(),

    type:
      typeof block.type === "string"
        ? block.type
        : "text",

    text:
      typeof block.text === "string"
        ? block.text
        : ""
  };
}

function migrateOldWidget(widget) {
  // Old widgets stored position directly as x/y
  // and content directly as a string.
  if (
    widget &&
    widget.position &&
    widget.size &&
    widget.content &&
    Array.isArray(widget.content.blocks)
  ) {
    return widget;
  }

  return {
    id:
      widget?.id ||
      createWidgetId(),

    type: WIDGET_TYPES.TASK,

    position: {
      x:
        typeof widget?.x === "number"
          ? widget.x
          : 100,

      y:
        typeof widget?.y === "number"
          ? widget.y
          : 100
    },

    size: {
      width:
        typeof widget?.width === "number"
          ? widget.width
          : 400,

      height:
        typeof widget?.height === "number"
          ? widget.height
          : 300
    },

    window: {
      alwaysOnTop:
        widget?.alwaysOnTop === true
    },

    style: getDefaultStyle(),

    content: {
      title:
        typeof widget?.title === "string"
          ? widget.title
          : "Never-Forget",

      blocks: [
        {
          id: createWidgetId(),
          type: "text",

          text:
            typeof widget?.content === "string"
              ? widget.content
              : "My first real widget."
        }
      ]
    }
  };
}

function normalizeWidget(widget) {
  const migrated = migrateOldWidget(widget);

  const normalized = {
    id:
      typeof migrated.id === "string"
        ? migrated.id
        : createWidgetId(),

    type:
      migrated.type === WIDGET_TYPES.IMAGE
        ? WIDGET_TYPES.IMAGE
        : WIDGET_TYPES.TASK,

    position: {
      x:
        typeof migrated.position?.x === "number"
          ? migrated.position.x
          : 100,

      y:
        typeof migrated.position?.y === "number"
          ? migrated.position.y
          : 100
    },

    size: {
      width:
        typeof migrated.size?.width === "number"
          ? migrated.size.width
          : 400,

      height:
        typeof migrated.size?.height === "number"
          ? migrated.size.height
          : 300
    },

    window: {
      alwaysOnTop:
        migrated.window?.alwaysOnTop === true
    },

    style: {
      ...getDefaultStyle(),
      ...(migrated.style || {})
    },

    content: {}
  };

  if (normalized.type === WIDGET_TYPES.IMAGE) {
    normalized.content = {
      source:
        typeof migrated.content?.source === "string"
          ? migrated.content.source
          : null,

      altText:
        typeof migrated.content?.altText === "string"
          ? migrated.content.altText
          : ""
    };

    return normalized;
  }

  normalized.content = {
    title:
      typeof migrated.content?.title === "string"
        ? migrated.content.title
        : "Never-Forget",

    blocks: Array.isArray(migrated.content?.blocks)
      ? migrated.content.blocks.map(normalizeBlock)
      : []
  };

  return normalized;
}

function loadWidgets(app) {
  const filePath = getWidgetsFilePath(app);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const file = fs.readFileSync(
      filePath,
      "utf-8"
    );

    if (!file.trim()) {
      return [];
    }

    const parsed = JSON.parse(file);

    if (!Array.isArray(parsed)) {
      throw new Error(
        "widgets.json must contain an array."
      );
    }

    return parsed.map(normalizeWidget);
  } catch (error) {
    console.error(
      "Could not load widgets.json:",
      error
    );

    return [];
  }
}

function saveWidgets(app, widgets) {
  const filePath = getWidgetsFilePath(app);

  fs.mkdirSync(
    path.dirname(filePath),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(
      widgets,
      null,
      2
    ),
    "utf-8"
  );
}

module.exports = {
  getWidgetsFilePath,
  loadWidgets,
  saveWidgets,
  normalizeWidget
};
const crypto = require("crypto");
const { WIDGET_TYPES } = require("./widgetTypes");

// Generates a standard random unique identifier.
function createWidgetId() {
  return crypto.randomUUID();
}

// Places new widgets staggered slightly so they do not
// completely stack on top of each other.
function getDefaultPosition(index = 0) {
  const offset = (index % 10) * 30;

  return {
    x: 100 + offset,
    y: 100 + offset
  };
}

function getDefaultSize() {
  return {
    width: 400,
    height: 300
  };
}

function getDefaultWindowSettings() {
  return {
    alwaysOnTop: false
  };
}

function getDefaultTaskStyle() {
  return {
    backgroundColor: "#ffffff",
    textColor: "#222222",
    fontSize: 16,
    borderRadius: 16
  };
}

function getDefaultImageStyle() {
  return {
    backgroundColor: "transparent",
    textColor: "#222222",
    fontSize: 16,
    borderRadius: 16
  };
}

function createTextBlock(text = "", type = "text", checked = false) {
  const block = {
    id: createWidgetId(),
    type,
    text
  };

  if (type === "checkbox") {
    block.checked = checked;
  }

  return block;
}

function createTaskWidget(index = 0) {
  return {
    id: createWidgetId(),
    type: WIDGET_TYPES.TASK,
    position: getDefaultPosition(index),
    size: getDefaultSize(),
    window: getDefaultWindowSettings(),
    style: getDefaultTaskStyle(),
    content: {
      title: "Never-Forget",
      blocks: [
        createTextBlock("My first real widget.")
      ]
    }
  };
}

function createImageWidget(index = 0) {
  return {
    id: createWidgetId(),
    type: WIDGET_TYPES.IMAGE,
    position: getDefaultPosition(index),
    size: {
      width: 400,
      height: 300
    },
    window: getDefaultWindowSettings(),
    style: getDefaultImageStyle(),
    content: {
      source: null,
      altText: ""
    }
  };
}

// Clones an existing widget cleanly with independent objects
// and new unique IDs for the widget and all its inner blocks.
function cloneWidget(original) {
  const cloned = {
    id: createWidgetId(),
    type: original.type,

    position: {
      x: original.position.x + 30,
      y: original.position.y + 30
    },

    size: {
      width: original.size.width,
      height: original.size.height
    },

    window: {
      alwaysOnTop: original.window.alwaysOnTop
    },

    style: {
      ...original.style
    },

    content: {}
  };

  if (original.type === WIDGET_TYPES.IMAGE) {
    cloned.content = {
      source: original.content.source,
      altText: original.content.altText || ""
    };
  } else {
    // Task widget
    cloned.content = {
      title: original.content.title,
      blocks: Array.isArray(original.content.blocks)
        ? original.content.blocks.map((block) => ({
            id: createWidgetId(),
            type: block.type || "text",
            text: block.text || "",
            ...(block.type === "checkbox" ? { checked: block.checked === true } : {})
          }))
        : [createTextBlock("My first real widget.")]
    };
  }

  return cloned;
}

function createWidget(type, index = 0) {
  switch (type) {
    case WIDGET_TYPES.TASK:
      return createTaskWidget(index);

    case WIDGET_TYPES.IMAGE:
      return createImageWidget(index);

    default:
      throw new Error(`Unknown widget type: ${type}`);
  }
}

module.exports = {
  createWidgetId,
  createTextBlock,
  createTaskWidget,
  createImageWidget,
  cloneWidget,
  createWidget
};
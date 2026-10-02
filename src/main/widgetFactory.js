const crypto = require("crypto");
const { WIDGET_TYPES } = require("./widgetTypes");

function createWidgetId() {
  return crypto.randomUUID();
}

function getDefaultPosition(index = 0) {
  const offset = index * 30;

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

function getDefaultStyle() {
  return {
    backgroundColor: "#ffffff",
    textColor: "#222222",
    fontSize: 16,
    borderRadius: 16
  };
}

function createTextBlock(text = "") {
  return {
    id: createWidgetId(),
    type: "text",
    text
  };
}

function createTaskWidget(index = 0) {
  return {
    id: createWidgetId(),
    type: WIDGET_TYPES.TASK,

    position: getDefaultPosition(index),

    size: getDefaultSize(),

    window: getDefaultWindowSettings(),

    style: getDefaultStyle(),

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

    style: {
      backgroundColor: "transparent",
      borderRadius: 16
    },

    content: {
      source: null,
      altText: ""
    }
  };
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
  createWidget
};
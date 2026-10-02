const titleElement =
  document.getElementById(
    "widget-title"
  );

const contentElement =
  document.getElementById(
    "widget-content"
  );

const widgetElement =
  document.getElementById(
    "widget"
  );

let widgetData = null;

let isEditing = false;


// --------------------------------------------------
// Context menu
// --------------------------------------------------

document.addEventListener(
  "contextmenu",
  (event) => {
    event.preventDefault();

    window.widgetAPI.showWidgetMenu();
  }
);


// --------------------------------------------------
// Receive widget data
// --------------------------------------------------

window.widgetAPI.onWidgetData(
  (data) => {
    widgetData = data;

    renderWidget();
  }
);


// --------------------------------------------------
// Render widget
// --------------------------------------------------

function renderWidget() {
  if (!widgetData) {
    return;
  }

  if (
    widgetData.type === "image"
  ) {
    renderImageWidget();
    return;
  }

  renderTaskWidget();
}


// --------------------------------------------------
// Task widget
// --------------------------------------------------

function renderTaskWidget() {
  titleElement.textContent =
    widgetData.content.title;

  contentElement.innerHTML = "";

  for (
    const block
    of widgetData.content.blocks
  ) {
    renderTaskBlock(
      block
    );
  }
}


// --------------------------------------------------
// Render a task block
// --------------------------------------------------

function renderTaskBlock(
  block
) {
  const element =
    document.createElement(
      "p"
    );

  element.className =
    "content-block";

  element.dataset.blockId =
    block.id;

  element.textContent =
    block.text;

  element.contentEditable =
    isEditing
      ? "true"
      : "false";

  contentElement.appendChild(
    element
  );
}


// --------------------------------------------------
// Image widget
// --------------------------------------------------

function renderImageWidget() {
  titleElement.textContent =
    "Image";

  contentElement.innerHTML = "";

  const image =
    document.createElement(
      "img"
    );

  image.className =
    "widget-image";

  image.alt =
    widgetData.content.altText ||
    "Widget image";

  if (
    widgetData.content.source
  ) {
    image.src =
      widgetData.content.source;
  }

  contentElement.appendChild(
    image
  );
}


// --------------------------------------------------
// Edit mode
// --------------------------------------------------

window.widgetAPI.onEditModeChanged(
  (editing) => {
    isEditing = editing;

    document.body.classList.toggle(
      "edit-mode",
      editing
    );

    titleElement.contentEditable =
      editing
        ? "true"
        : "false";

    updateBlockEditingState();

    if (editing) {
      titleElement.focus();
    }
  }
);


// --------------------------------------------------
// Make blocks editable/non-editable
// --------------------------------------------------

function updateBlockEditingState() {
  const blocks =
    contentElement.querySelectorAll(
      ".content-block"
    );

  blocks.forEach(
    (block) => {
      block.contentEditable =
        isEditing
          ? "true"
          : "false";
    }
  );
}


// --------------------------------------------------
// Read current blocks from DOM
// --------------------------------------------------

function collectBlocks() {
  if (!widgetData) {
    return [];
  }

  const elements =
    contentElement.querySelectorAll(
      ".content-block"
    );

  return Array.from(
    elements
  ).map(
    (element) => ({
      id:
        element.dataset.blockId ||
        crypto.randomUUID(),

      type: "text",

      text:
        element.textContent
    })
  );
}


// --------------------------------------------------
// Save everything
// --------------------------------------------------

function saveTaskWidget() {
  if (
    !widgetData ||
    widgetData.type !== "task"
  ) {
    return;
  }

  const title =
    titleElement.textContent.trim();

  const blocks =
    collectBlocks();

  widgetData.content.title =
    title;

  widgetData.content.blocks =
    blocks;

  window.widgetAPI.saveWidgetContent(
    {
      title,
      blocks
    }
  );
}


// --------------------------------------------------
// Title changes
// --------------------------------------------------

titleElement.addEventListener(
  "blur",
  () => {
    if (!isEditing) {
      return;
    }

    saveTaskWidget();
  }
);


// --------------------------------------------------
// Block changes
// --------------------------------------------------

contentElement.addEventListener(
  "input",
  () => {
    if (!isEditing) {
      return;
    }

    if (
      widgetData?.type !==
      "task"
    ) {
      return;
    }

    widgetData.content.blocks =
      collectBlocks();
  }
);

contentElement.addEventListener(
  "blur",
  () => {
    if (!isEditing) {
      return;
    }

    saveTaskWidget();
  },
  true
);


// --------------------------------------------------
// Keyboard shortcuts
// --------------------------------------------------

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape"
    ) {
      if (isEditing) {
        saveTaskWidget();

        window.widgetAPI
          .exitEditMode();
      }

      return;
    }


    // Ctrl + Enter leaves edit mode.
    if (
      event.ctrlKey &&
      event.key === "Enter"
    ) {
      if (isEditing) {
        saveTaskWidget();

        window.widgetAPI
          .exitEditMode();
      }
    }
  }
);
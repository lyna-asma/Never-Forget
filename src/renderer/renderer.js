const titleElement = document.getElementById("widget-title");
const contentElement = document.getElementById("widget-content");
const widgetElement = document.getElementById("widget");
const headerElement = document.getElementById("widget-header");
const notionBadgeElement = document.getElementById("notion-badge");

let widgetData = null;
let isEditing = false;

// --------------------------------------------------
// Context menu
// --------------------------------------------------

function openWidgetContextMenu(event) {
  event.preventDefault();
  event.stopPropagation();
  window.widgetAPI.showWidgetMenu();
}

document.addEventListener("contextmenu", openWidgetContextMenu);
if (widgetElement) {
  widgetElement.addEventListener("contextmenu", openWidgetContextMenu);
}
if (contentElement) {
  contentElement.addEventListener("contextmenu", openWidgetContextMenu);
}

// --------------------------------------------------
// Window Dragging (Pointer Events)
// --------------------------------------------------

let isPointerDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let hasDragged = false;

if (widgetElement) {
  widgetElement.addEventListener("pointerdown", (event) => {
    // Only drag on primary (left) mouse button click (button === 0)
    if (event.button !== 0) {
      return;
    }

    // Do not drag if clicking on buttons, inputs, contenteditable elements
    if (event.target.closest("button, input, textarea, select, [contenteditable='true'], .quick-btn")) {
      return;
    }

    // If in edit mode on a task widget, do not drag from content text
    if (isEditing && widgetData?.type === "task" && event.target.closest(".content")) {
      return;
    }

    isPointerDragging = true;
    hasDragged = false;
    dragStartX = event.screenX;
    dragStartY = event.screenY;

    try {
      widgetElement.setPointerCapture(event.pointerId);
    } catch (_) {}

    window.widgetAPI.startWindowDrag(event.screenX, event.screenY);
  });

  widgetElement.addEventListener("pointermove", (event) => {
    if (!isPointerDragging) {
      return;
    }

    const deltaX = Math.abs(event.screenX - dragStartX);
    const deltaY = Math.abs(event.screenY - dragStartY);

    if (deltaX > 2 || deltaY > 2) {
      hasDragged = true;
      window.widgetAPI.dragWindowTo(event.screenX, event.screenY);
    }
  });

  function finishPointerDrag(event) {
    if (!isPointerDragging) {
      return;
    }

    isPointerDragging = false;

    try {
      if (widgetElement.hasPointerCapture(event.pointerId)) {
        widgetElement.releasePointerCapture(event.pointerId);
      }
    } catch (_) {}

    window.widgetAPI.stopWindowDrag();

    setTimeout(() => {
      hasDragged = false;
    }, 100);
  }

  widgetElement.addEventListener("pointerup", finishPointerDrag);
  widgetElement.addEventListener("pointercancel", finishPointerDrag);
}

// --------------------------------------------------
// Double click to enter edit mode
// --------------------------------------------------

headerElement.addEventListener("dblclick", () => {
  if (!isEditing && widgetData) {
    window.widgetAPI.showWidgetMenu();
  }
});

// --------------------------------------------------
// Clicking the Notion badge opens the manager
// --------------------------------------------------

if (notionBadgeElement) {
  notionBadgeElement.addEventListener("click", (event) => {
    event.stopPropagation();
    window.widgetAPI.openWidgetManager();
  });
}

// --------------------------------------------------
// Receive widget data from main process
// --------------------------------------------------

window.widgetAPI.onWidgetData((data) => {
  widgetData = data;
  renderWidget();
});

// --------------------------------------------------
// Render widget
// --------------------------------------------------

function renderWidget() {
  if (!widgetData) {
    return;
  }

  applyWidgetStyles();

  if (widgetData.type === "image") {
    renderImageWidget();
  } else {
    renderTaskWidget();
  }
}

// --------------------------------------------------
// Visual styling application
// --------------------------------------------------

function applyWidgetStyles() {
  if (!widgetData || !widgetData.style) {
    return;
  }

  const style = widgetData.style;
  const radius = typeof style.borderRadius === "number" ? style.borderRadius : 16;
  const theme = style.theme || "white";
  const fontFamily = style.fontFamily || "sans";
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 15;

  // Reset class list on widgetElement while preserving edit-mode if active
  const isEditingClass = widgetElement.classList.contains("edit-mode");
  widgetElement.className = "widget";
  if (isEditingClass) {
    widgetElement.classList.add("edit-mode");
  }

  if (widgetData.type === "image") {
    const bg = style.backgroundColor || "transparent";
    widgetElement.style.backgroundColor = bg;

    if (bg === "transparent") {
      widgetElement.classList.add("transparent-widget");
    } else {
      widgetElement.classList.remove("transparent-widget");
    }
  } else {
    // Add theme class
    widgetElement.classList.add(`theme-${theme}`);
    widgetElement.classList.remove("transparent-widget");
  }

  // Add font family class
  widgetElement.classList.add(`font-${fontFamily}`);

  // Apply radius and font size
  widgetElement.style.borderRadius = `${radius}px`;
  contentElement.style.borderRadius = `${radius}px`;
  widgetElement.style.fontSize = `${fontSize}px`;

  const img = contentElement.querySelector(".widget-image");
  if (img) {
    img.style.borderRadius = `${radius}px`;
    img.style.objectFit = style.objectFit || "cover";
  }
}

// --------------------------------------------------
// Task widget rendering
// --------------------------------------------------

function renderTaskWidget() {
  headerElement.style.display = "flex";
  titleElement.textContent = widgetData.content.title || "Never-Forget";

  // Show or hide the Notion cloud icon in the header
  if (notionBadgeElement) {
    if (widgetData.notion?.connected) {
      notionBadgeElement.style.display = "inline-block";
      notionBadgeElement.title = `Linked to Notion: ${widgetData.notion.regionTitle || "Region"} (Click to manage)`;
    } else {
      notionBadgeElement.style.display = "none";
    }
  }

  contentElement.innerHTML = "";

  const blocks = Array.isArray(widgetData.content.blocks)
    ? widgetData.content.blocks
    : [];

  for (const block of blocks) {
    const blockElement = createBlockDOM(block);
    contentElement.appendChild(blockElement);
  }
}

// --------------------------------------------------
// Create a DOM element for a block
// --------------------------------------------------

function createBlockDOM(block) {
  const container = document.createElement("div");
  const blockType = block.type || "text";

  container.className = `content-block type-${blockType}`;
  container.dataset.blockId = block.id || crypto.randomUUID();
  container.dataset.blockType = blockType;

  if (blockType === "checkbox") {
    const isChecked = block.checked === true;
    if (isChecked) {
      container.classList.add("is-checked");
    }

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "checkbox-input";
    checkbox.checked = isChecked;

    checkbox.addEventListener("change", () => {
      container.classList.toggle("is-checked", checkbox.checked);
      saveCurrentContent();
    });

    container.appendChild(checkbox);
  } else if (blockType === "bullet") {
    const bullet = document.createElement("span");
    bullet.className = "bullet-dot";
    bullet.textContent = "•";
    container.appendChild(bullet);
  }

  const textElement = document.createElement("div");
  textElement.className = "block-text";
  textElement.contentEditable = isEditing ? "true" : "false";
  textElement.textContent = block.text || "";

  container.appendChild(textElement);

  return container;
}

// --------------------------------------------------
// Image widget rendering
// --------------------------------------------------

function renderImageWidget() {
  headerElement.style.display = isEditing ? "flex" : "none";
  titleElement.textContent = "Image";

  if (notionBadgeElement) {
    notionBadgeElement.style.display = "none";
  }

  contentElement.innerHTML = "";

  if (widgetData.content.source) {
    const image = document.createElement("img");
    image.className = "widget-image";
    image.alt = widgetData.content.altText || "Widget image";
    image.src = widgetData.content.source;
    image.draggable = false;

    const radius = typeof widgetData.style?.borderRadius === "number" ? widgetData.style.borderRadius : 16;
    image.style.borderRadius = `${radius}px`;
    image.style.objectFit = widgetData.style?.objectFit || "cover";

    image.addEventListener("error", () => {
      console.error("Failed to load image source");
      widgetData.content.source = null;
      renderImageWidget();
    });

    image.addEventListener("click", (event) => {
      if (hasDragged) {
        event.stopPropagation();
        return;
      }
      if (isEditing) {
        pickImageFile();
      }
    });

    image.addEventListener("dblclick", (event) => {
      if (hasDragged) {
        event.stopPropagation();
        return;
      }
      pickImageFile();
    });

    contentElement.appendChild(image);
  } else {
    // Empty image placeholder
    const placeholder = document.createElement("div");
    placeholder.className = "image-placeholder";

    const label = document.createElement("p");
    label.textContent = "Click to choose image, or drag & drop one here";
    placeholder.appendChild(label);

    placeholder.addEventListener("click", (event) => {
      if (hasDragged) {
        event.stopPropagation();
        return;
      }
      pickImageFile();
    });

    contentElement.appendChild(placeholder);
  }
}

// --------------------------------------------------
// Image file selection & drag-and-drop
// --------------------------------------------------

async function pickImageFile() {
  try {
    const fileUrl = await window.widgetAPI.selectImageFile();
    if (fileUrl) {
      applyImageSource(fileUrl);
    }
  } catch (err) {
    console.error("Could not pick image file:", err);
  }
}

function applyImageSource(sourceUrl) {
  if (!widgetData || widgetData.type !== "image") {
    return;
  }

  widgetData.content.source = sourceUrl;
  renderImageWidget();

  window.widgetAPI.saveWidgetContent({
    source: widgetData.content.source,
    altText: widgetData.content.altText || ""
  });
}

document.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();

  if (!widgetData || widgetData.type !== "image") {
    return;
  }

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) {
    return;
  }

  const file = files[0];
  if (!file.type.startsWith("image/")) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    const dataUrl = loadEvent.target?.result;
    if (typeof dataUrl === "string") {
      applyImageSource(dataUrl);
    }
  };
  reader.readAsDataURL(file);
});

// --------------------------------------------------
// Edit mode handling
// --------------------------------------------------

window.widgetAPI.onEditModeChanged((editing) => {
  if (isEditing && !editing) {
    saveCurrentContent();
  }

  isEditing = editing;

  document.body.classList.toggle("edit-mode", editing);

  if (widgetData && widgetData.type === "image") {
    headerElement.style.display = editing ? "flex" : "none";
  }

  titleElement.contentEditable = editing ? "true" : "false";
  updateBlockEditingState();

  if (editing) {
    if (widgetData && widgetData.type === "task") {
      titleElement.focus();
    }
  }
});

function updateBlockEditingState() {
  const textElements = contentElement.querySelectorAll(".block-text");
  textElements.forEach((el) => {
    el.contentEditable = isEditing ? "true" : "false";
  });
}

// --------------------------------------------------
// Helper: Put text cursor at specific position
// --------------------------------------------------

function setCursorAtPosition(element, offset = 0) {
  const selection = window.getSelection();
  const range = document.createRange();

  if (!element.firstChild) {
    element.appendChild(document.createTextNode(""));
  }

  const node = element.firstChild;
  const maxLen = node.textContent ? node.textContent.length : 0;
  const safeOffset = Math.min(Math.max(0, offset), maxLen);

  try {
    range.setStart(node, safeOffset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (_e) {
    element.focus();
  }
}

// --------------------------------------------------
// Convert block type dynamically (Markdown shortcuts)
// --------------------------------------------------

function changeBlockType(container, newType, initialText = "", checked = false) {
  const blockId = container.dataset.blockId;

  const newBlockDOM = createBlockDOM({
    id: blockId,
    type: newType,
    text: initialText,
    checked
  });

  container.replaceWith(newBlockDOM);

  const newTextEl = newBlockDOM.querySelector(".block-text");
  if (newTextEl) {
    newTextEl.focus();
    setCursorAtPosition(newTextEl, initialText.length);
  }

  saveCurrentContent();
}

// --------------------------------------------------
// Block collection from DOM
// --------------------------------------------------

function collectBlocks() {
  if (!widgetData) {
    return [];
  }

  const elements = contentElement.querySelectorAll(".content-block");

  const blocks = Array.from(elements).map((element) => {
    const textElement = element.querySelector(".block-text");
    const text = textElement ? textElement.textContent : "";
    const type = element.dataset.blockType || "text";
    const checkbox = element.querySelector(".checkbox-input");

    const block = {
      id: element.dataset.blockId || crypto.randomUUID(),
      type,
      text
    };

    if (type === "checkbox") {
      block.checked = checkbox ? checkbox.checked : false;
    }

    return block;
  });

  if (blocks.length === 0) {
    blocks.push({
      id: crypto.randomUUID(),
      type: "text",
      text: ""
    });
  }

  return blocks;
}

// --------------------------------------------------
// Save widget content
// --------------------------------------------------

function saveCurrentContent() {
  if (!widgetData) {
    return;
  }

  if (widgetData.type === "task") {
    const title = titleElement.textContent.trim() || "Never-Forget";
    const blocks = collectBlocks();

    widgetData.content.title = title;
    widgetData.content.blocks = blocks;

    window.widgetAPI.saveWidgetContent({
      title,
      blocks
    });
  } else if (widgetData.type === "image") {
    window.widgetAPI.saveWidgetContent({
      source: widgetData.content.source,
      altText: widgetData.content.altText || ""
    });
  }
}

// --------------------------------------------------
// Real-time title updates
// --------------------------------------------------

titleElement.addEventListener("input", () => {
  if (!isEditing || !widgetData || widgetData.type !== "task") {
    return;
  }

  widgetData.content.title = titleElement.textContent.trim();
});

titleElement.addEventListener("blur", () => {
  saveCurrentContent();
});

// --------------------------------------------------
// Block typing & Markdown shortcut detection
let typingDebounceTimer = null;

contentElement.addEventListener("input", (event) => {
  if (!isEditing || !widgetData || widgetData.type !== "task") {
    return;
  }

  const textElement = event.target.closest(".block-text");
  if (!textElement) {
    return;
  }

  const container = textElement.closest(".content-block");
  if (!container) {
    return;
  }

  const currentType = container.dataset.blockType || "text";
  const rawText = textElement.textContent || "";

  // 1. Detect Bullet Markdown: "- " or "* " at start of a regular text block
  if (currentType === "text") {
    if (rawText.startsWith("- ") || rawText.startsWith("* ")) {
      const remainingText = rawText.slice(2);
      changeBlockType(container, "bullet", remainingText);
      return;
    }

    // 2. Detect Checkbox Markdown: "[] " or "[ ] " at start of a regular text block
    if (rawText.startsWith("[ ] ") || rawText.startsWith("[] ")) {
      const prefixLength = rawText.startsWith("[ ] ") ? 4 : 3;
      const remainingText = rawText.slice(prefixLength);
      changeBlockType(container, "checkbox", remainingText, false);
      return;
    }

    // 3. Detect Checked Checkbox: "[x] " or "[X] "
    if (rawText.startsWith("[x] ") || rawText.startsWith("[X] ")) {
      const remainingText = rawText.slice(4);
      changeBlockType(container, "checkbox", remainingText, true);
      return;
    }
  }

  widgetData.content.blocks = collectBlocks();

  // Automatically save 2 seconds after user pauses typing
  if (typingDebounceTimer) {
    clearTimeout(typingDebounceTimer);
  }
  typingDebounceTimer = setTimeout(() => {
    saveCurrentContent();
  }, 2000);
});

// --------------------------------------------------
// Block keyboard navigation (Enter and Backspace)
// --------------------------------------------------

contentElement.addEventListener("keydown", (event) => {
  if (!isEditing) {
    return;
  }

  const textElement = event.target.closest(".block-text");
  if (!textElement) {
    return;
  }

  const container = textElement.closest(".content-block");
  if (!container) {
    return;
  }

  const currentType = container.dataset.blockType || "text";
  const text = textElement.textContent || "";

  // Pressing Enter
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();

    if ((currentType === "bullet" || currentType === "checkbox") && text.trim() === "") {
      changeBlockType(container, "text", "");
      return;
    }

    const newBlockDOM = createBlockDOM({
      id: crypto.randomUUID(),
      type: currentType,
      text: "",
      checked: false
    });

    if (container.nextSibling) {
      contentElement.insertBefore(newBlockDOM, container.nextSibling);
    } else {
      contentElement.appendChild(newBlockDOM);
    }

    const newTextEl = newBlockDOM.querySelector(".block-text");
    if (newTextEl) {
      newTextEl.focus();
    }

    saveCurrentContent();
    return;
  }

  // Pressing Backspace at the beginning of a bullet or checkbox
  if (event.key === "Backspace") {
    const selection = window.getSelection();
    const cursorAtStart = selection.anchorOffset === 0;

    if (cursorAtStart && (currentType === "bullet" || currentType === "checkbox")) {
      event.preventDefault();
      changeBlockType(container, "text", text);
      return;
    }

    if (text === "") {
      const allBlocks = contentElement.querySelectorAll(".content-block");
      if (allBlocks.length > 1) {
        event.preventDefault();
        const prevBlock = container.previousElementSibling;
        const nextBlock = container.nextElementSibling;
        container.remove();

        const target = prevBlock || nextBlock;
        const targetText = target?.querySelector(".block-text");
        if (targetText) {
          targetText.focus();
          setCursorAtPosition(targetText, targetText.textContent ? targetText.textContent.length : 0);
        }

        saveCurrentContent();
      }
    }
  }
});

contentElement.addEventListener("blur", () => {
  saveCurrentContent();
}, true);

// --------------------------------------------------
// Global keyboard shortcuts
// --------------------------------------------------

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (isEditing) {
      saveCurrentContent();
      window.widgetAPI.exitEditMode();
    }
    return;
  }

  if (event.ctrlKey && event.key === "Enter") {
    if (isEditing) {
      saveCurrentContent();
      window.widgetAPI.exitEditMode();
    }
  }
});
const list = document.getElementById("widget-list");
const addTaskButton = document.getElementById("add-task");
const addImageButton = document.getElementById("add-image");

const notionTokenInput = document.getElementById("notion-token-input");
const notionConnectBtn = document.getElementById("notion-connect-btn");
const notionDisconnectBtn = document.getElementById("notion-disconnect-btn");
const notionStatusBadge = document.getElementById("notion-status-badge");
const notionConnectForm = document.getElementById("notion-connect-form");
const notionConnectedInfo = document.getElementById("notion-connected-info");
const notionWorkspaceLabel = document.getElementById("notion-workspace-label");

let currentWidgets = [];
let currentNotionConfig = null;
let cachedPages = null;

// --------------------------------------------------
// Create widget buttons
// --------------------------------------------------

addTaskButton.addEventListener("click", () => {
  window.widgetAPI.createWidget("task");
});

addImageButton.addEventListener("click", () => {
  window.widgetAPI.createWidget("image");
});

// --------------------------------------------------
// Notion Integration settings
// --------------------------------------------------

notionConnectBtn.addEventListener("click", async () => {
  const token = notionTokenInput.value.trim();
  if (!token) {
    alert("Please paste your Notion Integration Token first.");
    return;
  }

  notionConnectBtn.disabled = true;
  notionConnectBtn.textContent = "Verifying...";

  try {
    const result = await window.widgetAPI.notion.saveToken(token);

    if (result.success) {
      notionTokenInput.value = "";
      cachedPages = null;
    } else {
      alert(`Could not connect to Notion: ${result.error || "Invalid token"}`);
    }
  } catch (err) {
    alert(`Connection error: ${err.message}`);
  } finally {
    notionConnectBtn.disabled = false;
    notionConnectBtn.textContent = "Connect";
  }
});

notionDisconnectBtn.addEventListener("click", async () => {
  const confirmed = confirm("Disconnect your Notion workspace from Never-Forget?");
  if (confirmed) {
    await window.widgetAPI.notion.saveToken("");
    cachedPages = null;
  }
});

// --------------------------------------------------
// Receive widget and Notion data from main process
// --------------------------------------------------

window.widgetAPI.onManagerData((data) => {
  if (Array.isArray(data)) {
    currentWidgets = data;
  } else if (data && Array.isArray(data.widgets)) {
    currentWidgets = data.widgets;
    currentNotionConfig = data.notionConfig;
  }

  updateNotionPanel();
  renderWidgets(currentWidgets);
});

function updateNotionPanel() {
  const isConnected = currentNotionConfig && currentNotionConfig.connected;

  if (isConnected) {
    notionStatusBadge.className = "badge-connected";
    notionStatusBadge.textContent = "Connected";

    notionConnectForm.style.display = "none";
    notionConnectedInfo.style.display = "flex";

    const name = currentNotionConfig.workspaceName || "Workspace";
    const bot = currentNotionConfig.botName || "Bot";
    notionWorkspaceLabel.textContent = `Connected to "${name}" as "${bot}"`;
  } else {
    notionStatusBadge.className = "badge-disconnected";
    notionStatusBadge.textContent = "Disconnected";

    notionConnectForm.style.display = "block";
    notionConnectedInfo.style.display = "none";
  }
}

// --------------------------------------------------
// Render widget cards
// --------------------------------------------------

function renderWidgets(widgets) {
  list.innerHTML = "";

  if (!widgets || widgets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No widgets created yet. Click '+ Task Widget' or '+ Image Widget' above to create one.";
    list.appendChild(empty);
    return;
  }

  for (const widget of widgets) {
    const card = document.createElement("article");
    card.className = "widget-card";

    const mainRow = document.createElement("div");
    mainRow.className = "card-main-row";

    const information = document.createElement("div");
    information.className = "widget-information";

    const title = document.createElement("h3");
    title.textContent = widget.title || "Untitled widget";

    const typeBadge = document.createElement("span");
    typeBadge.className = `widget-type type-${widget.type}`;
    typeBadge.textContent = widget.type;

    information.appendChild(title);
    information.appendChild(typeBadge);

    if (widget.alwaysOnTop) {
      const pinBadge = document.createElement("span");
      pinBadge.className = "widget-badge";
      pinBadge.textContent = "Always on top";
      information.appendChild(pinBadge);
    }

    if (widget.notion?.connected) {
      const notionBadge = document.createElement("span");
      notionBadge.className = "widget-badge badge-notion";
      notionBadge.textContent = `☁️ Notion: ${widget.notion.regionTitle || "Linked"}`;
      information.appendChild(notionBadge);
    }

    if (widget.isOpen === false) {
      const closedBadge = document.createElement("span");
      closedBadge.className = "widget-badge badge-closed";
      closedBadge.textContent = "Closed";
      information.appendChild(closedBadge);
    }

    const actions = document.createElement("div");
    actions.className = "widget-actions";

    if (widget.type === "task") {
      if (widget.notion?.connected) {
        const syncButton = document.createElement("button");
        syncButton.className = "notion-btn";
        syncButton.textContent = "Sync Now";
        syncButton.addEventListener("click", async () => {
          syncButton.textContent = "Syncing...";
          syncButton.disabled = true;
          await window.widgetAPI.notion.syncWidget(widget.id);
          syncButton.textContent = "Sync Now";
          syncButton.disabled = false;
        });
        actions.appendChild(syncButton);

        const unlinkButton = document.createElement("button");
        unlinkButton.className = "secondary";
        unlinkButton.textContent = "Unlink";
        unlinkButton.addEventListener("click", async () => {
          const ok = confirm("Unlink this widget from Notion? Your local notes will remain safe.");
          if (ok) {
            await window.widgetAPI.notion.disconnectWidget(widget.id);
          }
        });
        actions.appendChild(unlinkButton);
      } else {
        const linkButton = document.createElement("button");
        linkButton.className = "notion-btn";
        linkButton.textContent = "+ Link Notion";
        linkButton.addEventListener("click", () => {
          toggleLinkPanel(card, widget);
        });
        actions.appendChild(linkButton);
      }
    }

    const showButton = document.createElement("button");
    showButton.textContent = widget.isOpen === false ? "Open" : "Show";
    showButton.addEventListener("click", () => {
      window.widgetAPI.focusWidget(widget.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.className = "danger";
    deleteButton.addEventListener("click", () => {
      window.widgetAPI.deleteWidget(widget.id);
    });

    actions.appendChild(showButton);
    actions.appendChild(deleteButton);

    mainRow.appendChild(information);
    mainRow.appendChild(actions);

    card.appendChild(mainRow);

    // For task widgets: Theme & Font controls
    if (widget.type === "task") {
      const themeRow = document.createElement("div");
      themeRow.className = "card-style-row";

      const themeLabel = document.createElement("span");
      themeLabel.className = "style-label";
      themeLabel.textContent = "Theme:";

      const themeGroup = document.createElement("div");
      themeGroup.className = "theme-group";

      const currentTheme = widget.style?.theme || "white";

      const themePresets = [
        { id: "demon-slayer", label: "🗡️ Demon Slayer" },
        { id: "valorant", label: "🎯 Valorant" },
        { id: "yellow", label: "🟡 Yellow" },
        { id: "blue", label: "🔵 Blue" },
        { id: "mint", label: "🟢 Mint" },
        { id: "lavender", label: "🟣 Lavender" },
        { id: "rose", label: "🌸 Rose" },
        { id: "dark", label: "🌑 Dark" },
        { id: "white", label: "⚪ White" }
      ];

      themePresets.forEach((th) => {
        const btn = document.createElement("button");
        btn.className = `theme-preset-btn ${currentTheme === th.id ? "active" : ""}`;
        btn.textContent = th.label;
        btn.addEventListener("click", () => {
          window.widgetAPI.updateWidgetStyle(widget.id, { theme: th.id });
        });
        themeGroup.appendChild(btn);
      });

      themeRow.appendChild(themeLabel);
      themeRow.appendChild(themeGroup);
      card.appendChild(themeRow);

      // Typography row
      const fontRow = document.createElement("div");
      fontRow.className = "card-style-row";

      const fontLabel = document.createElement("span");
      fontLabel.className = "style-label";
      fontLabel.textContent = "Font:";

      const fontGroup = document.createElement("div");
      fontGroup.className = "font-group";

      const currentFont = widget.style?.fontFamily || "sans";
      const fontPresets = [
        { id: "sans", label: "Modern Sans" },
        { id: "tactical", label: "Tactical Gamer" },
        { id: "handwritten", label: "Handwritten" },
        { id: "mono", label: "Monospace" }
      ];

      fontPresets.forEach((fp) => {
        const btn = document.createElement("button");
        btn.className = `font-preset-btn ${currentFont === fp.id ? "active" : ""}`;
        btn.textContent = fp.label;
        btn.addEventListener("click", () => {
          window.widgetAPI.updateWidgetStyle(widget.id, { fontFamily: fp.id });
        });
        fontGroup.appendChild(btn);
      });

      const sizeLabel = document.createElement("span");
      sizeLabel.className = "style-label";
      sizeLabel.style.marginLeft = "12px";
      sizeLabel.textContent = "Size:";

      const sizeGroup = document.createElement("div");
      sizeGroup.className = "size-group";

      const currentSize = widget.style?.fontSize ?? 15;
      const sizePresets = [
        { size: 13, label: "S (13px)" },
        { size: 15, label: "M (15px)" },
        { size: 18, label: "L (18px)" },
        { size: 22, label: "XL (22px)" }
      ];

      sizePresets.forEach((sp) => {
        const btn = document.createElement("button");
        btn.className = `size-preset-btn ${currentSize === sp.size ? "active" : ""}`;
        btn.textContent = sp.label;
        btn.addEventListener("click", () => {
          window.widgetAPI.updateWidgetStyle(widget.id, { fontSize: sp.size });
        });
        sizeGroup.appendChild(btn);
      });

      fontRow.appendChild(fontLabel);
      fontRow.appendChild(fontGroup);
      fontRow.appendChild(sizeLabel);
      fontRow.appendChild(sizeGroup);
      card.appendChild(fontRow);
    }

    // Style & Corner Radius controls
    const styleRow = document.createElement("div");
    styleRow.className = "card-style-row";

    const styleLabel = document.createElement("span");
    styleLabel.className = "style-label";
    styleLabel.textContent = "Corners:";

    const radiusGroup = document.createElement("div");
    radiusGroup.className = "radius-group";

    const currentRadius = widget.style?.borderRadius ?? 16;

    const presets = [
      { label: "Sharp (0px)", value: 0 },
      { label: "8px", value: 8 },
      { label: "16px", value: 16 },
      { label: "24px", value: 24 },
      { label: "Round", value: 999 }
    ];

    presets.forEach((preset) => {
      const btn = document.createElement("button");
      const isPresetActive =
        currentRadius === preset.value ||
        (preset.value === 999 && currentRadius >= 999);

      btn.className = `radius-preset-btn ${isPresetActive ? "active" : ""}`;
      btn.textContent = preset.label;
      btn.addEventListener("click", () => {
        window.widgetAPI.updateWidgetStyle(widget.id, { borderRadius: preset.value });
      });
      radiusGroup.appendChild(btn);
    });

    styleRow.appendChild(styleLabel);
    styleRow.appendChild(radiusGroup);

    if (widget.type === "image") {
      const fitGroup = document.createElement("div");
      fitGroup.className = "fit-group";

      const currentFit = widget.style?.objectFit || "cover";

      const coverBtn = document.createElement("button");
      coverBtn.className = `radius-preset-btn ${currentFit === "cover" ? "active" : ""}`;
      coverBtn.textContent = "Fill (Cover)";
      coverBtn.title = "Fills the widget and rounds the corners cleanly";
      coverBtn.addEventListener("click", () => {
        window.widgetAPI.updateWidgetStyle(widget.id, { objectFit: "cover" });
      });

      const containBtn = document.createElement("button");
      containBtn.className = `radius-preset-btn ${currentFit === "contain" ? "active" : ""}`;
      containBtn.textContent = "Fit (Contain)";
      containBtn.title = "Shows the whole image with letterboxing";
      containBtn.addEventListener("click", () => {
        window.widgetAPI.updateWidgetStyle(widget.id, { objectFit: "contain" });
      });

      fitGroup.appendChild(coverBtn);
      fitGroup.appendChild(containBtn);
      styleRow.appendChild(fitGroup);
    }

    card.appendChild(styleRow);

    list.appendChild(card);
  }
}

// --------------------------------------------------
// Inline Notion Linking Panel (Dropdown + Direct URL Input)
// --------------------------------------------------

async function toggleLinkPanel(card, widget) {
  const existingPanel = card.querySelector(".link-drawer");
  if (existingPanel) {
    existingPanel.remove();
    return;
  }

  const isConnected = currentNotionConfig && currentNotionConfig.connected;
  if (!isConnected) {
    alert("Please connect your Notion Workspace at the top of the window first.");
    return;
  }

  const drawer = document.createElement("div");
  drawer.className = "link-drawer";
  drawer.innerHTML = `<p class="drawer-loading">Loading your Notion pages...</p>`;
  card.appendChild(drawer);

  try {
    if (!cachedPages) {
      const res = await window.widgetAPI.notion.listPages();
      if (res.success) {
        cachedPages = res.pages;
      } else {
        cachedPages = [];
      }
    }

    drawer.innerHTML = "";

    let selectedPageId = cachedPages.length > 0 ? cachedPages[0].id : null;
    let selectedPageTitle = cachedPages.length > 0 ? cachedPages[0].title : null;

    // 1. Dropdown section if pages were detected
    if (cachedPages.length > 0) {
      const dropdownLabel = document.createElement("label");
      dropdownLabel.textContent = "Choose from detected Notion pages:";

      const pageSelect = document.createElement("select");
      pageSelect.className = "drawer-select";

      for (const page of cachedPages) {
        const option = document.createElement("option");
        option.value = page.id;
        option.textContent = page.title || "Untitled";
        pageSelect.appendChild(option);
      }

      pageSelect.addEventListener("change", () => {
        selectedPageId = pageSelect.value;
        const found = cachedPages.find((p) => p.id === selectedPageId);
        selectedPageTitle = found ? found.title : "";
      });

      drawer.appendChild(dropdownLabel);
      drawer.appendChild(pageSelect);

      const divider = document.createElement("div");
      divider.className = "drawer-divider";
      divider.textContent = "— OR PASTE LINK DIRECTLY —";
      drawer.appendChild(divider);
    } else {
      // Helpful guide box if Notion hasn't returned pages yet
      const guideBox = document.createElement("div");
      guideBox.className = "notion-guide-box";
      guideBox.innerHTML = `
        <strong>💡 How to share a page with your integration:</strong>
        <ol>
          <li>Open your Notion page in your browser or desktop app.</li>
          <li>Click the <strong>•••</strong> (three dots) at the top-right corner.</li>
          <li>Click <strong>Connections</strong> (or <strong>Connect to</strong>).</li>
          <li>Select <strong>Never-Forget</strong> and confirm.</li>
        </ol>
        <p>Then copy the page's web address from your browser and paste it below:</p>
      `;
      drawer.appendChild(guideBox);
    }

    // 2. Direct URL input
    const urlLabel = document.createElement("label");
    urlLabel.textContent = "Paste Notion Page URL or Page ID:";

    const urlRow = document.createElement("div");
    urlRow.className = "drawer-url-row";

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.className = "drawer-input";
    urlInput.placeholder = "https://www.notion.so/...";

    const resolveBtn = document.createElement("button");
    resolveBtn.className = "secondary";
    resolveBtn.textContent = "Check Page";

    const resolvedStatus = document.createElement("p");
    resolvedStatus.className = "resolved-status";

    resolveBtn.addEventListener("click", async () => {
      const input = urlInput.value.trim();
      if (!input) {
        alert("Please paste your Notion page URL first.");
        return;
      }

      resolveBtn.disabled = true;
      resolveBtn.textContent = "Checking...";
      resolvedStatus.textContent = "";

      const res = await window.widgetAPI.notion.resolvePage(input);

      resolveBtn.disabled = false;
      resolveBtn.textContent = "Check Page";

      if (res.success && res.page) {
        selectedPageId = res.page.id;
        selectedPageTitle = res.page.title;
        resolvedStatus.className = "resolved-status success";
        resolvedStatus.textContent = `✓ Found page: "${res.page.title}"`;
        linkConfirmBtn.disabled = false;
      } else {
        resolvedStatus.className = "resolved-status error";
        resolvedStatus.textContent = `✗ ${res.error}`;
      }
    });

    urlRow.appendChild(urlInput);
    urlRow.appendChild(resolveBtn);

    drawer.appendChild(urlLabel);
    drawer.appendChild(urlRow);
    drawer.appendChild(resolvedStatus);

    // 3. Region name input
    const regionLabel = document.createElement("label");
    regionLabel.textContent = "Region / Callout Name inside Notion:";

    const regionInput = document.createElement("input");
    regionInput.type = "text";
    regionInput.className = "drawer-input";
    regionInput.value = widget.title || "My Tasks";

    drawer.appendChild(regionLabel);
    drawer.appendChild(regionInput);

    // 4. Action buttons
    const buttonRow = document.createElement("div");
    buttonRow.className = "drawer-buttons";

    const linkConfirmBtn = document.createElement("button");
    linkConfirmBtn.textContent = "Confirm & Link to Notion";
    linkConfirmBtn.className = "notion-btn";

    linkConfirmBtn.addEventListener("click", async () => {
      const pageId = selectedPageId || urlInput.value.trim();

      if (!pageId) {
        alert("Please select a page or paste a valid Notion page URL first.");
        return;
      }

      const regionTitle = regionInput.value.trim() || widget.title || "Tasks";

      linkConfirmBtn.disabled = true;
      linkConfirmBtn.textContent = "Creating region in Notion...";

      const res = await window.widgetAPI.notion.connectWidget(
        widget.id,
        pageId,
        null, // null = automatically creates a new Callout block
        regionTitle
      );

      if (res.success) {
        drawer.remove();
      } else {
        alert(`Could not link region: ${res.error}`);
        linkConfirmBtn.disabled = false;
        linkConfirmBtn.textContent = "Confirm & Link to Notion";
      }
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "secondary";
    cancelBtn.addEventListener("click", () => {
      drawer.remove();
    });

    buttonRow.appendChild(linkConfirmBtn);
    buttonRow.appendChild(cancelBtn);

    drawer.appendChild(buttonRow);
  } catch (err) {
    drawer.innerHTML = `<p class="drawer-error">Error: ${err.message}</p>`;
  }
}
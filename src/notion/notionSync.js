// ============================================================
// NOTION SYNC ENGINE
// ============================================================
//
// This file coordinates synchronization between local widgets
// and their linked Callout/Toggle regions inside Notion pages.
//
// Core Rules:
// 1. Local widgets are always immediately usable (offline-first).
// 2. Unrelated Notion content is NEVER modified.
// 3. Duplicating a synced widget creates a new region in Notion
//    immediately below the original region.
// 4. Deleting or disconnecting a local widget NEVER destroys
//    the remote Notion content by default.

const crypto = require("crypto");

const {
  getBlockChildren,
  createCalloutRegion,
  appendChildren,
  deleteBlock,
  updateBlock
} = require("./notionClient");

const {
  mapLocalBlocksToNotion,
  mapNotionBlocksToLocal,
  neverForgetToNotion,
  extractPlainText
} = require("./notionMapper");

// --------------------------------------------------
// Calculate a simple hash of blocks to detect changes
// --------------------------------------------------

function hashBlocks(blocks) {
  const content = JSON.stringify(
    (blocks || []).map((b) => ({
      type: b.type,
      text: b.text,
      checked: b.checked === true
    }))
  );

  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

// --------------------------------------------------
// Connect a widget to a new or existing Notion region
// --------------------------------------------------

async function connectWidgetToRegion(widget, token, pageId, regionBlockId, regionTitle = "") {
  if (!widget || !token || !pageId) {
    return { success: false, error: "Missing required information." };
  }

  try {
    // If the user did not pick an existing region, create a new Callout region on the page
    let finalRegionId = regionBlockId;

    if (!finalRegionId) {
      const title = regionTitle || widget.content.title || "Never-Forget Tasks";
      const createRes = await createCalloutRegion(token, pageId, `📌 ${title}`);

      if (!createRes.success) {
        return { success: false, error: createRes.error };
      }

      finalRegionId = createRes.regionId;

      // Populate the newly created Notion region with the widget's current blocks
      const notionBlocks = mapLocalBlocksToNotion(widget.content.blocks || []);
      if (notionBlocks.length > 0) {
        await appendChildren(token, finalRegionId, notionBlocks);
      }
    }

    const currentHash = hashBlocks(widget.content.blocks || []);

    widget.notion = {
      connected: true,
      pageId,
      regionBlockId: finalRegionId,
      regionTitle: regionTitle || widget.content.title || "Never-Forget Region",
      lastSyncedAt: new Date().toISOString(),
      lastSyncedHash: currentHash,
      status: "synced",
      error: null
    };

    return {
      success: true,
      widget
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// --------------------------------------------------
// Concurrency lock: prevents overlapping push/pull operations per widget
// --------------------------------------------------

const activeSyncPromises = new Map();

// --------------------------------------------------
// Push local widget blocks up to Notion (Differential Sync)
// --------------------------------------------------

async function pushLocalToNotion(widget, token) {
  if (!widget.notion?.connected || !widget.notion?.regionBlockId) {
    return { success: false, error: "Widget is not connected to Notion." };
  }

  // If another sync is in progress on this widget, wait for it to complete
  while (activeSyncPromises.has(widget.id)) {
    try {
      await activeSyncPromises.get(widget.id);
    } catch (_e) {}
  }

  const syncOp = (async () => {
    const regionId = widget.notion.regionBlockId;
    const localBlocks = widget.content.blocks || [];
    const currentHash = hashBlocks(localBlocks);

    // Avoid unnecessary push if content has not changed since last successful sync
    if (currentHash === widget.notion.lastSyncedHash && widget.notion.status === "synced") {
      return { success: true, unchanged: true };
    }

    try {
      // 1. Fetch current children in the Notion region
      const childrenRes = await getBlockChildren(token, regionId);
      if (!childrenRes.success) {
        if (childrenRes.error && childrenRes.error.includes("Could not find block")) {
          widget.notion.status = "region_missing";
          widget.notion.error = "The linked region was deleted in Notion.";
          return { success: false, error: widget.notion.error };
        }
        throw new Error(childrenRes.error);
      }

      const remoteBlocks = childrenRes.results || [];
      const remoteMap = new Map();
      for (const remote of remoteBlocks) {
        remoteMap.set(remote.id, remote);
      }

      const localIdSet = new Set(localBlocks.map((b) => b.id));

      // 2. Differential DELETE: Delete ONLY blocks that exist in Notion but were deleted locally
      for (const remote of remoteBlocks) {
        if (!localIdSet.has(remote.id)) {
          await deleteBlock(token, remote.id);
        }
      }

      // 3. Differential UPDATE & APPEND:
      // Update existing blocks in place without deleting them.
      // Append only newly added blocks and assign them their real Notion ID.
      for (const block of localBlocks) {
        const remote = remoteMap.get(block.id);

        if (remote) {
          const remoteType = remote.type;
          const remoteText = extractPlainText(remote[remoteType]?.rich_text);
          const remoteChecked = remote.to_do ? remote.to_do.checked === true : false;

          const expectedNotionType =
            block.type === "checkbox"
              ? "to_do"
              : block.type === "bullet"
              ? "bulleted_list_item"
              : "paragraph";

          if (remoteType === expectedNotionType) {
            const textChanged = (block.text || "") !== remoteText;
            const checkedChanged =
              block.type === "checkbox" && (block.checked === true) !== remoteChecked;

            if (textChanged || checkedChanged) {
              const patch = {
                rich_text: [
                  {
                    type: "text",
                    text: { content: block.text || "" }
                  }
                ]
              };
              if (block.type === "checkbox") {
                patch.checked = block.checked === true;
              }
              await updateBlock(token, block.id, remoteType, patch);
            }
          } else {
            // Type changed (e.g. from paragraph to checkbox).
            // Notion does not allow updating block type, so delete old and append new.
            await deleteBlock(token, block.id);
            const newNotionBlock = neverForgetToNotion(block);
            const appendRes = await appendChildren(token, regionId, [newNotionBlock]);
            if (appendRes.success && appendRes.results?.[0]?.id) {
              block.id = appendRes.results[0].id;
            }
          }
        } else {
          // New block created locally on desktop (has a local UUID). Append to Notion.
          const newNotionBlock = neverForgetToNotion(block);
          const appendRes = await appendChildren(token, regionId, [newNotionBlock]);
          if (appendRes.success && appendRes.results?.[0]?.id) {
            block.id = appendRes.results[0].id;
          }
        }
      }

      const now = new Date().toISOString();
      widget.notion.lastSyncedAt = now;
      widget.notion.lastSyncedHash = hashBlocks(widget.content.blocks || []);
      widget.notion.status = "synced";
      widget.notion.error = null;

      return { success: true };
    } catch (error) {
      widget.notion.status = error.isOffline ? "offline" : "error";
      widget.notion.error = error.message;

      return {
        success: false,
        error: error.message,
        isOffline: error.isOffline === true
      };
    }
  })();

  activeSyncPromises.set(widget.id, syncOp);
  try {
    return await syncOp;
  } finally {
    activeSyncPromises.delete(widget.id);
  }
}

// --------------------------------------------------
// Pull remote Notion blocks down into local widget
// --------------------------------------------------

async function pullNotionToLocal(widget, token) {
  if (!widget.notion?.connected || !widget.notion?.regionBlockId) {
    return { success: false, error: "Widget is not connected to Notion." };
  }

  // If a push is in progress on this widget, wait for it to complete
  while (activeSyncPromises.has(widget.id)) {
    try {
      await activeSyncPromises.get(widget.id);
    } catch (_e) {}
  }

  const pullOp = (async () => {
    const regionId = widget.notion.regionBlockId;

    try {
      const childrenRes = await getBlockChildren(token, regionId);

      if (!childrenRes.success) {
        if (childrenRes.error && childrenRes.error.includes("Could not find block")) {
          widget.notion.status = "region_missing";
          widget.notion.error = "The linked region was deleted in Notion.";
          return { success: false, error: widget.notion.error };
        }
        throw new Error(childrenRes.error);
      }

      // Map Notion blocks to Never-Forget blocks
      const localBlocks = mapNotionBlocksToLocal(childrenRes.results);
      const newHash = hashBlocks(localBlocks);

      const hasChanged = newHash !== widget.notion.lastSyncedHash;

      // Only update if there are remote blocks or if remote became empty
      if (hasChanged) {
        widget.content.blocks =
          localBlocks.length > 0
            ? localBlocks
            : [{ id: crypto.randomUUID(), type: "text", text: "" }];
        widget.notion.lastSyncedHash = hashBlocks(widget.content.blocks);
      }

      const now = new Date().toISOString();
      widget.notion.lastSyncedAt = now;
      widget.notion.status = "synced";
      widget.notion.error = null;

      return {
        success: true,
        changed: hasChanged,
        blocks: widget.content.blocks
      };
    } catch (error) {
      widget.notion.status = error.isOffline ? "offline" : "error";
      widget.notion.error = error.message;

      return {
        success: false,
        error: error.message,
        isOffline: error.isOffline === true
      };
    }
  })();

  activeSyncPromises.set(widget.id, pullOp);
  try {
    return await pullOp;
  } finally {
    activeSyncPromises.delete(widget.id);
  }
}

// --------------------------------------------------
// Disconnect a widget from Notion
// --------------------------------------------------

function disconnectWidget(widget) {
  if (!widget) {
    return;
  }

  widget.notion = {
    connected: false,
    pageId: null,
    regionBlockId: null,
    status: "disconnected"
  };
}

module.exports = {
  hashBlocks,
  connectWidgetToRegion,
  pushLocalToNotion,
  pullNotionToLocal,
  disconnectWidget
};

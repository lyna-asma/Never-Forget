// ============================================================
// NOTION CLIENT
// ============================================================
//
// This file handles all network requests to the official Notion API.
// It uses native fetch (available in Node.js and Electron), so
// no extra third-party libraries are required.
//
// All requests use the Notion-Version header: 2022-06-28.

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// --------------------------------------------------
// Internal helper for making authenticated requests
// --------------------------------------------------

async function notionRequest(endpoint, token, options = {}) {
  const url = `${NOTION_API_BASE}${endpoint}`;

  const headers = {
    "Authorization": `Bearer ${token.trim()}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data?.message ||
        `Notion API error: ${response.status} ${response.statusText}`;

      const error = new Error(errorMessage);
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }

    return data;
  } catch (error) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      const networkError = new Error(
        "Could not connect to Notion. Please check your internet connection."
      );
      networkError.isOffline = true;
      throw networkError;
    }

    throw error;
  }
}

// --------------------------------------------------
// Helper: Extract 32-character Notion Page ID from a URL or raw string
// --------------------------------------------------

function extractPageId(input) {
  if (!input || typeof input !== "string") {
    return "";
  }

  const cleaned = input.trim();

  // Match 32 hex chars at the end of a URL, or standard UUID with dashes
  const match = cleaned.match(/([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);

  if (match) {
    return match[1].replace(/-/g, "");
  }

  // If already a clean ID
  const alphanumeric = cleaned.replace(/[^a-zA-Z0-9]/g, "");
  if (alphanumeric.length === 32) {
    return alphanumeric;
  }

  return cleaned;
}

// --------------------------------------------------
// Helper: Extract title from Notion page or database object
// --------------------------------------------------

function extractTitleFromObject(item) {
  if (!item) {
    return "Untitled";
  }

  // If item is a Page with properties
  if (item.properties) {
    for (const key of Object.keys(item.properties)) {
      const prop = item.properties[key];
      if (prop?.type === "title" && Array.isArray(prop.title) && prop.title.length > 0) {
        const titleText = prop.title.map((t) => t.plain_text || "").join("").trim();
        if (titleText) {
          return titleText;
        }
      }
    }
  }

  // If item is a Database with a title array
  if (Array.isArray(item.title) && item.title.length > 0) {
    const titleText = item.title.map((t) => t.plain_text || "").join("").trim();
    if (titleText) {
      return titleText;
    }
  }

  return "Untitled";
}

// --------------------------------------------------
// Test if an integration token is valid
// --------------------------------------------------

async function testToken(token) {
  if (!token || typeof token !== "string" || !token.trim()) {
    return {
      valid: false,
      error: "Token cannot be empty."
    };
  }

  try {
    const data = await notionRequest("/users/me", token);

    return {
      valid: true,
      botName: data?.name || "Never-Forget Bot",
      workspaceName: data?.bot?.workspace_name || "Workspace",
      botId: data?.id
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      isOffline: error.isOffline === true
    };
  }
}

// --------------------------------------------------
// Search for accessible pages in the workspace
// --------------------------------------------------

async function listAccessiblePages(token) {
  try {
    // Search without strict filter so both regular pages and full-page databases appear
    const data = await notionRequest("/search", token, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100
      })
    });

    const pages = (data.results || []).map((item) => {
      return {
        id: item.id,
        type: item.object,
        title: extractTitleFromObject(item),
        url: item.url,
        lastEditedTime: item.last_edited_time
      };
    });

    return {
      success: true,
      pages
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      pages: []
    };
  }
}

// --------------------------------------------------
// Resolve a specific page directly from URL or ID
// --------------------------------------------------

async function resolvePage(token, pageUrlOrId) {
  const cleanId = extractPageId(pageUrlOrId);

  if (!cleanId) {
    return {
      success: false,
      error: "Please enter a valid Notion page URL or Page ID."
    };
  }

  try {
    // Try fetching as page
    try {
      const page = await notionRequest(`/pages/${cleanId}`, token);
      return {
        success: true,
        page: {
          id: page.id,
          title: extractTitleFromObject(page),
          url: page.url
        }
      };
    } catch (pageErr) {
      // If not a page, check if it is a database
      if (pageErr.status === 404) {
        const db = await notionRequest(`/databases/${cleanId}`, token);
        return {
          success: true,
          page: {
            id: db.id,
            title: extractTitleFromObject(db),
            url: db.url
          }
        };
      }
      throw pageErr;
    }
  } catch (error) {
    if (error.status === 404 || error.message.includes("Could not find")) {
      return {
        success: false,
        error: "Notion could not find this page. Make sure you opened this page in Notion, clicked the top-right ••• button, went to 'Connect to' (or 'Connections'), and selected your Never-Forget integration!"
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
}

// --------------------------------------------------
// Get children blocks of any block or page
// --------------------------------------------------

async function getBlockChildren(token, blockId) {
  try {
    const data = await notionRequest(`/blocks/${blockId}/children?page_size=100`, token);

    return {
      success: true,
      results: data.results || []
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
}

// --------------------------------------------------
// Find Callout or Toggle regions inside a page
// --------------------------------------------------

async function findRegionsOnPage(token, pageId) {
  const response = await getBlockChildren(token, pageId);

  if (!response.success) {
    return response;
  }

  const regions = [];

  for (const block of response.results) {
    if (block.type === "callout") {
      const textParts = block.callout?.rich_text || [];
      const title = textParts.map((t) => t.plain_text || "").join("").trim() || "Untitled Callout";
      const icon = block.callout?.icon?.emoji || "📌";

      regions.push({
        id: block.id,
        type: "callout",
        title,
        icon,
        hasChildren: block.has_children,
        lastEditedTime: block.last_edited_time
      });
    }

    if (block.type === "toggle") {
      const textParts = block.toggle?.rich_text || [];
      const title = textParts.map((t) => t.plain_text || "").join("").trim() || "Untitled Toggle";

      regions.push({
        id: block.id,
        type: "toggle",
        title,
        icon: "▶",
        hasChildren: block.has_children,
        lastEditedTime: block.last_edited_time
      });
    }
  }

  return {
    success: true,
    regions
  };
}

// --------------------------------------------------
// Create a new Callout region on a Notion page
// --------------------------------------------------

async function createCalloutRegion(token, pageId, regionTitle, afterBlockId = null, iconEmoji = "📌") {
  try {
    const body = {
      children: [
        {
          object: "block",
          type: "callout",
          callout: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: regionTitle || "Never-Forget Region"
                }
              }
            ],
            icon: {
              type: "emoji",
              emoji: iconEmoji
            },
            color: "gray_background"
          }
        }
      ]
    };

    if (afterBlockId) {
      body.after = afterBlockId;
    }

    const data = await notionRequest(`/blocks/${pageId}/children`, token, {
      method: "PATCH",
      body: JSON.stringify(body)
    });

    const createdBlock = data.results?.[0];

    return {
      success: true,
      block: createdBlock,
      regionId: createdBlock?.id
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// --------------------------------------------------
// Append children blocks inside a container block
// --------------------------------------------------

async function appendChildren(token, containerBlockId, notionBlocks) {
  if (!notionBlocks || notionBlocks.length === 0) {
    return { success: true, results: [] };
  }

  try {
    const data = await notionRequest(`/blocks/${containerBlockId}/children`, token, {
      method: "PATCH",
      body: JSON.stringify({
        children: notionBlocks
      })
    });

    return {
      success: true,
      results: data.results || []
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// --------------------------------------------------
// Delete (archive) a block in Notion
// --------------------------------------------------

async function deleteBlock(token, blockId) {
  try {
    await notionRequest(`/blocks/${blockId}`, token, {
      method: "DELETE"
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// --------------------------------------------------
// Update a specific block's text or checkbox in Notion
// --------------------------------------------------

async function updateBlock(token, blockId, type, payload) {
  try {
    const data = await notionRequest(`/blocks/${blockId}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        [type]: payload
      })
    });

    return {
      success: true,
      block: data
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  extractPageId,
  testToken,
  listAccessiblePages,
  resolvePage,
  getBlockChildren,
  findRegionsOnPage,
  createCalloutRegion,
  appendChildren,
  deleteBlock,
  updateBlock
};

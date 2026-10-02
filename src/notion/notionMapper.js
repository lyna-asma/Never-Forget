// ============================================================
// NOTION MAPPER
// ============================================================
//
// This file translates between Never-Forget's local block format
// and the official block objects used by the Notion API.
//
// Internal Never-Forget blocks:
// - { id, type: "text", text: "..." }
// - { id, type: "bullet", text: "..." }
// - { id, type: "checkbox", text: "...", checked: boolean }
//
// Notion blocks:
// - paragraph
// - bulleted_list_item
// - to_do

// --------------------------------------------------
// Convert a local Never-Forget block to a Notion block
// --------------------------------------------------

function neverForgetToNotion(block) {
  const content = typeof block.text === "string" ? block.text : "";

  const richText = [
    {
      type: "text",
      text: {
        content
      }
    }
  ];

  if (block.type === "checkbox") {
    return {
      object: "block",
      type: "to_do",
      to_do: {
        rich_text: richText,
        checked: block.checked === true
      }
    };
  }

  if (block.type === "bullet") {
    return {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: richText
      }
    };
  }

  // Default: paragraph
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: richText
    }
  };
}

// --------------------------------------------------
// Convert an array of local blocks to Notion blocks
// --------------------------------------------------

function mapLocalBlocksToNotion(blocks) {
  if (!Array.isArray(blocks)) {
    return [];
  }

  return blocks.map(neverForgetToNotion);
}

// --------------------------------------------------
// Helper: Extract plain text from Notion's rich_text array
// --------------------------------------------------

function extractPlainText(richTextArray) {
  if (!Array.isArray(richTextArray)) {
    return "";
  }

  return richTextArray
    .map((item) => item?.plain_text || "")
    .join("");
}

// --------------------------------------------------
// Convert a Notion block to a Never-Forget local block
// --------------------------------------------------

function notionToNeverForget(notionBlock) {
  if (!notionBlock || typeof notionBlock !== "object") {
    return null;
  }

  const blockId = notionBlock.id;
  const blockType = notionBlock.type;

  // 1. To-do (Checkbox)
  if (blockType === "to_do") {
    const text = extractPlainText(notionBlock.to_do?.rich_text);
    const checked = notionBlock.to_do?.checked === true;

    return {
      id: blockId,
      type: "checkbox",
      text,
      checked
    };
  }

  // 2. Bulleted list item
  if (blockType === "bulleted_list_item") {
    const text = extractPlainText(notionBlock.bulleted_list_item?.rich_text);

    return {
      id: blockId,
      type: "bullet",
      text
    };
  }

  // 3. Numbered list item (mapped to bullet for clean display)
  if (blockType === "numbered_list_item") {
    const text = extractPlainText(notionBlock.numbered_list_item?.rich_text);

    return {
      id: blockId,
      type: "bullet",
      text
    };
  }

  // 4. Paragraph
  if (blockType === "paragraph") {
    const text = extractPlainText(notionBlock.paragraph?.rich_text);

    return {
      id: blockId,
      type: "text",
      text
    };
  }

  // 5. Headings
  if (blockType === "heading_1" || blockType === "heading_2" || blockType === "heading_3") {
    const text = extractPlainText(notionBlock[blockType]?.rich_text);

    return {
      id: blockId,
      type: "text",
      text
    };
  }

  // 6. Unsupported Notion blocks (preserved non-destructively)
  return {
    id: blockId,
    type: "unsupported",
    text: `[Notion: ${blockType}]`,
    rawNotionBlock: notionBlock
  };
}

// --------------------------------------------------
// Convert an array of Notion blocks to local blocks
// --------------------------------------------------

function mapNotionBlocksToLocal(notionBlocks) {
  if (!Array.isArray(notionBlocks)) {
    return [];
  }

  return notionBlocks
    .map(notionToNeverForget)
    .filter((block) => block !== null);
}

module.exports = {
  neverForgetToNotion,
  mapLocalBlocksToNotion,
  notionToNeverForget,
  mapNotionBlocksToLocal,
  extractPlainText
};

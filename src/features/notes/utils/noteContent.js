const ALLOWED_TAGS = new Set([
  "BR",
  "B",
  "DEL",
  "DIV",
  "EM",
  "H2",
  "H3",
  "I",
  "LI",
  "OL",
  "P",
  "S",
  "STRONG",
  "UL",
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function flushMarkdownList(blocks, listState) {
  if (!listState.items.length) {
    return;
  }

  blocks.push(
    `<${listState.type}>${listState.items
      .map((item) => `<li>${applyInlineMarkdown(item)}</li>`)
      .join("")}</${listState.type}>`,
  );
  listState.type = "";
  listState.items = [];
}

function markdownToHtml(value) {
  const blocks = [];
  const listState = { type: "", items: [] };

  for (const rawLine of String(value ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line) {
      flushMarkdownList(blocks, listState);
      blocks.push("<p><br></p>");
      continue;
    }

    if (line.startsWith("# ")) {
      flushMarkdownList(blocks, listState);
      blocks.push(`<h2>${applyInlineMarkdown(line.slice(2).trim())}</h2>`);
      continue;
    }

    if (line.startsWith("## ")) {
      flushMarkdownList(blocks, listState);
      blocks.push(`<h3>${applyInlineMarkdown(line.slice(3).trim())}</h3>`);
      continue;
    }

    const checkboxMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);

    if (checkboxMatch) {
      flushMarkdownList(blocks, listState);
      const isChecked = checkboxMatch[1].toLowerCase() === "x";
      blocks.push(
        `<div data-note-checklist="true" data-checked="${isChecked ? "true" : "false"}">${applyInlineMarkdown(
          checkboxMatch[2].trim(),
        )}</div>`,
      );
      continue;
    }

    if (line.startsWith("- ")) {
      if (listState.type && listState.type !== "ul") {
        flushMarkdownList(blocks, listState);
      }

      listState.type = "ul";
      listState.items.push(line.slice(2).trim());
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);

    if (orderedMatch) {
      if (listState.type && listState.type !== "ol") {
        flushMarkdownList(blocks, listState);
      }

      listState.type = "ol";
      listState.items.push(orderedMatch[1].trim());
      continue;
    }

    flushMarkdownList(blocks, listState);
    blocks.push(`<p>${applyInlineMarkdown(line)}</p>`);
  }

  flushMarkdownList(blocks, listState);
  return blocks.join("") || "<p><br></p>";
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value ?? ""));
}

function sanitizeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeHtml(node.textContent ?? "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tagName = node.tagName.toUpperCase();

  if (!ALLOWED_TAGS.has(tagName)) {
    return Array.from(node.childNodes).map(sanitizeNode).join("");
  }

  if (tagName === "BR") {
    return "<br>";
  }

  const children = Array.from(node.childNodes).map(sanitizeNode).join("");

  if (tagName === "B") {
    return `<strong>${children}</strong>`;
  }

  if (tagName === "I") {
    return `<em>${children}</em>`;
  }

  if (tagName === "DEL") {
    return `<s>${children}</s>`;
  }

  if (tagName === "DIV" && node.dataset.noteChecklist === "true") {
    const isChecked = node.dataset.checked === "true";
    return `<div data-note-checklist="true" data-checked="${isChecked ? "true" : "false"}">${children || "<br>"}</div>`;
  }

  const safeTagName = tagName.toLowerCase();
  return `<${safeTagName}>${children || (safeTagName === "p" ? "<br>" : "")}</${safeTagName}>`;
}

export function normalizeNoteContentHtml(value) {
  const source = looksLikeHtml(value) ? String(value ?? "") : markdownToHtml(value);

  if (typeof DOMParser === "undefined") {
    return markdownToHtml(value);
  }

  const documentNode = new DOMParser().parseFromString(
    `<div>${source}</div>`,
    "text/html",
  );
  const root = documentNode.body.firstElementChild;
  const html = Array.from(root?.childNodes ?? []).map(sanitizeNode).join("");

  return html || "<p><br></p>";
}

export function isNoteContentEmpty(value) {
  const html = normalizeNoteContentHtml(value);

  if (typeof DOMParser === "undefined") {
    return !String(value ?? "").trim();
  }

  const documentNode = new DOMParser().parseFromString(html, "text/html");
  return !documentNode.body.textContent?.trim();
}

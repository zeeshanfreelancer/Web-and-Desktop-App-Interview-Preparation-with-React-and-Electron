// Restricts saved rich-text content to an allowlist before it is rendered in the application.
const ALLOWED_TAGS = new Set([
  "B",
  "BR",
  "DIV",
  "EM",
  "FONT",
  "I",
  "LI",
  "OL",
  "P",
  "SPAN",
  "STRONG",
  "U",
  "UL"
]);

const COLOR_PATTERN = /^(#[0-9a-f]{3}(?:[0-9a-f]{3})?|[a-z]+)$/i;
const FONT_SIZE_PATTERN = /^[1-7]$/;

export const sanitizeRichText = (html) => {
  const container = document.createElement("div");
  container.innerHTML = html ?? "";

  const sanitizeNode = (node) => {
    for (const child of [...node.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        sanitizeNode(node);
        continue;
      }

      const color = child.getAttribute("color");
      const size = child.getAttribute("size");
      child.replaceChildren(...child.childNodes);
      for (const attribute of [...child.attributes]) {
        child.removeAttribute(attribute.name);
      }

      if (child.tagName === "FONT" && color && COLOR_PATTERN.test(color)) {
        child.setAttribute("color", color);
      }
      if (child.tagName === "FONT" && size && FONT_SIZE_PATTERN.test(size)) {
        child.setAttribute("size", size);
      }

      sanitizeNode(child);
    }
  };

  sanitizeNode(container);
  return container.innerHTML;
};

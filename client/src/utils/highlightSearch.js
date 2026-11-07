// Safely highlights matching text inside question and answer HTML without changing the original data.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const highlightHtml = (html, searchTerm) => {
  const term = searchTerm?.trim();
  if (!term || !html) return html;

  const container = document.createElement('div');
  container.innerHTML = html;

  const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach((node) => {
    const text = node.textContent;
    if (!text || !regex.test(text)) return;

    regex.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const mark = document.createElement('mark');
      mark.className = 'search-highlight bg-yellow-200 text-yellow-900 rounded px-0.5 font-medium';
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  });

  return container.innerHTML;
};

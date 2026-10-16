/**
 * Minimal inline formatting for story text, built as DOM nodes rather than HTML.
 *
 * Supported:
 *   **bold**   *italic*   [link text](https://example.com)
 *
 * Links may use http(s), mailto, a relative path, or a #fragment. Anything else is shown as plain text.
 */

const TOKEN = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function isSafeUrl(url) {
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (/^(https?:|mailto:)/i.test(trimmed)) return true;
    // Relative paths and fragments, but not protocol-relative or other schemes
    return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !trimmed.startsWith('//');
}

/**
 * Appends formatted text to an element.
 * @param {HTMLElement} parent
 * @param {string} text
 * @returns {HTMLElement} parent
 */
export function appendRichText(parent, text) {
    const doc = parent.ownerDocument || document;
    const source = String(text ?? '');
    let last = 0;

    for (const match of source.matchAll(TOKEN)) {
        if (match.index > last) {
            parent.appendChild(doc.createTextNode(source.slice(last, match.index)));
        }
        const [whole, bold, italic, label, url] = match;
        if (bold !== undefined) {
            const strong = doc.createElement('strong');
            strong.textContent = bold;
            parent.appendChild(strong);
        } else if (italic !== undefined) {
            const em = doc.createElement('em');
            em.textContent = italic;
            parent.appendChild(em);
        } else if (isSafeUrl(url)) {
            const a = doc.createElement('a');
            a.textContent = label;
            a.href = url;
            if (/^https?:/i.test(url)) {
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
            }
            parent.appendChild(a);
        } else {
            parent.appendChild(doc.createTextNode(whole));
        }
        last = match.index + whole.length;
    }

    if (last < source.length) {
        parent.appendChild(doc.createTextNode(source.slice(last)));
    }
    return parent;
}

/**
 * Creates one element per paragraph. Accepts a string or an array of strings.
 * @param {string|string[]} text
 * @param {string} [tag='p']
 * @param {Document} [doc=document]
 * @returns {HTMLElement[]}
 */
export function richParagraphs(text, tag = 'p', doc = document) {
    const paragraphs = Array.isArray(text) ? text : [text];
    return paragraphs
        .filter(p => p !== undefined && p !== null && String(p).length > 0)
        .map(p => appendRichText(doc.createElement(tag), p));
}

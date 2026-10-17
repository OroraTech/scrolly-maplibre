import { appendRichText } from '../utils/richText.js';

export function createFigcaption(caption, credit, doc = document) {
    if (!caption && !credit) return null;
    const element = doc.createElement('figcaption');
    element.className = 'media-caption';
    if (caption) appendRichText(element, caption);
    if (credit) {
        if (caption) element.appendChild(doc.createTextNode(' '));
        const source = doc.createElement('span');
        source.className = 'media-credit';
        appendRichText(source, credit);
        element.appendChild(source);
    }
    return element;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { appendRichText, isSafeUrl, richParagraphs } from '../src/js/utils/richText.js';

// Just enough of the DOM to see what appendRichText builds.
function fakeDocument() {
    const doc = {
        createElement(tag) {
            return { tag, children: [], ownerDocument: doc, appendChild(c) { this.children.push(c); return c; } };
        },
        createTextNode(text) {
            return { tag: '#text', text };
        }
    };
    return doc;
}

function render(node) {
    if (node.tag === '#text') return node.text;
    const inner = node.textContent ?? node.children.map(render).join('');
    if (node.tag === 'a') return `<a ${node.href}>${inner}</a>`;
    return `<${node.tag}>${inner}</${node.tag}>`;
}

test('formats bold, italic, and links', () => {
    const doc = fakeDocument();
    const p = appendRichText(doc.createElement('p'), 'Water is **heavy**, *slow*, and [mapped](https://example.com).');
    assert.equal(render(p), '<p>Water is <strong>heavy</strong>, <em>slow</em>, and <a https://example.com>mapped</a>.</p>');
});

test('opens external links in a new tab safely', () => {
    const doc = fakeDocument();
    const p = appendRichText(doc.createElement('p'), '[source](https://example.com)');
    assert.equal(p.children[0].target, '_blank');
    assert.equal(p.children[0].rel, 'noopener noreferrer');
});

test('leaves unsafe links as plain text', () => {
    const doc = fakeDocument();
    const p = appendRichText(doc.createElement('p'), 'Click [here](javascript:alert(1))');
    assert.ok(p.children.every(c => c.tag === '#text'));
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
    assert.equal(isSafeUrl('//evil.example'), false);
    assert.equal(isSafeUrl('graphics/timeline.html'), true);
    assert.equal(isSafeUrl('#sources'), true);
});

test('never parses HTML in the text', () => {
    const doc = fakeDocument();
    const p = appendRichText(doc.createElement('p'), '<img src=x onerror=alert(1)>');
    assert.equal(p.children.length, 1);
    assert.equal(p.children[0].tag, '#text');
});

test('makes one paragraph per array item and skips empty ones', () => {
    const doc = fakeDocument();
    const paragraphs = richParagraphs(['One', '', 'Two'], 'p', doc);
    assert.equal(paragraphs.length, 2);
});

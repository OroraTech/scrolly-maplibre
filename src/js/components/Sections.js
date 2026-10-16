import { appendRichText, isSafeUrl, richParagraphs } from '../utils/richText.js';

/**
 * Builders for the content sections in preMapContent, intermediateContent, and postMapContent.
 * Every builder takes the section config and returns one element.
 */

export const TEXT_STYLES = ['heading', 'subheading', 'paragraph', 'lede', 'kicker', 'note'];
export const SECTION_TYPES = ['text', 'media', 'quote', 'stats', 'embed', 'hero', 'divider', 'list', 'compare', 'scrolly-embed'];
export const MEDIA_POSITIONS = ['full-width', 'wide', 'inline', 'left', 'right'];

function el(tag, className, doc = document) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
}

/** A caption and credit line, used under images, video, and embeds. */
export function createFigcaption(caption, credit, doc = document) {
    if (!caption && !credit) return null;
    const figcaption = el('figcaption', 'media-caption', doc);
    if (caption) appendRichText(figcaption, caption);
    if (credit) {
        if (caption) figcaption.appendChild(doc.createTextNode(' '));
        figcaption.appendChild(appendRichText(el('span', 'media-credit', doc), credit));
    }
    return figcaption;
}

function createText(section, doc) {
    const style = section.style || 'paragraph';
    const tags = { heading: 'h2', subheading: 'h3', kicker: 'p', lede: 'p', note: 'p', paragraph: 'p' };
    const classes = {
        heading: 'story-heading',
        subheading: 'story-subheading',
        kicker: 'story-kicker',
        lede: 'story-lede',
        note: 'story-note',
        paragraph: 'paragraph'
    };
    const nodes = richParagraphs(section.content, tags[style] || 'p', doc);
    nodes.forEach(node => {
        node.className = classes[style] || 'paragraph';
        if (section.id) node.id = section.id;
    });
    if (nodes.length === 1) return nodes[0];
    const group = el('div', 'text-group', doc);
    nodes.forEach(node => group.appendChild(node));
    return group;
}

function createMedia(section, doc) {
    const figure = el('figure', `media-container position-${section.position || 'full-width'}`, doc);
    const mediaType = section.type === 'media' ? section.mediaType : section.type;

    if (mediaType === 'image') {
        const img = el('img', `media-item position-${section.position || 'full-width'}`, doc);
        img.src = section.url;
        img.alt = section.alt || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        if (section.width) img.width = section.width;
        if (section.height) img.height = section.height;
        figure.appendChild(img);
    } else if (mediaType === 'video') {
        const video = el('video', `media-item position-${section.position || 'full-width'}`, doc);
        video.src = section.url;
        video.controls = section.controls ?? true;
        video.muted = section.muted ?? true;
        video.playsInline = true;
        if (section.autoplay) {
            video.autoplay = true;
            video.loop = true;
        }
        if (section.poster) video.poster = section.poster;
        figure.appendChild(video);
    }

    const caption = createFigcaption(section.caption, section.credit, doc);
    if (caption) figure.appendChild(caption);
    return figure;
}

function createQuote(section, doc) {
    const figure = el('figure', 'story-quote', doc);
    const blockquote = el('blockquote', '', doc);
    richParagraphs(section.content, 'p', doc).forEach(p => blockquote.appendChild(p));
    if (section.cite && isSafeUrl(section.cite)) blockquote.cite = section.cite;
    figure.appendChild(blockquote);
    if (section.attribution) {
        const attribution = el('figcaption', 'quote-attribution', doc);
        appendRichText(attribution, section.attribution);
        figure.appendChild(attribution);
    }
    return figure;
}

function createStats(section, doc) {
    const wrapper = el('div', `story-stats position-${section.position || 'full-width'}`, doc);
    const list = el('dl', 'stat-row', doc);
    // One column per stat, so a row of four stays on one line
    list.style.setProperty('--stat-count', String((section.items || []).length || 1));
    (section.items || []).forEach(item => {
        const tile = el('div', 'stat-tile', doc);
        const value = el('dd', 'stat-value', doc);
        value.textContent = item.value;
        const label = el('dt', 'stat-label', doc);
        appendRichText(label, item.label);
        tile.appendChild(label);
        tile.appendChild(value);
        if (item.note) {
            const note = el('dd', 'stat-note', doc);
            appendRichText(note, item.note);
            tile.appendChild(note);
        }
        list.appendChild(tile);
    });
    wrapper.appendChild(list);
    if (section.caption || section.credit) {
        wrapper.appendChild(createFigcaption(section.caption, section.credit, doc));
    }
    return wrapper;
}

function createEmbed(section, doc) {
    const figure = el('figure', `story-embed position-${section.position || 'full-width'}`, doc);
    const frame = el('iframe', '', doc);
    frame.src = section.url;
    frame.title = section.title || 'Embedded graphic';
    frame.loading = 'lazy';
    frame.setAttribute('scrolling', 'no');
    frame.style.setProperty('--embed-height', `${section.height || 480}px`);
    frame.style.setProperty('--embed-mobile-height', `${section.mobileHeight || section.height || 480}px`);
    figure.appendChild(frame);
    listenForEmbedHeight(frame);
    const caption = createFigcaption(section.caption, section.credit, doc);
    if (caption) figure.appendChild(caption);
    return figure;
}

/**
 * Embedded pages can size their own frame by posting
 * { type: 'scrolly-embed-height', height } to the parent window.
 * Only messages from the frame's own window are accepted.
 */
function listenForEmbedHeight(frame) {
    if (typeof window === 'undefined') return;
    window.addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow) return;
        const data = event.data;
        if (!data || data.type !== 'scrolly-embed-height') return;
        const height = Number(data.height);
        if (!Number.isFinite(height) || height <= 0 || height > 10000) return;
        frame.style.height = `${Math.ceil(height)}px`;
    });
}

function createHero(section, doc) {
    const header = el('header', 'story-hero', doc);
    if (section.video) {
        // A silent looping background video, with the image as its poster
        const video = el('video', 'hero-image', doc);
        video.src = section.video;
        if (section.image) video.poster = section.image;
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        video.setAttribute('aria-label', section.alt || '');
        if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
            video.autoplay = false;
        }
        header.appendChild(video);
    } else if (section.image) {
        const img = el('img', 'hero-image', doc);
        img.src = section.image;
        img.alt = section.alt || '';
        img.fetchPriority = 'high';
        header.appendChild(img);
    }
    const inner = el('div', 'hero-content', doc);
    if (section.kicker) appendRichText(inner.appendChild(el('p', 'hero-kicker', doc)), section.kicker);
    if (section.title) appendRichText(inner.appendChild(el('h1', 'hero-title', doc)), section.title);
    if (section.dek) appendRichText(inner.appendChild(el('p', 'hero-dek', doc)), section.dek);
    if (section.byline) appendRichText(inner.appendChild(el('p', 'hero-byline', doc)), section.byline);
    header.appendChild(inner);
    if (section.credit) appendRichText(header.appendChild(el('p', 'hero-credit', doc)), section.credit);
    return header;
}

function createList(section, doc) {
    const list = el(section.ordered ? 'ol' : 'ul', 'story-list', doc);
    (section.items || []).forEach(item => appendRichText(list.appendChild(el('li', '', doc)), item));
    return list;
}

/** Two aligned images with a slider that reveals one over the other. */
function createCompare(section, doc) {
    const figure = el('figure', `story-compare position-${section.position || 'full-width'}`, doc);
    const frame = el('div', 'compare-frame', doc);
    const before = el('img', 'compare-before', doc);
    before.src = section.before.url;
    before.alt = section.before.alt || '';
    before.loading = 'lazy';
    const afterWrap = el('div', 'compare-after', doc);
    const after = el('img', '', doc);
    after.src = section.after.url;
    after.alt = section.after.alt || '';
    after.loading = 'lazy';
    afterWrap.appendChild(after);
    const handle = el('div', 'compare-handle', doc);
    handle.setAttribute('aria-hidden', 'true');
    frame.append(before, afterWrap, handle);

    [['before', 'compare-label-before'], ['after', 'compare-label-after']].forEach(([key, cls]) => {
        if (section[key].label) {
            const label = el('span', `compare-label ${cls}`, doc);
            label.textContent = section[key].label;
            frame.appendChild(label);
        }
    });

    const slider = el('input', 'compare-slider', doc);
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(section.start ?? 50);
    slider.setAttribute('aria-label', section.sliderLabel || `Slide to compare ${section.before.label || 'before'} and ${section.after.label || 'after'}`);
    const update = () => frame.style.setProperty('--compare', `${slider.value}%`);
    slider.addEventListener('input', update);
    update();
    frame.appendChild(slider);

    figure.appendChild(frame);
    const caption = createFigcaption(section.caption, section.credit, doc);
    if (caption) figure.appendChild(caption);
    return figure;
}

/**
 * A sticky graphic with text steps that scroll past it. The framework posts
 * { type: 'scrolly-step', index, progress } to the embedded page as the reader moves
 * through each step, so the graphic can change with the story.
 */
function createScrollyEmbed(section, doc) {
    const wrapper = el('section', 'story-scrolly-embed', doc);
    const graphic = el('div', 'se-graphic', doc);
    const frame = el('iframe', '', doc);
    frame.src = section.url;
    frame.title = section.title || 'Embedded graphic';
    frame.loading = 'eager';
    graphic.appendChild(frame);

    const stepsEl = el('div', 'se-steps', doc);
    (section.steps || []).forEach((step, index) => {
        const stepEl = el('div', 'se-step', doc);
        stepEl.dataset.index = String(index);
        const card = el('div', 'se-card', doc);
        if (step.kicker) appendRichText(card.appendChild(el('p', 'se-kicker', doc)), step.kicker);
        if (step.title) appendRichText(card.appendChild(el('h3', 'se-title', doc)), step.title);
        richParagraphs(step.content, 'p', doc).forEach(p => card.appendChild(p));
        stepEl.appendChild(card);
        stepsEl.appendChild(stepEl);
    });

    wrapper.append(graphic, stepsEl);
    const caption = createFigcaption(section.caption, section.credit, doc);
    if (caption) wrapper.appendChild(caption);
    if (typeof window !== 'undefined') trackScrollySteps(wrapper, frame);
    return wrapper;
}

function trackScrollySteps(wrapper, frame) {
    let last = '';
    let queued = false;
    const post = () => {
        queued = false;
        const steps = wrapper.querySelectorAll('.se-step');
        const middle = window.innerHeight / 2;
        let index = 0;
        let progress = 0;
        steps.forEach((stepEl, i) => {
            const rect = stepEl.getBoundingClientRect();
            if (rect.top <= middle) {
                index = i;
                progress = Math.max(0, Math.min(1, (middle - rect.top) / rect.height));
            }
        });
        steps.forEach((stepEl, i) => stepEl.classList.toggle('is-active', i === index));
        const message = { type: 'scrolly-step', index, progress: Math.round(progress * 1000) / 1000 };
        const key = `${message.index}:${message.progress}`;
        if (key === last || !frame.contentWindow) return;
        last = key;
        frame.contentWindow.postMessage(message, '*');
    };
    const queue = () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(post);
    };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue, { passive: true });
    frame.addEventListener('load', () => { last = ''; post(); });
}

const BUILDERS = {
    'scrolly-embed': createScrollyEmbed,
    compare: createCompare,
    text: createText,
    media: createMedia,
    quote: createQuote,
    stats: createStats,
    embed: createEmbed,
    hero: createHero,
    divider: (section, doc) => el('hr', 'story-divider', doc),
    list: createList
};

/**
 * Builds the element for one content section.
 * @param {Object} section
 * @param {Document} [doc=document]
 * @returns {HTMLElement}
 */
export function createSection(section, doc = document) {
    const build = BUILDERS[section?.type];
    if (!build) return el('div', '', doc);
    const node = build(section, doc);
    if (section.className) node.classList.add(...String(section.className).split(/\s+/).filter(Boolean));
    return node;
}

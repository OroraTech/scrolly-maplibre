function parseRules(source) {
    const rules = [];
    let start = 0;
    let depth = 0;
    let open = -1;
    let quote = '';
    for (let position = 0; position < source.length; position++) {
        const character = source[position];
        if (quote) {
            if (character === quote && source[position - 1] !== '\\') quote = '';
            continue;
        }
        if (character === '"' || character === "'") { quote = character; continue; }
        if (character === '{') {
            if (!depth) open = position;
            depth++;
        }
        if (character === '}') {
            depth--;
            if (!depth) {
                rules.push({ selector: source.slice(start, open).trim(), body: source.slice(open + 1, position) });
                start = position + 1;
            }
        }
    }
    if (depth) throw new Error('Unbalanced stylesheet.');
    return rules;
}

function selectRules(rules, mode) {
    const result = [];
    for (const { selector, body } of rules) {
        if (selector.startsWith('@media') || selector.startsWith('@supports')) {
            const selected = selectRules(parseRules(body), mode);
            if (selected) result.push(`${selector}{${selected}}`);
            continue;
        }
        if (selector.startsWith('@')) { result.push(`${selector}{${body}}`); continue; }
        const selectors = selector.split(',').map(value => value.trim()).filter(value => {
            if (/^(html|body)(?:[\s:{.]|$)/.test(value)) return false;
            if (value === ':root' || value === '.story-container') return true;
            const story = /story-(heading|subheading|kicker|lede|note|quote|stats|embed|hero|list|divider|compare|scrolly)|text-content|media-container|media-caption|media-credit|compare-|se-/.test(value);
            if (value.includes('.content-box')) return mode === 'core';
            return mode === (story ? 'story' : 'core');
        }).map(value => value.replaceAll(':root', ':where(.story-container)')
            .replaceAll('#pre-map-section', '[data-story-section="pre-map"]')
            .replaceAll('#post-map-section', '[data-story-section="post-map"]'));
        if (selectors.length) result.push(`${selectors.join(',')}{${body}}`);
    }
    return result.join('\n');
}

export function splitStyles(css) {
    const rules = parseRules(css.replace(/\/\*[\s\S]*?\*\//g, ''));
    const foundation = '.story-container{box-sizing:border-box;font-family:var(--scrolly-font);color:var(--scrolly-text);background:var(--scrolly-bg)}.story-container *,.story-container *::before,.story-container *::after{box-sizing:inherit}';
    return { core: foundation + selectRules(rules, 'core'), story: foundation + selectRules(rules, 'story') };
}

class TrackedWindow extends EventTarget {
    constructor() { super(); this.innerHeight = 800; this.listeners = new Map(); }
    addEventListener(type, callback, options) {
        const callbacks = this.listeners.get(type) || new Set();
        callbacks.add(callback);
        this.listeners.set(type, callbacks);
        super.addEventListener(type, callback, options);
    }
    removeEventListener(type, callback, options) {
        this.listeners.get(type)?.delete(callback);
        super.removeEventListener(type, callback, options);
    }
    count() { return [...this.listeners.values()].reduce((total, callbacks) => total + callbacks.size, 0); }
}

class Element extends EventTarget {
    constructor(tag, doc) {
        super();
        this.tagName = tag.toUpperCase();
        this.ownerDocument = doc;
        this.children = [];
        this.className = '';
        this.dataset = {};
        this.style = { setProperty(name, value) { this[name] = value; } };
        this.classList = {
            add: (...values) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...values])].join(' '); },
            toggle: (value, on) => {
                const values = new Set(this.className.split(' ').filter(Boolean));
                if (on) values.add(value); else values.delete(value);
                this.className = [...values].join(' ');
            }
        };
        if (tag === 'iframe') this.contentWindow = { messages: [], postMessage(message) { this.messages.push(message); } };
    }
    set innerHTML(value) {
        if (value !== '') throw new Error('The fixture does not parse HTML.');
        this.replaceChildren();
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children.forEach(child => { child.parentNode = null; }); this.children = []; this.append(...children); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
    setAttribute(name, value) { this[name] = value; }
    getAttribute(name) { return this[name] ?? null; }
    querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...(child.querySelectorAll?.('*') || [])]);
        return descendants.filter(child => selector === '*' || (selector.startsWith('.') ? child.className?.split(' ').includes(selector.slice(1)) : selector.startsWith('#') ? child.id === selector.slice(1) : child.tagName?.toLowerCase() === selector));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { top: 0, height: 800 }; }
}

export function installDOM() {
    const previous = new Map();
    const frames = new Map();
    let nextFrame = 0;
    const view = new TrackedWindow();
    const doc = { createElement(tag) { return new Element(tag, doc); }, createTextNode(value) { return { textContent: value, ownerDocument: doc }; } };
    doc.body = doc.createElement('body');
    doc.head = doc.createElement('head');
    doc.querySelector = selector => doc.body.querySelector(selector);
    doc.getElementById = id => doc.querySelector('#' + id);
    doc.defaultView = view;
    for (const [name, value] of Object.entries({
        document: doc,
        window: view,
        requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
        cancelAnimationFrame: handle => frames.delete(handle)
    })) {
        previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    const host = doc.createElement('main');
    doc.body.appendChild(host);
    return {
        host, view, doc, frames,
        flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); },
        restore() {
            for (const [name, descriptor] of previous) {
                if (descriptor) Object.defineProperty(globalThis, name, descriptor);
                else delete globalThis[name];
            }
        }
    };
}

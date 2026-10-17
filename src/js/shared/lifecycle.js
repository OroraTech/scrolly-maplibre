const cleanups = new WeakMap();

export function registerCleanup(element, callback) {
    const callbacks = cleanups.get(element) || [];
    callbacks.push(callback);
    cleanups.set(element, callbacks);
}

export function destroySection(element) {
    for (const node of [element, ...element.querySelectorAll('*')]) {
        const callbacks = cleanups.get(node);
        if (!callbacks) continue;
        cleanups.delete(node);
        for (const callback of callbacks.reverse()) callback();
    }
}

export function trackViewport(element) {
    const update = () => element.style.setProperty('--vh', `${window.innerHeight / 100}px`);
    update();
    window.addEventListener('resize', update, { passive: true });
    registerCleanup(element, () => window.removeEventListener('resize', update));
}

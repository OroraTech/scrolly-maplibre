# Embedded graphics

Use an iframe for a graphic that owns its drawing code.
The package supplies layout and scroll steps, not the artwork.

A `scrolly-embed` sends this message to its iframe:

```js
{ type: 'scrolly-step', index: 0, progress: 0.4 }
```

`index` is zero-based. `progress` is the progress through the active step, from zero to one.
The message is sent on scroll and resize, and after the iframe loads.
Handle it in the graphic:

```js
window.addEventListener('message', event => {
    if (event.source !== window.parent) return;
    if (event.data?.type !== 'scrolly-step') return;
    render(event.data.index, event.data.progress);
});
```

Treat incoming data as untrusted. Validate values before use.
For cross-origin graphics, also check the expected parent origin.
This protocol is a display signal, not an authentication mechanism.

A regular `embed` can request a height:

```js
window.parent.postMessage({
    type: 'scrolly-embed-height',
    height: document.documentElement.scrollHeight
}, window.location.origin);
```

For a cross-origin parent, replace the target origin with its exact origin.
The host accepts finite heights between zero and 10,000 pixels, and checks the sending iframe.
Use the section's `height` field when automatic sizing is unnecessary.

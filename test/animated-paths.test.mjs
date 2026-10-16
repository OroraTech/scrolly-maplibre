import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimatedPaths } from '../src/js/components/AnimatedPaths.js';

// Two river reaches on one downstream clock: the second starts where the first ends.
const network = {
    type: 'FeatureCollection',
    features: [
        { type: 'Feature', properties: { timestamps: [0, 10], order: 2 }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] } },
        { type: 'Feature', properties: { timestamps: [10, 40], order: 5 }, geometry: { type: 'LineString', coordinates: [[1, 0], [2, 0], [3, 0]] } }
    ]
};

const noMap = {};

test('normalizes every path to the longest duration by default', async () => {
    const paths = new AnimatedPaths(noMap, { sourceId: 'river', data: network });
    await paths.loadPathData();
    assert.deepEqual(paths.pathData[0].timestamps, [0, 30]);
    assert.deepEqual(paths.pathData[1].timestamps, [0, 30]);
    assert.equal(paths._maxTimestamp, 30);
});

test('keeps timestamps on a shared clock when normalizeDuration is false', async () => {
    const paths = new AnimatedPaths(noMap, { sourceId: 'river', data: network, normalizeDuration: false });
    await paths.loadPathData();
    assert.deepEqual(paths.pathData[0].timestamps, [0, 10]);
    assert.deepEqual(paths.pathData[1].timestamps, [10, 40]);
    assert.equal(paths._maxTimestamp, 40);
});

test('sets width from a feature property', async () => {
    const paths = new AnimatedPaths(noMap, { sourceId: 'river', data: network, widthProperty: 'order', widthScale: 2 });
    await paths.loadPathData();
    assert.deepEqual(paths.pathData.map(d => paths._width(d)), [4, 10]);
});

test('defaults keep the original wind behaviour', () => {
    const paths = new AnimatedPaths(noMap, { sourceId: 'wind' });
    assert.equal(paths.options.terrain, true);
    assert.equal(paths.options.loop, true);
    assert.equal(paths.options.layerId, 'wind-trails');
    assert.equal(paths._width({ speed: 30 }), 8);
});

// Minimal stand-ins for deck.gl, the map, and the animation frame loop.
function stubDeck() {
    globalThis.deck = {
        MapboxOverlay: class { constructor(props) { this.props = props; } setProps(props) { this.props = props; } },
        TripsLayer: class { constructor(props) { this.props = props; } },
        TerrainLayer: class { constructor(props) { this.props = props; } }
    };
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
}

function stubMap() {
    return { controls: 0, addControl() { this.controls++; }, removeControl() { this.controls--; } };
}

test('show() called twice while loading adds one overlay', async () => {
    stubDeck();
    const map = stubMap();
    const paths = new AnimatedPaths(map, { sourceId: 'river', data: network, terrain: false });
    await Promise.all([paths.show(), paths.show()]);
    assert.equal(map.controls, 1);
    paths.hide();
    assert.equal(map.controls, 0);
});

test('hide() while loading stops the overlay from appearing', async () => {
    stubDeck();
    const map = stubMap();
    const paths = new AnimatedPaths(map, { sourceId: 'river', data: network, terrain: false });
    const showing = paths.show();
    paths.hide();
    await showing;
    assert.equal(map.controls, 0);
    assert.equal(paths.overlay, null);
});

test('a scroll-driven flow starts at its target time', () => {
    const paths = new AnimatedPaths(noMap, { sourceId: 'river', data: network, scrollDriven: true, reveal: true });
    paths.setProgressTime(25);
    assert.equal(paths.animationTime, 25);
    paths.setProgressTime(Number.NaN);
    assert.equal(paths._targetTime, 25);
});

test('the head marker sits where the flow has reached', async () => {
    // One timestamp per vertex: the reach runs from x = 1 at t = 10 to x = 3 at t = 40
    const reach = { type: 'Feature', properties: { timestamps: [10, 25, 40] }, geometry: { type: 'LineString', coordinates: [[1, 0], [2, 0], [3, 0]] } };
    const paths = new AnimatedPaths(noMap, { sourceId: 'river', data: { type: 'FeatureCollection', features: [reach] }, normalizeDuration: false });
    await paths.loadPathData();
    paths.animationTime = 25;
    const heads = paths._headPositions();
    assert.equal(heads.length, 1);
    assert.ok(Math.abs(heads[0].position[0] - 2) < 1e-9);
});

test('data read from a file is kept after hide()', async () => {
    const paths = new AnimatedPaths(noMap, { sourceId: 'river', data: network, normalizeDuration: false });
    await paths.loadPathData();
    paths.hide();
    assert.equal(paths.pathData.length, 2);
});

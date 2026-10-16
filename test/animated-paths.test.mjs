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

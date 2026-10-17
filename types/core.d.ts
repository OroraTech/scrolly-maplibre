import type { MapInput, MapView, RuntimeOptions } from './shared.js';
export type { MapInput, MapView, LayerConfig, RuntimeOptions } from './shared.js';
export declare class ScrollyMap {
    constructor(options: RuntimeOptions & { mapContainer: string; scrollContainer: string; mapId?: string; config: MapInput; storyContainerId?: string });
    init(): Promise<void>;
    destroy(): void;
    navigateToStep(index: number): void;
    onReady(callback: () => void): void;
    map: unknown;
}
export declare class MapConfig {
    constructor(options?: Record<string, unknown>);
    getMapConfig(view: MapView): Record<string, unknown>;
}
export declare class MapValidator {
    static validateMapConfig(config: MapInput, index?: number): void;
}
export declare function createMap(options: RuntimeOptions & { container: string | HTMLElement; config: MapInput }): Promise<ScrollyMap>;
export declare function configureDependencies(dependencies: RuntimeOptions['dependencies']): void;

export interface LayerConfig {
    id: string;
    type: 'geojson' | 'pmtiles' | 'vector-tiles' | 'windgl';
    url?: string;
    data?: unknown;
    style?: Record<string, unknown>;
    [key: string]: unknown;
}
export interface MapView {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    duration?: number;
    padding?: number | Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>;
}
export interface MapInput {
    id: string;
    initParameters: {
        map: MapView;
        customStyle?: string | Record<string, unknown>;
        mapTilerKey?: string;
        useScrollama?: boolean;
        isInteractive?: boolean;
        [key: string]: unknown;
    };
    layers?: LayerConfig[];
    steps?: Array<{ id: number | string; map: MapView; title?: string; description?: string | string[]; visibleLayers?: string[]; [key: string]: unknown }>;
    intermediateContent?: ContentGroup;
}
export interface SectionInput {
    type: 'text' | 'media' | 'quote' | 'stats' | 'embed' | 'hero' | 'divider' | 'list' | 'compare' | 'scrolly-embed';
    [key: string]: unknown;
}
export interface ContentGroup { sections: SectionInput[]; id?: string; className?: string; }
export interface StoryInput {
    maps?: MapInput[];
    preMapContent?: ContentGroup;
    postMapContent?: ContentGroup;
    initParameters?: Record<string, unknown>;
}
export interface RuntimeOptions {
    dependencies?: Partial<Record<'maplibregl' | 'scrollama' | 'pmtiles' | 'deck' | 'windGL', object | Function>>;
    loadDependencies?: boolean;
    dependencyTimeout?: number;
    dependencyUrls?: Partial<Record<'maplibregl' | 'maplibreCss' | 'scrollama' | 'pmtiles' | 'windGL', string>>;
    maplibreCss?: boolean;
}

import type { ScrollyMap } from './core.js';
import type { ContentGroup, SectionInput, StoryInput, RuntimeOptions } from './shared.js';
export type { ContentGroup, SectionInput, StoryInput, RuntimeOptions } from './shared.js';
export interface StoryController { element: HTMLElement; maps: ScrollyMap[]; destroy(): void; }
export declare function createStory(container: string | HTMLElement, config: StoryInput, options?: RuntimeOptions): Promise<StoryController>;
export declare function createSection(section: SectionInput, doc?: Document): HTMLElement;
export declare function destroySection(element: HTMLElement): void;
export declare class StoryBuilder {
    static createStoryStructure(containerId: string, config: StoryInput, options?: { namespaceSections?: boolean }): void;
    static createTextSection(type: string, content: ContentGroup, namespace?: string): HTMLElement;
    static createContentElement(section: SectionInput): HTMLElement;
}
export declare class ConfigValidator { static validate(config: StoryInput): true; }

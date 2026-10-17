import { rollup } from 'rollup';
import { minify } from 'terser';
import CleanCSS from 'clean-css';
import { readFile, writeFile, mkdir, cp, rm, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'dist') throw new Error('Unsafe build output.');
try {
    if ((await lstat(output)).isSymbolicLink()) throw new Error('Build output cannot be a symbolic link.');
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const library = await rollup({
    input: {
        core: path.join(root, 'src/js/core.js'),
        story: path.join(root, 'src/js/story.js'),
        auto: path.join(root, 'src/js/core/init.js')
    }
});
await library.write({ dir: output, format: 'es', entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' });
await library.close();

const compatibility = await rollup({ input: path.join(root, 'src/js/core/init.js') });
const { output: legacy } = await compatibility.generate({ format: 'iife', inlineDynamicImports: true });
const compact = await minify(legacy[0].code, { compress: true, mangle: true });
if (!compact.code) throw new Error('The compatibility build is empty.');
await mkdir(path.join(output, 'js'), { recursive: true });
await writeFile(path.join(output, 'js/bundle.min.js'), compact.code + '\n');
await compatibility.close();

const css = await readFile(path.join(root, 'src/styles/styles.css'), 'utf8');
const { splitStyles } = await import('./split-styles.mjs');
const styles = splitStyles(css);
await mkdir(path.join(output, 'styles'), { recursive: true });
const minimize = source => {
    const result = new CleanCSS().minify(source);
    if (result.errors.length) throw new Error(result.errors.join('\n'));
    return result.styles;
};
for (const [filename, source] of Object.entries({
    'core.css': styles.core,
    'story.css': styles.story,
    'styles.min.css': css,
    'loader.min.css': await readFile(path.join(root, 'src/styles/loader.css'), 'utf8')
})) await writeFile(path.join(output, 'styles', filename), minimize(source) + '\n');
await cp(path.join(root, 'types'), path.join(output, 'types'), { recursive: true });
await cp(path.join(root, 'examples'), path.join(output, 'examples'), { recursive: true });
await cp(path.join(root, 'src/assets'), path.join(output, 'assets'), { recursive: true });
await mkdir(path.join(output, 'config'), { recursive: true });
for (const filename of ['example.json', 'basemap.json']) {
    await cp(path.join(root, 'src/config', filename), path.join(output, 'config', filename));
}
const html = (await readFile(path.join(root, 'src/index.html'), 'utf8'))
    .replaceAll('js/core/init.js', 'js/bundle.min.js')
    .replaceAll('styles/styles.css', 'styles/styles.min.css')
    .replaceAll('styles/loader.css', 'styles/loader.min.css');
await writeFile(path.join(output, 'index.html'), html);
console.log('Built core, story, auto, compatibility bundle, scoped styles, types, and demo.');

// rollup.config.js
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

export default {
  input: 'src/js/core/init.js',
  output: {
    file: 'dist/js/bundle.js',
    format: 'es',
    name: 'ScrollyMaplibre',
    inlineDynamicImports: true // Add this line
  },
  external: ['maplibregl', 'scrollama', 'pmtiles'],
  plugins: [
    resolve({ 
      extensions: ['.js'],
      preferBuiltins: false
    }),
    commonjs(),
    json()
  ]
};

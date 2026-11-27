import fs from 'node:fs/promises';

const cache = new Map();

const read = (url) => fs.readFile(url, 'utf8');

export async function loadAssets() {
  if (cache.size) return Object.fromEntries(cache);
  const [css, leafletCss, timelineJs, mapJs, editorJs, appJs, leafletJs] = await Promise.all([
    read(new URL('./assets/styles.css', import.meta.url)),
    read(new URL('../../vendor/leaflet/leaflet.css', import.meta.url)),
    read(new URL('./assets/timeline.js', import.meta.url)),
    read(new URL('./assets/map.js', import.meta.url)),
    read(new URL('./assets/editor.js', import.meta.url)),
    read(new URL('./assets/app.js', import.meta.url)),
    read(new URL('../../vendor/leaflet/leaflet.js', import.meta.url)),
  ]);
  const assets = {
    css,
    leafletCss,
    js: [timelineJs, mapJs, editorJs, appJs].join('\n'),
    leafletJs,
  };
  for (const [key, value] of Object.entries(assets)) cache.set(key, value);
  return assets;
}

import fs from 'node:fs/promises';

const cache = new Map();

export async function loadAssets() {
  if (cache.size) return Object.fromEntries(cache);
  const [css, js] = await Promise.all([
    fs.readFile(new URL('./assets/styles.css', import.meta.url), 'utf8'),
    fs.readFile(new URL('./assets/app.js', import.meta.url), 'utf8'),
  ]);
  cache.set('css', css);
  cache.set('js', js);
  return { css, js };
}

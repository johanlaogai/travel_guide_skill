# Leaflet 1.9.4 (vendored)

This directory contains Leaflet 1.9.4, vendored so the generated HTML can be a
single file with no CDN or npm dependency at view time.

- Upstream: https://leafletjs.com/
- Package: `leaflet@1.9.4`
- Files: `leaflet.js`, `leaflet.css`, `LICENSE`
- License: BSD-2-Clause; see `LICENSE`
- SHA-256:
  - `leaflet.js`: `db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a` (verify with `sha256sum`)
  - `leaflet.css`: `a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6` (verify with `sha256sum`)

Recompute with `sha256sum vendor/leaflet/leaflet.js vendor/leaflet/leaflet.css`
if the files are ever updated.

The HTML inlines these files; the basemap tiles are requested at view time from
the selected provider (Esri, Amap, or OSM) and are not part of this vendor
directory. See `../../THIRD_PARTY_NOTICES.md` for attribution and terms.

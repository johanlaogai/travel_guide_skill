# Third-party notices and data attribution

This project bundles **Leaflet 1.9.4** (BSD-2-Clause) for the interactive map.
It reads data from public APIs at build time, and the built HTML requests map
tiles from the selected basemap provider at view time:

| Source | Data | License / terms | Attribution |
| --- | --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/) | Weather forecasts, historical and climate data, geocoding | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); free API for non-commercial use | "Weather data by Open-Meteo.com" with a link to open-meteo.com |
| [OpenStreetMap](https://www.openstreetmap.org/) via [Nominatim](https://nominatim.org/) and [Overpass](https://overpass-api.de/) | Place coordinates, addresses, POI tags | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | "Data © OpenStreetMap contributors (ODbL)" and a link to openstreetmap.org/fixthemap |
| [Wikimedia](https://www.wikimedia.org/) (Wikipedia, Wikivoyage, Wikidata, Commons) | Background text, coordinates, images, official website links | CC BY-SA 4.0 for text; individual image licenses apply | Link to the source page and author/license where available |
| [Frankfurter](https://frankfurter.dev/) | Reference exchange rates (ECB) | ECB data, see project terms | Link to frankfurter.dev |
| [Nager.Date](https://date.nager.at/) | Public holidays | MIT / public data, see project terms | Link to date.nager.at |
| [TikHub](https://tikhub.io/) (optional, off by default) | Public Xiaohongshu note metadata when the user supplies a key and consents to per-request billing | Third-party API; platform terms and copyright/privacy obligations apply | Link to the note and label the source as community/UGC |
| [Esri World Street Map](https://www.esri.com/) | Default basemap raster tiles | Esri terms of use; attribution required | "Tiles © Esri" plus data providers shown in the map |
| [Amap / 高德地图](https://www.amap.com/) | Optional Chinese-label basemap tiles | Amap terms of use; attribution required | "© 高德地图" in the map |
| [OpenStreetMap tiles](https://www.openstreetmap.org/) | Optional OSM basemap tiles | ODbL data; OSM tile usage policy | "© OpenStreetMap contributors" and a link to openstreetmap.org |

Rate limits and caching obligations are enforced by the provider layer:

- Nominatim: at most 1 request/second from a single thread; descriptive
  User-Agent; results cached; no bulk geocoding or area-wide POI downloads.
- Overpass: at most one download connection at a time; small area queries;
  results cached; no bulk downloads.
- Open-Meteo: batched requests; cached; free quota respected.
- Wikimedia: serial requests, `maxlag=5`, descriptive User-Agent; cached.
- Official websites: single-page verification only, no bulk scraping.

TikHub is not affiliated with this project. Users are responsible for complying
with TikHub's terms, Xiaohongshu's platform terms, copyright, and privacy law.


## Bundled libraries

### Leaflet 1.9.4

- Path: `vendor/leaflet/leaflet.js`, `vendor/leaflet/leaflet.css`
- License: BSD-2-Clause (see `vendor/leaflet/LICENSE`)
- Copyright: 2010-2023 Volodymyr Agafonkin; 2010-2011 CloudMade
- Source: https://leafletjs.com/ (npm package `leaflet@1.9.4`)
- Purpose: pan/zoom map, markers, popups, tile layers. It is inlined into the
  single-file HTML at build time.

The basemap tiles are **not** bundled. They are requested by the browser from
the selected provider (Esri by default; Amap or OSM optional). Map providers may
change URLs or terms; the generated HTML includes provider attribution and a
visible selector so the user can switch or use the address-list fallback.

# Third-party notices and data attribution

This project contains no bundled third-party JavaScript libraries. It reads
data from public APIs at build time:

| Source | Data | License / terms | Attribution |
| --- | --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/) | Weather forecasts, historical and climate data, geocoding | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); free API for non-commercial use | "Weather data by Open-Meteo.com" with a link to open-meteo.com |
| [OpenStreetMap](https://www.openstreetmap.org/) via [Nominatim](https://nominatim.org/) and [Overpass](https://overpass-api.de/) | Place coordinates, addresses, POI tags | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | "Data © OpenStreetMap contributors (ODbL)" and a link to openstreetmap.org/fixthemap |
| [Wikimedia](https://www.wikimedia.org/) (Wikipedia, Wikivoyage, Wikidata, Commons) | Background text, coordinates, images, official website links | CC BY-SA 4.0 for text; individual image licenses apply | Link to the source page and author/license where available |
| [Frankfurter](https://frankfurter.dev/) | Reference exchange rates (ECB) | ECB data, see project terms | Link to frankfurter.dev |
| [Nager.Date](https://date.nager.at/) | Public holidays | MIT / public data, see project terms | Link to date.nager.at |
| [TikHub](https://tikhub.io/) (optional, off by default) | Public Xiaohongshu note metadata when the user supplies a key and consents to per-request billing | Third-party API; platform terms and copyright/privacy obligations apply | Link to the note and label the source as community/UGC |

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

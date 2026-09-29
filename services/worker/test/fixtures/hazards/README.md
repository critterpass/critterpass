# Hazard feed recorded responses

Public feeds, no key. MAGMA, IMO and JMA recorded 2026-09-28 (UTC+7 00:32–00:40); GDACS and CENAPRED recorded 2026-09-29 (UTC+7 23:00).

| File | Request |
|---|---|
| `magma-tingkat-aktivitas.html` | `GET https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas` (MAGMA Indonesia / PVMBG volcano activity levels; Batur, Agung and Rinjani at Level I) |
| `imo-vona-notifications.html` | `GET https://en.vedur.is/earthquakes-and-volcanism/volcanoes/vona-notifications/` (Icelandic Met Office aviation colour code notices) |
| `jma-warning-260000.json` | `GET https://www.jma.go.jp/bosai/warning/data/warning/260000.json` (JMA warnings for Kyoto prefecture; every advisory lifted) |
| `gdacs-volcano-events.json` | `GET https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=VO` (GDACS volcano events, the default window; Krakatau newest) |
| `gdacs-volcano-events-since-2020.json` | `GET …/geteventlist/SEARCH?eventlist=VO&fromdate=2020-01-01&todate=2026-09-30`, trimmed to the Kanlaon, Lewotobi and Fuego events (volcanoes listed several times) |
| `cenapred-archivo-articulos.txt` | `GET https://www.gob.mx/cenapred/es/archivo/articulos` (CENAPRED's gob.mx article archive, a jQuery script saved as text; newest post the 28 Sep Popocatépetl report) |
| `cenapred-popocatepetl-2026-09-28.html` | `GET https://www.gob.mx/cenapred/es/articulos/monitoreo-del-volcan-popocatepetl-hoy-28-de-septiembre-de-2026?idiom=es`, trimmed to its `<head>` and article body (light at Amarillo Fase 2) |

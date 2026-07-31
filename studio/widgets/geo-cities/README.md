# geo-cities — villes d'Europe

`europe.json` : l'intégralité des communes européennes de plus de 1 000 habitants
(~69 000 entrées, 54 pays dont Turquie, Russie et Ukraine), au format compact
`[nom, lat, lon, code pays ISO-2]`, triées par population décroissante (en cas
d'homonymie, la plus grande ville gagne).

Chargé par `widgets/geo.js` (loadPlaces) en complément de `geo-places.json`
(base organisée + alias d'endonymes), uniquement quand un widget carte en mode
« villes » est affiché.

Source : [GeoNames](https://www.geonames.org/) — jeu `cities1000`, licence
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/), via le paquet npm
`all-the-cities`. Régénération : voir `tools/build-geo-cities.mjs`.

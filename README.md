# 🦖 DinoRace — prototyp

Závodní hra, kde **dinosauři závodí komiksově stylizovaným „dnešním světem"** a během jízdy
se navzájem napadají — každý druh svým způsobem (kousnutí, dráp, ocas, roh).

Tohle je **rychlý náčrt (prototyp)** ve Three.js, který běží přímo v prohlížeči.
Slouží k otestování vizuálu a pocitu z jízdy, **není to hotová hra.**

## Spuštění

ES moduly nejdou otevřít přes `file://`, je potřeba jednoduchý lokální server:

```bash
# kterýkoli z těchto:
npx serve .              # Node
python3 -m http.server   # Python
```

Pak otevři vypsanou adresu (např. `http://localhost:3000` / `:8000`).

## Ovládání

| Klávesa | Akce |
|---|---|
| `W` / `↑` | plyn |
| `S` / `↓` | brzda |
| `A` `D` / `←` `→` | zatáčení |
| **mezerník** | **ÚTOK** (kousnutí / dráp / ocas / roh dle druhu) |
| `R` | restart |

Zasáhneš-li soupeře v dosahu a úhlu svého útoku, na chvíli ho **omráčíš** a roztočíš.

## Co v prototypu je

- ✅ Komiksová stylizace — cel-shading (toon) + černé inkoustové obrysy, komiksové „BAM!" bubliny
- ✅ Stylizovaný svět — oválná trať, bloky budov, komiksová obloha
- ✅ 4 druhy dinosaurů z primitiv, každý s vlastním útokem (`src/dino.js`)
- ✅ Arkádové řízení + jednoduchá AI soupeřů sledujících trať
- ✅ Počítání kol, pořadí, „rychloměr"

## Co zatím chybí (další kroky)

- Reálné podklady světa (Cesium 3D Tiles / OSM) místo placeholder budov
- Pořádné 3D modely dinosaurů místo kostek
- Lepší fyzika jízdy, kolize, smyk
- Zvuky, menu, výběr druhu, víc tratí

## Struktura

```
index.html      # HUD, styly, bootstrap
src/main.js     # herní smyčka, řízení, AI, útoky, kamera, kola
src/world.js    # trať, město, obloha
src/dino.js     # stavba dinosaurů + definice druhů/útoků
src/toon.js     # komiksový materiál + obrysy
```

Three.js se načítá z CDN (unpkg) přes importmap — žádný build krok.

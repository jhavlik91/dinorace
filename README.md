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

V menu zvol **1 hráč** nebo **2 hráči (split-screen)** a vyber dinosaura.

| Akce | 1 hráč | Hráč 1 (split) | Hráč 2 (split) |
|---|---|---|---|
| plyn / brzda | `W`/`S` nebo `↑`/`↓` | `W` / `S` | `↑` / `↓` |
| zatáčení | `A`/`D` nebo `←`/`→` | `A` / `D` | `←` / `→` |
| **ÚTOK** | **mezerník** | **mezerník** | **Enter** |
| restart | `R` | `R` | `R` |

Zasáhneš-li soupeře v dosahu a úhlu svého útoku, ubereš mu **odolnost**; po nasbírání
zásahů jde k zemi (**K.O.**). Drž se trati — mimo ni se jede pomaleji. Při ostré jízdě
ubývá **výdrž**; po vyčerpání dino umdlí a zpomalí.

## Co v prototypu je

- ✅ **Menu výběru** — 6 hratelných druhů, každý s vlastními staty (rychlost, zrychlení, zatáčení, výdrž, útok)
- ✅ Komiksová stylizace — cel-shading (toon) + černé inkoustové obrysy, komiksové „BAM!" bubliny
- ✅ Stylizovaný svět — oválná trať, fasády budov s okny, parodické landmarky, komiksová obloha
- ✅ **6 druhů dinosaurů** s texturou kůže a vlastním útokem (`src/dino.js`):
  T-Rex, Raptor, Ankylosaurus, Triceratops, Stegosaurus, Pachycefalosaurus
- ✅ Health bar + K.O. stav (po nasbírání zásahů jde dino k zemi)
- ✅ Arkádové řízení + AI soupeřů, zpomalení mimo trať
- ✅ Počítání kol, pořadí, „rychloměr"

## Co zatím chybí (další kroky)

- Reálné podklady světa (Cesium 3D Tiles / OSM) místo placeholder budov
- Pořádné 3D modely dinosaurů místo primitiv
- Lepší fyzika jízdy, kolize, smyk
- Multiplayer (lokální split-screen, nebo online), zvuky, víc tratí

## Struktura

```
index.html      # HUD, styly, bootstrap
src/main.js     # herní smyčka, řízení, AI, útoky, kamera, kola
src/world.js    # trať, město, obloha
src/dino.js     # stavba dinosaurů + definice druhů/útoků
src/toon.js     # komiksový materiál + obrysy
```

Three.js se načítá z CDN (unpkg) přes importmap — žádný build krok.

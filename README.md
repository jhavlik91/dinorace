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

V menu zvol **1 hráč** nebo **2 hráči (split-screen)**, **svět** a vyber dinosaura.

**Světy:** 🏙️ Dino City (město), 🏝️ Tropická pláž (palmy, písek), 🧸 Dětské hřiště
(barevné kostky) — každý má jinou trať, zem, oblohu i kulisy. Přepínají se v menu živě.

| Akce | 1 hráč | Hráč 1 (split) | Hráč 2 (split) |
|---|---|---|---|
| plyn / brzda | `W`/`S` nebo `↑`/`↓` | `W` / `S` | `↑` / `↓` |
| zatáčení | `A`/`D` nebo `←`/`→` | `A` / `D` | `←` / `→` |
| **ÚTOK** | **mezerník** | **mezerník** | **Enter** |
| **TURBO** | **Shift** | **levý Shift** | **pravý Shift** |
| **POUŽÍT PŘEDMĚT** | `E` | `E` | `/` |
| restart | `R` | `R` | `R` |

## Rage a power-upy

- **Rage (0–100)** roste za zásahy soupeřů a těsné průjezdy kolem překážek.
  Vysoký Rage = **vyšší max. rychlost** a **rychlejší regen turba**, ale **přitahuje raptory**
  (loví hráče s nejvyšším Rage). Pomalu opadá.
- **Power-upy** sbíráš z **beden** na trati (max 1 najednou), použiješ klávesou:
  - 🛼 **Brusle** – +30 % rychlost na 5 s
  - 🛡️ **Štít** – pohltí útoky i pasti na 6 s
  - 🍌 **Banán** – položíš past: koho trefí, otočí ho a omráčí
  - 🥚 **Dino vejce** – projektil vpřed: poškození + zpomalení
- **Catch-up**: kdo je vzadu, losuje silnější předměty.
- Zásahy mají **knockback** a **screen shake**.

Závodí **7 dinosaurů**. Navíc kolem číhají **3 nesmyslně agresivní raptoři** – ti
**nejsou závodníci** (nepočítají se do pořadí). Po startu mají pár vteřin **spánek**,
pak: dokud je hráč **první**, přiběhnou hyper-boostem (~780 km/h) a otravují ho –
omračují a odstrkují, ale **neknockoutují**. Jakmile hráč spadne na **2. místo**,
**utečou mimo view** a čekají; vrátí se, až bude hráč zase první (pokud nejsou K.O.).
Po odpočtu **3-2-1 start**.

- **Útok** ubírá soupeři **odolnost**; po nasbírání zásahů jde k zemi (**K.O.**).
  Směr záleží na druhu: hlavou **před sebe**, ocasem **vedle a za**, Triceratops **před i za**.
- **Turbo** (výdrž) startuje na nule, **získává se povedenými útoky** do soupeřů a slouží
  jako krátké zrychlení nad maximum.
- Mimo trať se jede pomaleji; budovami se **neprojede**.
- Druhy se liší hlavně **výdrží (turbo), silou útoku a jeho rozsahem**.

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

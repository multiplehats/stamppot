# `@stamppot/mcp-marktplaats`

Alleen-lezen operaties voor tweedehands advertenties op Marktplaats: zoeken op tekst, categorie, plaats, prijs, staat en aanbieddatum, en één advertentie volledig uitlezen.

De MCP biedt precies twee tools:

- `find_marktplaats_listings` zoekt advertenties en geeft per advertentie een samenvatting, plus `categorySuggestions` om de volgende zoekopdracht te verfijnen en `resolvedLocation` als er een plaatsnaam is opgezocht.
- `get_marktplaats_listing` leest één advertentie uit: de volledige beschrijving, de kenmerkentabel, de prijs en prijssoort, de biedingen, de categorie en een beknopt verkopersprofiel.

De advertenties komen van [Marktplaats](https://www.marktplaats.nl/), een **onofficiële** bron: er is geen publieke API, geen sleutel en geen beschikbaarheidsgarantie. De Gebruiksvoorwaarden van Marktplaats staan het kopiëren van advertentiegegevens alleen toe voor persoonlijk gebruik, tot maximaal honderd advertenties, en verbieden herhaald systematisch ophalen. Daarom is `limit` begrensd op 30, `offset` op 270, de beschrijving op 4000 tekens, de kenmerken op 20 en de afbeeldingen op 8, en geldt er een rate limit per aanroepend adres. Bouw hier geen eigen kopie van Marktplaats mee. Plaatsnamen worden vertaald naar een postcode met de [PDOK Locatieserver](https://www.pdok.nl/), een officiële open-data-dienst zonder sleutel. Elk resultaat draagt zijn eigen herkomst, met `official: true` of `official: false`.

Een zoekresultaat is maximaal 60 seconden gecached, een opgevraagde advertentie maximaal 120 seconden en een opgezochte plaats een dag. Geef de `observedAt` van een zoekopdracht mee als `postedSince` van de volgende om alleen nieuwe advertenties te zien; de tools onthouden zelf niets tussen aanroepen door.

Marktplaats negeert een subcategorie die zonder zijn bovenliggende categorie binnenkomt. Neem daarom `id` én `parentId` uit dezelfde `categorySuggestions`-vermelding over in `categoryId` en `parentCategoryId`, en verzin nooit zelf een categorie- of advertentie-id.

De antwoorden bevatten nooit coördinaten, telefoonnummers, e-mailadressen, bankgegevens, versleutelde verkopersidentiteiten of de namen van bieders. Prijzen staan in centen en zijn alleen een vaste vraagprijs bij `priceType: "fixed"`; bij een biedadvertentie is `priceCents` een bied- of startbedrag.

Alle tools zijn alleen-lezen en slaan niets op. Een onbekende plaatsnaam geeft `unknown_place`, een onbekende of ingetrokken advertentie `unknown_listing`, een onbereikbare bron `upstream_unavailable` en een overschreden rate limit `rate_limited` met `retryAfterSeconds: 60` — alle vier als expliciete status, niet als fout.

Gebruik het domein-endpoint op `/mcp/marktplaats`, of het gecombineerde `/mcp` endpoint.

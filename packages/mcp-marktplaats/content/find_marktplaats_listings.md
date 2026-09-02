---
category: tweedehands
tags:
  - nederland
  - marktplaats
  - tweedehands
  - advertenties
  - zoeken
related:
  - get_marktplaats_listing
---
# Tweedehands advertenties zoeken op Marktplaats

`find_marktplaats_listings` zoekt advertenties op Marktplaats en geeft per advertentie een korte samenvatting terug: titel, vraagprijs, prijssoort, staat, levering, plaats, afstand en de datum waarop de advertentie is aangeboden. Gebruik het voor vragen als “Wat staat er in de buurt van Enschede aan tweedehands PlayStation 5’s?” of “Zijn er nieuwe eiken eettafels onder de 300 euro?”

## Werkwijze voor agents

Begin breed met alleen `query`, kijk daarna naar `categorySuggestions` in het antwoord en herhaal de zoekopdracht met `categoryId` én `parentCategoryId` uit dezelfde suggestie. Marktplaats negeert een subcategorie die zonder zijn bovenliggende categorie binnenkomt, dus neem beide waarden letterlijk over en verzin ze nooit zelf.

```json
{
  "query": "playstation 5",
  "location": { "place": "Enschede", "radiusKm": 30 },
  "conditions": ["like_new", "used"],
  "sortBy": "newest",
  "limit": 10
}
```

Geef `location.place` mee als je een plaatsnaam hebt; die wordt via de PDOK Locatieserver naar een postcode vertaald en de gevonden plaats, gemeente en provincie komen terug in `resolvedLocation`. Heb je al een postcode, geef die dan direct mee in `location.postcode`; er wordt dan niets opgezocht. Zonder `location` zoekt de tool landelijk, blijft `distanceKm` leeg en is `sortBy: "distance"` niet toegestaan.

Voor een dagelijkse speurtocht werkt dit recept: doe één zoekopdracht met plaats, straal, de gewenste `conditions` en `postedSince` gelijk aan de `observedAt` van je vorige aanroep. Je krijgt dan alleen advertenties die sindsdien zijn aangeboden. Houd zelf bij welke `id`-waarden je al hebt gezien, want de tool onthoudt niets tussen aanroepen door. Vraag daarna alleen voor de kansrijke advertenties de volledige tekst op met `get_marktplaats_listing`; dat is de enige plek waar de hele beschrijving en de kenmerkentabel staan.

Let op de prijssoort voordat je een bedrag noemt. `priceCents` is alleen een vaste vraagprijs bij `priceType: "fixed"`; bij `bidding` is het een bied- of startbedrag, en bij `free`, `see_description`, `negotiable`, `on_request`, `exchange` of `reserved` zegt het bedrag weinig tot niets. `postedLabel` bevat het label van de bron zelf (“Vandaag”, “Gisteren”, “22 aug 26”) en `postedOn` de daaruit afgeleide kalenderdag in de Nederlandse tijdzone.

## Bron, versheid en fouten

De advertenties komen van [Marktplaats](https://www.marktplaats.nl/), een **onofficiële bron**: er is geen publieke API en geen beschikbaarheidsgarantie. De Gebruiksvoorwaarden van Marktplaats staan het kopiëren van advertentiegegevens alleen toe voor persoonlijk gebruik, tot maximaal honderd advertenties, en verbieden herhaald systematisch ophalen. Daarom is `limit` begrensd op 30 en mag `offset` plus `limit` niet boven de 100 uitkomen, zodat één zoekopdracht hoogstens honderd advertenties kan doorbladeren, en geldt er een rate limit per aanroepend adres. Gebruik de tool zoals een mens dat zou doen en bouw er geen eigen kopie van Marktplaats mee.

Een zoekresultaat is een momentopname die maximaal 60 seconden is gecached; een opgevraagde advertentie maximaal 120 seconden. Er komen nooit coördinaten, telefoonnummers of andere directe contactgegevens terug.

Een plaatsnaam die de Locatieserver niet kent geeft `unknown_place` met `retryable: false`; probeer dan een andere schrijfwijze of geef meteen een postcode mee. Een onbereikbare bron geeft `upstream_unavailable` met `retryable: true` en `retryAfterSeconds: 60`. Te veel opeenvolgende aanvragen vanaf hetzelfde adres geven `rate_limited` met `retryAfterSeconds: 60`.

Koppel direct op `/mcp/marktplaats`, of gebruik het gecombineerde `/mcp` endpoint.

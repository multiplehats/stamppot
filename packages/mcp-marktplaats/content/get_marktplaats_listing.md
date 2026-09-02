---
category: tweedehands
tags:
  - nederland
  - marktplaats
  - tweedehands
  - advertenties
related:
  - find_marktplaats_listings
---
# Eén Marktplaats-advertentie volledig lezen

`get_marktplaats_listing` leest één advertentie op Marktplaats uit en geeft de volledige beschrijving, de kenmerkentabel, de prijs, de biedingen, de categorie en een beknopt verkopersprofiel terug. Gebruik het zodra een zoekresultaat kansrijk lijkt en je de staat, de compleetheid of de leveringsvoorwaarden echt wilt beoordelen.

## Werkwijze voor agents

Neem de `id` letterlijk over uit een resultaat van `find_marktplaats_listings`. Verzin nooit zelf een id en leid het niet af uit een URL die je niet hebt gezien: een onbekend id geeft simpelweg `unknown_listing` terug.

```json
{
  "id": "m2437783300"
}
```

De samenvatting in een zoekresultaat is afgekapt op ongeveer 200 tekens; alleen deze tool levert de hele advertentietekst. Beoordeel de staat aan de hand van `description` in combinatie met `attributes` en `condition`, en niet op de titel alleen. Staat `descriptionTruncated: true`, dan kwam de tekst uit de verkorte samenvatting van de pagina en ontbreken er details; behandel de beschrijving dan als onvolledig.

Bij een advertentie waarop geboden kan worden bevat `bidding` het aantal biedingen, het minimale bod en het hoogste bod in centen. Wie er heeft geboden komt nooit terug. Ook telefoonnummers, bankgegevens, e-mailadressen en coördinaten komen nooit terug: alleen de naam, het type, de plaats en het aantal jaren dat de verkoper actief is.

Voor een dagelijkse speurtocht werkt dit recept: zoek eerst met `find_marktplaats_listings` op plaats, straal, `conditions` en `postedSince` gelijk aan de `observedAt` van je vorige aanroep, houd zelf bij welke `id`-waarden je al hebt gezien, en vraag daarna alleen de nieuwe kandidaten hier op. Zo blijft het aantal aanvragen klein.

## Bron, versheid en fouten

De advertentie komt van [Marktplaats](https://www.marktplaats.nl/), een **onofficiële bron**: er is geen publieke API en geen beschikbaarheidsgarantie. De Gebruiksvoorwaarden van Marktplaats staan het kopiëren van advertentiegegevens alleen toe voor persoonlijk gebruik, tot maximaal honderd advertenties, en verbieden herhaald systematisch ophalen. Daarom zijn de aantallen klein gehouden, geldt er een rate limit per aanroepend adres en is de beschrijving begrensd op 4000 tekens, het aantal kenmerken op 20 en het aantal afbeeldingen op 8.

Een opgevraagde advertentie is een momentopname die maximaal 120 seconden is gecached; een zoekresultaat maximaal 60 seconden. Meld de prijs altijd samen met `priceType`, want bij een biedadvertentie is `priceCents` geen vraagprijs.

Een onbekend of ingetrokken id geeft `unknown_listing` met `retryable: false`. Een onbereikbare bron geeft `upstream_unavailable` met `retryable: true` en `retryAfterSeconds: 60`. Te veel opeenvolgende aanvragen vanaf hetzelfde adres geven `rate_limited` met `retryAfterSeconds: 60`.

Koppel direct op `/mcp/marktplaats`, of gebruik het gecombineerde `/mcp` endpoint.

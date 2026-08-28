---
category: boodschappen
tags:
  - nederland
  - boodschappenprijzen
  - supermarkten
  - prijs-per-eenheid
related:
  - plan_grocery_basket
---
# Actuele Nederlandse boodschappenopties vinden

`find_grocery_options` doorzoekt de actuele Nederlandse boodschappencatalogus op echte verpakkingen. Gebruik het voor vragen als “Waar is 500 ml shampoo het goedkoopst?” of “Welke optie heeft de beste prijs per liter?” Het resultaat houdt de kassaprijs gescheiden van de vergelijkbare waarde per gewicht, volume en stuk.

## Werkwijze voor agents

Stuur een concrete productzoekopdracht. Beperk de zoekopdracht optioneel tot unieke winkel-slugs en kies een limiet voor het aantal resultaten. Een lege winkellijst betekent alle huidige winkels; een geldige maar onbekende slug levert bewust geen resultaten op in plaats van de zoekopdracht te verbreden.

```json
{
  "query": "500 ml shampoo",
  "retailerSlugs": ["ah", "jumbo"],
  "limit": 10
}
```

Het antwoord wijst de goedkoopste verpakking bij de kassa aan en noemt apart de beste vergelijkbare waarde in elke compatibele dimensie. Onbekende verpakkingshoeveelheden worden nooit winnaar op waarde per eenheid, en gewicht, volume en aantal stuks worden nooit met elkaar vergeleken.

## Bron, versheid en fouten

De opties komen uit de [Checkjebon](https://github.com/supermarkt/checkjebon) supermarktdataset onder de MIT-licentie. Resultaten bevatten de actuele catalogusversie en het observatietijdstip. Een momentopname ouder dan 48 uur blijft bruikbaar, maar wordt gemarkeerd als verouderd. Prijzen zijn indicatief, kunnen per locatie of afrekenmoment verschillen en zeggen niets over voorraad.

Een ontbrekende of beschadigde catalogus geeft `catalog_unavailable` terug met `retryable: true`. Een succesvolle zoekopdracht zonder match geeft `status: "ok"` terug met een lege array met opties. Ongeldige velden worden geweigerd voordat de tool wordt uitgevoerd.

Koppel direct op `/mcp/groceries`, of gebruik het gecombineerde `/mcp` endpoint.

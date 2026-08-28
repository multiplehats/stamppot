---
category: boodschappen
tags:
  - nederland
  - boodschappenprijzen
  - mandjeplanning
  - verpakkingsafronding
related:
  - find_grocery_options
  - get_shopping_list
---
# Een actueel Nederlands boodschappenmandje plannen

`plan_grocery_basket` berekent de prijs van een geordende reeks concrete boodschappenregels aan de hand van actuele Nederlandse supermarktverpakkingen. De tool is stateless en maakt geen offerte-ID aan. Overleg bij een gelegenheid eerst met de gebruiker en splits het verzoek op in maximaal 20 producten met doelhoeveelheden.

## Werkwijze voor agents

Stuur het complete mandje. Een ontbrekend doel betekent één verpakking. Doelen voor gewicht en volume worden omgezet naar basiseenheden, waarna het aantal verpakkingen naar boven wordt afgerond zodat de gevraagde hoeveelheid gedekt is. Optionele regels krijgen een prijs zodra ze gevonden zijn; een ontbrekende optionele regel maakt het plan niet onvolledig.

```json
{
  "lines": [
    { "query": "cola", "target": { "value": 12, "unit": "l" } },
    { "query": "crisps", "target": { "value": 2, "unit": "kg" } }
  ],
  "budgetCents": 5000,
  "retailerSlugs": ["ah", "jumbo"],
  "maxStores": 3
}
```

Het resultaat vergelijkt de beste losse winkel met de goedkoopste combinatie binnen de winkellimiet. Elke geprijsde en niet-gematchte regel behoudt zijn regelnummer (dat bij 1 begint) en de oorspronkelijke zoekopdracht. Totalen behandelen niet-gematchte items nooit als gratis. Budgetvelden zijn vergelijkende metadata en verwijderen nooit stilzwijgend een regel.

Kopieer voor elke vervolgstap de complete `replayInput` uit het resultaat, pas het gewenste veld aan en stuur hem opnieuw. De replay bevat bewust geen catalogusversie, zodat een latere aanroep de nieuwste prijzen gebruikt en kan afwijken.

## Bron, versheid en fouten

Prijzen komen van [Checkjebon](https://github.com/supermarkt/checkjebon) onder de MIT-licentie. Elk resultaat bevat de catalogusherkomst, het observatietijdstip en de status vers of verouderd. Prijzen zijn indicatief, kunnen per locatie of afrekenmoment verschillen en zeggen niets over voorraad.

Een ontbrekende of beschadigde catalogus geeft `catalog_unavailable` terug met `retryable: true`. Ongeldige hoeveelheden, winkelfilters, budgetten of meer dan 20 regels worden geweigerd voordat er gepland wordt.

Koppel direct op `/mcp/groceries`, of gebruik het gecombineerde `/mcp` endpoint.

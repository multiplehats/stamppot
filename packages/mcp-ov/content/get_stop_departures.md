---
category: openbaar-vervoer
tags:
  - nederland
  - bus
  - tram
  - metro
  - ovapi
related:
  - find_ov_stop
  - get_train_departures
---
# Actuele bus-, tram- en metrovertrekken lezen

`get_stop_departures` leest de eerstvolgende vertrekken bij één halteplaats via OVapi. Gebruik het voor vragen als “Wanneer gaat de volgende tram vanaf hier?” of “Rijdt metro 54 nog vanaf Centraal Station?”

## Werkwijze voor agents

Zoek de halteplaatscode eerst op met `find_ov_stop` en controleer dat het resultaat `kind: "stop_area"` heeft. Een treinstationcode werkt hier niet; gebruik daarvoor `get_train_departures`.

```json
{
  "stopAreaCode": "09500",
  "limit": 5
}
```

Per vertrek volgen het lijnnummer, de lijnnaam, de bestemming, de vervoerssoort, de vervoerder en de status van de rit. De vertrektijden staan in `plannedDepartureLocal` en `expectedDepartureLocal`. Die velden bevatten lokale kloktijden zonder tijdzone-offset, precies zoals de bron ze levert; `timezone` is altijd `Europe/Amsterdam`. Reken ze niet om naar UTC, want de bron geeft geen offset mee. Vergelijk de geplande met de verwachte tijd voordat je een vertrektijd meldt.

## Bron, versheid en fouten

De vertrekken komen van [OVapi](http://ovapi.nl/), een **onofficiële bron** zonder gepubliceerde licentie of beschikbaarheidsgarantie, bedoeld voor niet-commercieel gebruik. Stamppot verstuurt die aanvraag over gewoon HTTP, omdat het TLS-certificaat van de bron op een andere naam staat: de gegevens zijn onderweg niet beschermd tegen manipulatie. Behandel het antwoord als indicatief en verwijs bij twijfel naar de vervoerder zelf. Het resultaat is een momentopname die maximaal een halve minuut is gecached.

Een onbekende halteplaatscode geeft `unknown_stop` terug met `retryable: false`. Een onbereikbare bron geeft `upstream_unavailable` met `retryable: true`. Te veel opeenvolgende aanvragen vanaf hetzelfde adres geven `rate_limited` met `retryAfterSeconds: 60`.

Koppel direct op `/mcp/ov`, of gebruik het gecombineerde `/mcp` endpoint.

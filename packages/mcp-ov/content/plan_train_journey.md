---
category: openbaar-vervoer
tags:
  - nederland
  - ns
  - treinreizen
  - reisplanner
related:
  - find_ov_stop
  - get_train_departures
  - get_rail_disruptions
---
# Een Nederlandse treinreis plannen

`plan_train_journey` vraagt reisadviezen op bij de officiële NS Reisinformatie API. Gebruik het voor vragen als “Hoe laat moet ik weg voor mijn afspraak van 14:00 in Amsterdam?” of “Wat is de snelste trein van Utrecht naar Rotterdam?”

## Werkwijze voor agents

Zoek eerst beide stationscodes op met `find_ov_stop`; deze tool accepteert geen plaatsnamen. Laat `dateTime` weg om vanaf nu te plannen, of geef een ISO 8601-tijdstip met offset mee. Met `searchForArrival: true` geldt dat tijdstip als gewenste aankomsttijd, wat precies de “hoe laat moet ik weg”-vraag beantwoordt.

```json
{
  "fromStation": "asd",
  "toStation": "ut",
  "dateTime": "2026-08-28T14:00:00+02:00",
  "searchForArrival": true,
  "limit": 3
}
```

Per reis volgen de geplande en verwachte duur, het aantal overstappen en per traject de vertrek- en aankomsttijd, het geplande en actuele spoor en of het traject is uitgevallen. Reizen met meer dan acht trajecten worden afgekapt; `truncatedLegCount` telt wat is weggelaten. Vergelijk altijd `plannedDateTime` met `actualDateTime` voordat je een vertrektijd aan de gebruiker meldt.

## Bron, versheid en fouten

De reisadviezen komen van de [NS Reisinformatie API](https://apiportal.ns.nl/). Tijden zijn ISO 8601 met offset. Het antwoord is een momentopname die maximaal een minuut is gecached en is geen reservering, prijsopgave of vervoerbewijs.

Een onbekende stationscode geeft `unknown_station` terug met `retryable: false`; zoek de code dan opnieuw op met `find_ov_stop`. Een onbereikbare of ontbrekend geconfigureerde NS-bron geeft `upstream_unavailable` met `retryable: true`. Te veel opeenvolgende aanvragen vanaf hetzelfde adres geven `rate_limited` met `retryAfterSeconds: 60`.

Koppel direct op `/mcp/ov`, of gebruik het gecombineerde `/mcp` endpoint.

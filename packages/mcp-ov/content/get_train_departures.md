---
category: openbaar-vervoer
tags:
  - nederland
  - ns
  - vertrektijden
  - vertrekbord
related:
  - find_ov_stop
  - plan_train_journey
  - get_rail_disruptions
---
# Een actueel treinvertrekbord lezen

`get_train_departures` leest het vertrekbord van één Nederlands treinstation bij de officiële NS Reisinformatie API. Gebruik het voor vragen als “Wanneer vertrekt de volgende trein vanaf Utrecht Centraal?” of “Van welk spoor vertrekt mijn trein?”

## Werkwijze voor agents

Zoek de stationscode eerst op met `find_ov_stop`. Laat `dateTime` weg voor de eerstvolgende vertrekken, of geef een ISO 8601-tijdstip met offset mee om vanaf dat moment te kijken.

```json
{
  "station": "ut",
  "limit": 5
}
```

Per vertrek volgen de bestemming, de geplande en verwachte tijd, het geplande en actuele spoor, de vervoerder, de treinsoort en of de trein is uitgevallen. Meld `cancelled: true` altijd expliciet aan de gebruiker en noem het actuele spoor wanneer dat afwijkt van het geplande. De `messages` zijn letterlijke NS-meldingen; geef ze door in plaats van ze samen te vatten wanneer ze over een gewijzigd spoor of een uitgevallen rit gaan.

## Bron, versheid en fouten

De vertrekken komen van de [NS Reisinformatie API](https://apiportal.ns.nl/). Tijden zijn ISO 8601 met offset. Het antwoord is een momentopname die maximaal een halve minuut is gecached, dus een zeer late wijziging kan nog ontbreken.

Een onbekende stationscode geeft `unknown_station` terug met `retryable: false`. Een onbereikbare of ontbrekend geconfigureerde NS-bron geeft `upstream_unavailable` met `retryable: true`. Te veel opeenvolgende aanvragen vanaf hetzelfde adres geven `rate_limited` met `retryAfterSeconds: 60`.

Koppel direct op `/mcp/ov`, of gebruik het gecombineerde `/mcp` endpoint.

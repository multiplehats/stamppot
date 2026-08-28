---
category: openbaar-vervoer
tags:
  - nederland
  - ns
  - storingen
  - werkzaamheden
related:
  - find_ov_stop
  - plan_train_journey
  - get_train_departures
---
# Actuele storingen op het spoor opvragen

`get_rail_disruptions` haalt storingen, calamiteiten en geplande werkzaamheden op bij de officiële NS Reisinformatie API. Gebruik het voor vragen als “Zijn er storingen op mijn route?” of “Wat is er aan de hand tussen Amsterdam en Utrecht?”

## Werkwijze voor agents

Laat `station` weg voor het landelijke overzicht. Geef een met `find_ov_stop` opgezochte stationscode mee voor de meldingen die NS bij dat station publiceert. Standaard komen alleen meldingen terug die nu spelen; zet `activeOnly` op `false` om ook geplande werkzaamheden te zien.

```json
{
  "station": "ut",
  "types": ["DISRUPTION", "CALAMITY"],
  "activeOnly": true
}
```

Per melding volgen het type, de titel, de begin- en eindtijd, de verwachte duur, de oorzaak, de situatiebeschrijving en de reisadviezen van NS. Die adviezen komen letterlijk uit de bron; geef ze ongewijzigd door. Combineer deze tool met `plan_train_journey` wanneer de gebruiker een concrete reis heeft: een melding vertelt wat er speelt, het reisadvies vertelt of de reis nog rijdt.

## Bron, versheid en fouten

De meldingen komen van de [NS Reisinformatie API](https://apiportal.ns.nl/). Tijden zijn ISO 8601 met offset. Het antwoord is een momentopname die maximaal een minuut is gecached; er worden maximaal twintig meldingen teruggegeven.

Een onbekende stationscode geeft `unknown_station` terug met `retryable: false`. Een onbereikbare of ontbrekend geconfigureerde NS-bron geeft `upstream_unavailable` met `retryable: true`. Te veel opeenvolgende aanvragen vanaf hetzelfde adres geven `rate_limited` met `retryAfterSeconds: 60`. Geen enkele melding is ook een geldig antwoord: `status: "ok"` met een lege array betekent dat er niets speelt.

Koppel direct op `/mcp/ov`, of gebruik het gecombineerde `/mcp` endpoint.

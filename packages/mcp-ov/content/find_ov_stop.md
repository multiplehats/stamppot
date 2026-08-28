---
category: openbaar-vervoer
tags:
  - nederland
  - haltes
  - treinstations
  - stationscodes
related:
  - plan_train_journey
  - get_train_departures
  - get_stop_departures
---
# Nederlandse station- en haltecodes opzoeken

`find_ov_stop` vertaalt een plaats- of haltenaam naar de code die de andere ov-tools nodig hebben. Elke andere tool in deze MCP accepteert uitsluitend codes, nooit namen, dus begin hier. Gebruik het voor vragen als “Wat is de code van Amsterdam Centraal?” of “Welke halte heet Centraal Station in Amsterdam?”

## Werkwijze voor agents

Stuur de naam zoals de gebruiker die zei. Beperk het resultaat optioneel tot één soort halte en kies een limiet.

```json
{
  "query": "amsterdam centraal",
  "kinds": ["train_station"],
  "limit": 5
}
```

Elk resultaat heeft een `kind` en een `usableWith`-lijst. Een `train_station` werkt bij `plan_train_journey`, `get_train_departures` en `get_rail_disruptions`. Een `stop_area` werkt uitsluitend bij `get_stop_departures`. Die twee codereeksen zijn niet uitwisselbaar: een haltecode bij een treintool levert `unknown_station` op, en andersom `unknown_stop`.

Verzin nooit zelf een code. Is de zoekterm dubbelzinnig, zoals “Centraal Station”, leg de kandidaten dan met naam en plaats aan de gebruiker voor in plaats van er één te kiezen.

## Bron, versheid en fouten

De haltelijst is een gepubliceerde momentopname die treinstations uit de [NS Reisinformatie API](https://apiportal.ns.nl/) combineert met halteplaatsen uit [OVapi](http://ovapi.nl/), een onofficiële bron. Het antwoord bevat de momentopnameversie en het observatietijdstip. De lijst bevat geen actuele vertrektijden; die haal je met de vertrektools op.

Een ontbrekende of beschadigde haltelijst geeft `directory_unavailable` terug met `retryable: true`. Een zoekopdracht zonder match geeft `status: "ok"` met een lege array. Deze tool valt niet onder de rate limit op externe bronnen.

Koppel direct op `/mcp/ov`, of gebruik het gecombineerde `/mcp` endpoint.

# `@stamppot/mcp-ov`

Transportneutrale operaties voor Nederlands openbaar vervoer: treinreizen, vertrektijden, storingen en actuele bus-, tram- en metrovertrekken.

De MCP biedt precies vijf tools:

- `find_ov_stop` vertaalt een plaats- of haltenaam naar een code en zegt erbij welke tools die code accepteren. Dit is het startpunt; alle andere tools werken uitsluitend met codes.
- `plan_train_journey` plant een treinreis tussen twee stations, inclusief overstappen, sporen en uitgevallen trajecten.
- `get_train_departures` leest het vertrekbord van één station.
- `get_rail_disruptions` geeft landelijke of stationsgebonden storingen, calamiteiten en werkzaamheden.
- `get_stop_departures` leest de eerstvolgende bus-, tram- en metrovertrekken bij één halteplaats.

Treingegevens komen van de officiële [NS Reisinformatie API](https://apiportal.ns.nl/) achter een serverside sleutel; die sleutel verlaat de Worker nooit en eindgebruikers hebben er geen nodig. Halteplaatsvertrekken komen van [OVapi](http://ovapi.nl/), een **onofficiële** bron zonder gepubliceerde licentie of beschikbaarheidsgarantie. Elk resultaat draagt zijn eigen herkomst, met `official: true` of `official: false`.

Stationscodes en halteplaatscodes zijn twee gescheiden reeksen die niet uitwisselbaar zijn. Daarom geeft `find_ov_stop` bij elk resultaat een `kind` en een `usableWith`-lijst terug. Verzin nooit zelf een code.

Tijden van NS zijn ISO 8601 met offset. OVapi levert lokale kloktijden zónder offset; die komen ongewijzigd terug in de velden op `Local`, met `timezone: "Europe/Amsterdam"`. Er wordt geen zomertijdberekening op de server gedaan.

Alle tools zijn alleen-lezen en slaan niets op. Antwoorden zijn kortstondig gecachte momentopnames en zijn geen reservering, prijsopgave of vervoerbewijs. Onbereikbare bronnen, onbekende codes en een overschreden rate limit komen als expliciete statussen terug, niet als fout.

Gebruik het domein-endpoint op `/mcp/ov`. Zie het [runbook voor zelfhosting](../../docs/runbooks/ov-self-hosting.md) voor het registreren van een NS-sleutel, het aanmaken van de bucket en het publiceren van de haltemomentopname.

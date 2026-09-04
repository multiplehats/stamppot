---
"@stamppot/edge": minor
---

Herschrijf de landingspagina rond wat Stamppot is, wat het kost en hoe je het koppelt.

De homepage begint nu met één regel die de vraag beantwoordt waarmee mensen
zoeken — gratis MCP-servers voor Nederlandse data — gevolgd door één alinea die
op zichzelf te citeren is en meteen de koppelkaart. De MCP-kaarten staan direct
onder de hero in plaats van drie secties lager, dus je ziet binnen één scroll
wat er is en wat de volgende stap is.

De "Waarom"-sectie is vervangen door "Koppelen", die in drie stappen uitlegt hoe
je van URL naar eerste aanroep gaat. De sectie met garanties is van de homepage
verdwenen; wat Stamppot wel en niet vastlegt staat op `/privacy`, en de limieten
en schema's staan op `/developers`, `/openapi.json` en `/v1/tools`. De
open-sourcesectie is ingekort, omdat de losse links naar `/v1/tools` en
`/llms.txt` nu onder de hero staan.

De GitHub-knoppen dragen het GitHub-logo en tonen het aantal sterren van de
repository, dat een uur aan de edge gecachet wordt. Blijft GitHub stil, of staat
de teller op nul, dan valt alleen het getal weg.

`/about` heeft een nieuwe sectie "Wat het kost" en noemt geen vast aantal
servers meer; `/developers` somt de MCP-endpoints niet meer op maar verwijst
naar `GET /v1/mcps`, zodat er niets verouderd wanneer er een MCP bij komt. De
taglines en de "wanneer gebruik je dit"-regels van elke MCP zijn aangescherpt,
en de titel, de omschrijving, de structured data, `/llms.txt` en de
`.well-known`-bestanden vertellen nu hetzelfde verhaal in dezelfde woorden.

Elke MCP-kaart opent nu een breder dialoog waarin elke tool zijn eigen kaartje
heeft, twee naast elkaar, met een ingekorte omschrijving die doorlinkt naar de
toolpagina zelf. Boven de titel — op de kaart én bovenin het dialoog — staan de
merken van de bronnen achter die MCP als overlappende avatars, getekend door
Parsew: de twaalf supermarkten van Checkjebon, NS en OVapi, of Marktplaats.

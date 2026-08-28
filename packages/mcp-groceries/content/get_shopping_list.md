---
category: boodschappenlijsten
tags:
  - boodschappen
  - boodschappenlijst
  - bearer-capability
  - durable-objects
related:
  - save_shopping_list
  - plan_grocery_basket
---
# Een capability-boodschappenlijst ophalen

`get_shopping_list` leest één anonieme opgeslagen boodschappenlijst. Daarvoor is de exacte bearer `listKey` nodig die is teruggegeven bij het aanmaken van de lijst. De sleutel is niet gekoppeld aan een MCP-sessie, gesprek, account, Claude-profiel, Hermes-profiel of OpenClaw-installatie, en kan niet worden teruggehaald zodra hij kwijt is.

```json
{
  "listKey": "lst_0123456789abcdefghijkl"
}
```

Bij succes geeft de tool het complete canonieke document terug, met het opslagtijdstip en het vervalmoment. Lezen verlengt de vervaltermijn van 90 dagen niet. De bewerking raakt alleen het Durable Object van de lijst: de boodschappencatalogus wordt nooit gelezen en opgeslagen regels worden nooit stilzwijgend opnieuw geprijsd.

Als de gebruiker om actuele prijzen vraagt, kies dan de gewenste niet-afgevinkte of complete regels uit het teruggegeven document en geef die door aan `plan_grocery_basket`. Houd opgeslagen status en actuele catalogusberekeningen als aparte stappen.

## Capability en fouten

Behandel `listKey` als een geheime bearer capability. Clients van derden kunnen tool-argumenten en resultaten bewaren volgens hun eigen beleid. Stamppot plaatst hem niet in URL’s, catalogus-R2-objecten, logs, analytics of foutresultaten.

Een syntactisch geldige maar ontbrekende of verlopen capability geeft `unknown_list` terug met `retryable: false` en herhaalt de sleutel niet in het antwoord. Ongeldige capability-syntax wordt geweigerd voordat het Durable Object wordt benaderd.

Koppel direct op `/mcp/groceries`, of gebruik het gecombineerde `/mcp` endpoint.

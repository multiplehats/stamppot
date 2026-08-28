---
category: boodschappenlijsten
tags:
  - boodschappen
  - boodschappenlijst
  - bearer-capability
  - volledig-document
related:
  - get_shopping_list
  - plan_grocery_basket
---
# Een complete capability-boodschappenlijst opslaan

`save_shopping_list` maakt of vervangt één klein anoniem boodschappenlijst-document. Laat `listKey` alleen weg bij het aanmaken. Aanmaken is niet idempotent: als het antwoord verloren gaat, kan opnieuw proberen zonder de teruggegeven sleutel een tweede, onbereikbare lijst aanmaken.

```json
{
  "document": {
    "title": "Weekend",
    "lines": [
      { "query": "milk", "checked": false },
      { "query": "eggs", "target": { "value": 12, "unit": "each" } }
    ]
  }
}
```

Wil je een bestaande lijst wijzigen? Roep dan eerst `get_shopping_list` aan, behoud elke regel die de gebruiker nog wil, bewerk het teruggegeven complete document en stuur dat document opnieuw met de bijbehorende `listKey`. Er zijn geen gedeeltelijke mutaties, permanente regel-ID’s, revisies of samenvoegregels. Gelijktijdige vervangingen werken volgens last-write-wins.

Succesvolle opslagacties geven het complete canonieke document terug en verlengen de vervaltermijn naar 90 dagen. Het document is beperkt tot 20 regels en 16 KiB UTF-8 JSON. Opgeslagen producten zijn geen offertes; gebruik `plan_grocery_basket` apart wanneer de gebruiker actuele Checkjebon-prijzen wil.

## Capability en fouten

Bewaar de teruggegeven bearer-sleutel ergens buiten de tijdelijke gesprekscontext. Hij is niet herstelbaar en is geen account-identiteit. Stamppot plaatst hem nooit in een URL, R2, logs, analytics of een foutresultaat, al kunnen clients van derden tool-argumenten en resultaten bewaren volgens hun eigen beleid.

Een onbekende of verlopen opgegeven sleutel geeft `unknown_list` terug. De rem tegen misbruik van het opslaan werkt bij benadering en kan `rate_limited` teruggeven met een retry-hint van 60 seconden; dit is geen autorisatie of boekhouding en kan gebruikers achter een proxy als één groep behandelen.

Koppel direct op `/mcp/groceries`, of gebruik het gecombineerde `/mcp` endpoint.

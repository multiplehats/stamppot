# `@stamppot/mcp-groceries`

Transportneutrale operaties voor het ophalen van actuele Nederlandse boodschappen en optionele anonieme boodschappenlijsten.

De MCP biedt precies vier tools:

- `find_grocery_options` doorzoekt echte verpakkingen en onderscheidt de kassaprijs van de vergelijkbare waarde per eenheid.
- `plan_grocery_basket` rondt doelen af op verpakkingen, vergelijkt begrensde combinaties van winkels, meldt niet-gematchte regels en geeft een ongepinde `replayInput` terug voor vervolgvragen met actuele prijzen.
- `get_shopping_list` haalt één begrensd opgeslagen document op met de bijbehorende bearer `listKey`.
- `save_shopping_list` maakt of vervangt het complete document met last-write-wins-semantiek.

Catalogusgegevens komen van [Checkjebon](https://github.com/supermarkt/checkjebon) onder de MIT-licentie. Prijzen zijn indicatieve momentopnames, kunnen per locatie of afrekenmoment verschillen en zeggen niets over voorraad.

Opgeslagen lijsten staan los van offertes en catalogusgegevens. Een willekeurige 128-bit `listKey` geeft toegang tot precies één lijst, is niet gekoppeld aan een account of MCP-sessie en kan niet worden hersteld als hij kwijtraakt. Lees eerst voordat je een bestaand document vervangt, en behoud elke regel die de gebruiker nog wil.

Gebruik het domein-endpoint op `/mcp/groceries`. Zie het [runbook voor zelfhosting](../../docs/runbooks/groceries-self-hosting.md) voor het lokaal synchroniseren van de catalogus en het opzetten van Cloudflare-resources.

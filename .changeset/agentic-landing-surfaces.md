---
"@stamppot/edge": minor
---

Herbouw de landingspagina rond de MCP's en geef agents echte ingangen.

De MCP-sectie is nu een raster van gekleurde kaarten, één per geregistreerde
MCP. Een kaart opent een dialoog met de volledige omschrijving en de tools van
die MCP; elke tool daarin linkt naar zijn eigen, indexeerbare toolpagina. De
accentkleuren komen uit een statische map op `mcp.id`, dus een nieuwe MCP voegt
zichzelf toe aan de pagina, de sitemap, `llms.txt` en de structured data.

Nieuw voor agents en crawlers: `/llms.txt` en `/llms-full.txt`, een
`/developers`-pagina, prozapagina's op `/about`, `/contact` en `/privacy`, een
404 die vertelt waar je wel moet zijn, en een Markdown-tweeling van elke pagina
via `Accept: text/markdown` of een `.md`-achtervoegsel, met frontmatter en een
`Link`-header.

Machineleesbaar: `/openapi.json` (gegenereerd uit dezelfde definities als de
tools, inclusief het foutmodel), `/pricing.md`, `/.well-known/ard.json`,
`/.well-known/agent-card.json`, `/.well-known/api-catalog` en een
`server-card.json` per MCP.

Verder: volledige head-metadata met een JSON-LD-graaf op de homepage,
`Vary: Accept` op elke onderhandelde representatie, `lastmod` in de sitemap,
een `Sitemap:`-regel in robots.txt, en HEAD wordt afgehandeld als GET in plaats
van als 404.

Twee claims op de pagina klopten niet en zijn gecorrigeerd: niet elke operatie
is read-only (`save_shopping_list` schrijft, achter een capability-token), en er
gelden wel degelijk rate limits op de bronnen die dat nodig hebben.

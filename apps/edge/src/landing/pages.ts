import { REPO_URL } from "./urls";

/**
 * The pages that are prose rather than registry output: what Stamppot is, how
 * to reach the people behind it, and what it does with data.
 *
 * They live here as data, not as JSX, because three surfaces render the same
 * words: the HTML page, the `text/markdown` representation an agent negotiates
 * for, and the sitemap. Writing them once keeps those three from drifting.
 */
export interface PageSection {
  readonly body: readonly string[];
  readonly heading: string;
}

export interface StaticPage {
  readonly description: string;
  readonly intro: string;
  readonly navLabel: string;
  readonly path: string;
  readonly sections: readonly PageSection[];
  readonly title: string;
}

export const STATIC_PAGES: readonly StaticPage[] = [
  {
    description:
      "Elk adres dat je nodig hebt om Stamppot aan te roepen: MCP-endpoints, de HTTP API, de OpenAPI-spec en de bestanden die agents lezen. Gratis, zonder registratie.",
    intro:
      "Geen sleutel, geen aanmelding, geen sandbox nodig. De productie-endpoints zijn openbaar en alleen-lezen, dus je eerste aanroep kan meteen.",
    navLabel: "Developers",
    path: "/developers",
    sections: [
      {
        body: [
          "Er is geen registratie en geen API-sleutel. Plak het endpoint in je client en begin — dat is de hele onboarding. Omdat elke leesoperatie authless is, is er ook geen aparte testomgeving: de productie-endpoints zijn de sandbox, en je kunt er niets mee stukmaken.",
          "De enige uitzondering is het bewaren van een boodschappenlijst. Dat schrijft wel iets, en gaat achter een capability-token dat je zelf krijgt en zelf beheert.",
        ],
        heading: "Beginnen",
      },
      {
        body: [
          "MCP over streamable HTTP. Gebruik /mcp voor alle servers tegelijk, of /mcp/<id> voor er één. Welke id's er zijn staat in GET /v1/mcps en op de homepage. Er is geen authenticatie, dus je stuurt meteen initialize.",
          "Geen MCP-client? Dezelfde operaties staan op gewone HTTP. GET /v1/mcps geeft de servers, GET /v1/tools geeft elke tool met zijn JSON Schema, en POST /v1/tools/<naam> roept er één aan met de argumenten als JSON body.",
        ],
        heading: "Endpoints",
      },
      {
        body: [
          "De OpenAPI 3.1-spec staat op /openapi.json en wordt uit dezelfde definitie gegenereerd als de tools zelf, dus hij kan niet verouderen. Daarin staan per operatie het invoer- en uitvoerschema en het foutmodel.",
          "Elke mislukte aanroep geeft dezelfde envelope terug: een error met een machineleesbare code (invalid_input, not_found, rate_limited of upstream_unavailable) en een korte melding. Vertak op de code, niet op de tekst.",
        ],
        heading: "Schema's en fouten",
      },
      {
        body: [
          "Voor agents: /llms.txt beschrijft wanneer je Stamppot gebruikt en hoe je hem aanroept, /llms-full.txt zet daar de volledige tooldocumentatie onder. Elke pagina geeft ook Markdown terug via Accept: text/markdown of door .md achter de URL te zetten.",
          "Machineleesbare beschrijvingen van deze site: /.well-known/ard.json, /.well-known/agent-card.json, /.well-known/mcp/server-card.json en /.well-known/api-catalog. Prijzen staan in /pricing.md — Stamppot is gratis.",
        ],
        heading: "Bestanden voor agents",
      },
      {
        body: [
          "Op de bronnen die het nodig hebben geldt een gedeelde rate limit van 30 aanroepen per minuut, zodat de bron het aankan. Er is geen limiet per gebruiker, want er zijn geen gebruikers.",
          "Er is geen SLA en geen statuspagina. Bouw er niets kritieks op zonder eigen fallback, en draai desnoods je eigen versie: de code staat onder Apache-2.0.",
        ],
        heading: "Limieten",
      },
    ],
    title: "Developers",
  },
  {
    description:
      "Wat Stamppot is, wie het bouwt en waarom het gratis en zonder account draait.",
    intro:
      "Stamppot is een verzameling kleine, gratis MCP-servers voor Nederlandse data: supermarktprijzen, tweedehands advertenties en openbaar vervoer. Eén endpoint, geen account, open source onder Apache-2.0.",
    navLabel: "Over",
    path: "/about",
    sections: [
      {
        body: [
          "Stamppot bundelt Nederlandse open data achter het Model Context Protocol, zodat een agent er direct bij kan zonder dat je eerst zelf een koppeling bouwt. Er zijn servers voor supermarktprijzen, voor tweedehands advertenties op Marktplaats en voor openbaar vervoer. Je koppelt ze los aan, of allemaal tegelijk via één endpoint; de homepage toont welke er vandaag in zitten.",
          "Het idee is smal gehouden. Stamppot verzint geen data en zet er geen model tussen: elke tool haalt op wat de bron zegt, normaliseert het naar een vast schema en geeft het terug. Wat er niet in zit, staat er ook niet in — er is geen verrijking, geen scoring en geen gok.",
        ],
        heading: "Wat het is",
      },
      {
        body: [
          "Alles draait op één Cloudflare Worker, geschreven in TypeScript. Elke operatie is één keer gedefinieerd en wordt via twee kanalen aangeboden: MCP voor agents die het protocol spreken, en gewone HTTP voor alles wat dat niet doet. Dezelfde definitie voedt allebei, dus de schema's kunnen niet uit elkaar lopen.",
          "De code staat volledig in de open onder Apache-2.0. Elke operatie, elk schema en elke tooldocumentatie staat in de repository — je kunt het lezen, forken en zelf draaien.",
        ],
        heading: "Hoe het gebouwd is",
      },
      {
        body: [
          "Boodschappenprijzen komen van Checkjebon. Treinreizen, vertrektijden en storingen komen van de officiële NS Reisinformatie API. Bus, tram en metro komen van OVapi. Plaatsen en straalzoekopdrachten lopen via de open PDOK Locatieserver. Marktplaats heeft geen publieke API en is daarom een onofficiële bron: de aantallen zijn klein gehouden en er geldt een rate limit, zodat het binnen persoonlijk gebruik blijft.",
          "Elk antwoord is een momentopname uit een kortstondige cache. Prijzen zijn indicatief, voorraad is niet gegarandeerd en een reisadvies is geen reservering of vervoerbewijs.",
        ],
        heading: "Waar de data vandaan komt",
      },
      {
        body: [
          "Stamppot is gratis. Er is één plan, dat kost niets, en er is geen betaalde variant die je later nodig hebt: geen account, geen API-sleutel, geen limiet per gebruiker. Op de bronnen die het nodig hebben geldt een gedeelde rate limit, zodat de bron het aankan.",
          "Wat het kost staat ook machineleesbaar op /pricing.md, zodat een agent het kan nakijken zonder deze pagina te lezen.",
        ],
        heading: "Wat het kost",
      },
      {
        body: [
          "Stamppot is een persoonlijk open-sourceproject uit Nederland, gemaakt door Chris Jayden en open voor bijdragen. Er is geen bedrijf achter, geen betaald plan en geen SLA. Gebruik het waarvoor het goed is en bouw er niets kritieks op zonder eigen fallback.",
        ],
        heading: "Wie het maakt",
      },
    ],
    title: "Over Stamppot",
  },
  {
    description:
      "Waar je terechtkunt met een bug, een beveiligingsmelding, een nieuwe MCP of een vraag over de data.",
    intro:
      "Alles loopt via de publieke repository, zodat vraag en antwoord voor iedereen te lezen blijven.",
    navLabel: "Contact",
    path: "/contact",
    sections: [
      {
        body: [
          `Bugs, vragen en verzoeken gaan naar de issue tracker op GitHub: ${REPO_URL}/issues. Beschrijf welke tool je aanriep, wat je terugkreeg en wat je verwachtte. Een issue is publiek, dus plak er geen tokens of persoonsgegevens in.`,
          "Er is geen supportinbox en geen telefoonnummer. Dat is een keuze, niet een omissie: het project is klein en publiek, en een antwoord in de tracker helpt de volgende met dezelfde vraag.",
        ],
        heading: "Een bug of een vraag",
      },
      {
        body: [
          `Meld een kwetsbaarheid niet in een openbaar issue. SECURITY.md beschrijft hoe je het wel doet, inclusief de termijn waarop je een reactie kunt verwachten: ${REPO_URL}/blob/main/SECURITY.md.`,
        ],
        heading: "Een beveiligingsprobleem",
      },
      {
        body: [
          `Een nieuwe Nederlandse databron is welkom. Het package-contract is klein en staat beschreven in CONTRIBUTING.md: ${REPO_URL}/blob/main/CONTRIBUTING.md. Open bij voorkeur eerst een issue met de bron die je in gedachten hebt, dan kijken we samen of de licentie en de gebruiksvoorwaarden het toelaten voordat je code schrijft.`,
        ],
        heading: "Een MCP toevoegen",
      },
      {
        body: [
          "Ben je de beheerder van een bron die Stamppot leest en wil je dat we iets aanpassen of stoppen? Open een issue of neem contact op via de repository. We passen het aan.",
        ],
        heading: "Databronnen",
      },
    ],
    title: "Contact",
  },
  {
    description:
      "Wat Stamppot wel en niet vastlegt: geen account, geen tool-argumenten, alleen geaggregeerde cijfers.",
    intro:
      "Stamppot heeft geen accounts en bewaart de inhoud van je vragen niet. Wat er wel gemeten wordt, staat hieronder.",
    navLabel: "Privacy",
    path: "/privacy",
    sections: [
      {
        body: [
          "Je hebt geen account nodig en er is er ook geen. Stamppot vraagt niet om een e-mailadres, een naam of een betaalmiddel, en er is dus geen profiel waaraan gebruik gekoppeld kan worden.",
        ],
        heading: "Geen account",
      },
      {
        body: [
          "De argumenten waarmee je een tool aanroept worden niet vastgelegd. Wat je zoekt, welke halte je opvraagt of wat er in je mandje zit, verlaat het verzoek niet: het gaat naar de bron, het antwoord komt terug en daarna is het weg. Het beveiligingsbeleid van het project verbiedt tool-argumenten in analytics expliciet.",
          "Wat wel geteld wordt is geaggregeerd gebruik: welke tool is aangeroepen, via welk transport, of hij slaagde of faalde, hoe lang hij duurde en welke client zich meldde. Die client-naam is zelfgerapporteerd door je agent en wordt niet geverifieerd. Deze cijfers gaan naar OpenPanel en dienen één doel: zien welke tools gebruikt worden en welke stuk zijn.",
        ],
        heading: "Wat er niet en wel gemeten wordt",
      },
      {
        body: [
          "De website meet paginaweergaves via dezelfde OpenPanel-opzet, zonder cookies voor advertentiedoeleinden en zonder profielen over sessies heen. Er staan geen trackers van derden op de pagina's.",
        ],
        heading: "De website",
      },
      {
        body: [
          "Een tool haalt data op bij de bron: Checkjebon, de NS Reisinformatie API, OVapi, de PDOK Locatieserver of Marktplaats. Die partijen zien het verkeer van Stamppot, niet dat van jou: je IP-adres en je client worden niet doorgegeven. Wat zij zelf vastleggen valt onder hun eigen beleid.",
          "De servers draaien op Cloudflare, met opslag in de EU-jurisdictie. Cloudflare verwerkt daarbij netwerkgegevens zoals IP-adressen om het verkeer af te handelen.",
        ],
        heading: "Bronnen en hosting",
      },
      {
        body: [
          "Boodschappenlijstjes zijn de enige gegevens die Stamppot bewaart. Ze zitten achter een capability-token dat jij krijgt en wij niet kunnen raden, en er hangt geen identiteit aan. Raak je het token kwijt, dan is de lijst weg — er is geen herstelprocedure, want er is niemand om je aan te herkennen.",
        ],
        heading: "Boodschappenlijstjes",
      },
      {
        body: [
          `Klopt hier iets niet, of wil je dat we iets aanpassen? Open een issue op ${REPO_URL}/issues. De code die dit beschrijft staat in dezelfde repository, dus je kunt het ook gewoon zelf nakijken.`,
        ],
        heading: "Vragen",
      },
    ],
    title: "Privacy",
  },
];

const PAGES_BY_PATH: ReadonlyMap<string, StaticPage> = new Map(
  STATIC_PAGES.map((page) => [page.path, page])
);

export function staticPageFor(pathname: string): StaticPage | undefined {
  return PAGES_BY_PATH.get(pathname);
}

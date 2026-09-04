/**
 * The hand-written half of an MCP's presentation, keyed by `mcp.id`.
 *
 * The registry description is written for the agent reading the protocol: it
 * carries the caveats, the rate limits and the replay rules, and runs several
 * sentences long. That is the right text for `tools/list` and the wrong text
 * for a card or for a "when to use this" line, so both are written here.
 *
 * Tailwind cannot see an interpolated class name, so the accent is a whole
 * static class string rather than a colour name spliced into `bg-${…}`. The
 * colours are HeroUI's own semantic tokens — there is no Stamppot palette.
 *
 * An unregistered id falls back to `DEFAULT_PRESENTATION`, which keeps the
 * invariant that a new MCP adds itself to the page without editing this file.
 * Filling in an entry is a copy improvement, not a prerequisite.
 */
export interface McpSource {
  /** Registrable domain, used only to look the brand mark up through Parsew. */
  readonly domain: string;
  readonly label: string;
}

export interface McpPresentation {
  /** The card's coloured panel. A complete class string, never interpolated. */
  readonly accent: string;
  /**
   * The upstreams the data actually comes from, drawn as overlapping brand
   * marks above the title. Written by hand rather than read from the upstream:
   * the grocery catalog lists its retailers, but the OV and Marktplaats
   * packages have no equivalent, and the page must render before any of them
   * answers. The order is the drawing order, and only the first few show, so
   * the most recognisable name goes first.
   */
  readonly sources: readonly McpSource[];
  /** Sits under the title on the card. One line, concrete, no caveats. */
  readonly tagline: string;
  /** `llms.txt`: the job an agent should reach for this MCP to do. */
  readonly useWhen: string;
}

const DEFAULT_PRESENTATION: McpPresentation = {
  accent: "bg-default text-foreground",
  sources: [],
  tagline: "Nederlandse open data, meteen aanroepbaar.",
  useWhen: "Nederlandse open data ophalen zonder eigen koppeling te bouwen.",
};

const PRESENTATIONS: Readonly<Record<string, McpPresentation>> = {
  groceries: {
    accent: "bg-success-soft text-success-soft-foreground",
    // Every retailer Checkjebon carries, in its order of household name.
    sources: [
      { domain: "ah.nl", label: "Albert Heijn" },
      { domain: "jumbo.com", label: "Jumbo" },
      { domain: "lidl.nl", label: "Lidl" },
      { domain: "aldi.nl", label: "ALDI" },
      { domain: "plus.nl", label: "PLUS" },
      { domain: "dirk.nl", label: "Dirk" },
      { domain: "dekamarkt.nl", label: "DekaMarkt" },
      { domain: "hoogvliet.com", label: "Hoogvliet" },
      { domain: "spar.nl", label: "SPAR" },
      { domain: "ekoplaza.nl", label: "Ekoplaza" },
      { domain: "vomar.nl", label: "Vomar" },
      { domain: "poiesz-supermarkten.nl", label: "Poiesz" },
    ],
    tagline:
      "Vergelijk supermarktprijzen, reken een mandje door, bewaar een lijst.",
    useWhen:
      "De gebruiker vraagt naar Nederlandse supermarktprijzen, wil weten wat een boodschappenmandje kost of bij welke winkels het het goedkoopst uitvalt, of wil een boodschappenlijst samenstellen, bewaren en teruglezen.",
  },
  marktplaats: {
    accent: "bg-warning-soft text-warning-soft-foreground",
    sources: [{ domain: "marktplaats.nl", label: "Marktplaats" }],
    tagline: "Zoek tweedehands advertenties en lees er één volledig uit.",
    useWhen:
      "De gebruiker zoekt iets tweedehands in Nederland, wil weten wat een gebruikt artikel op Marktplaats kost, of wil de details van één advertentie zien. Onofficiële bron: kleine aantallen, met een rate limit, bedoeld voor persoonlijk gebruik.",
  },
  ov: {
    accent: "bg-accent-soft text-accent-soft-foreground",
    sources: [
      { domain: "ns.nl", label: "NS" },
      { domain: "ovapi.nl", label: "OVapi" },
    ],
    tagline: "Plan een treinreis, lees een vertrekbord, volg storingen.",
    useWhen:
      "De gebruiker vraagt naar Nederlands openbaar vervoer: hoe laat de trein gaat, of er storingen op het spoor zijn, of wanneer de volgende bus, tram of metro vertrekt. Begin met find_ov_stop om een plaats- of haltenaam naar een code te vertalen.",
  },
};

export function presentationFor(mcpId: string): McpPresentation {
  return PRESENTATIONS[mcpId] ?? DEFAULT_PRESENTATION;
}

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
export interface McpPresentation {
  /** The card's coloured panel. A complete class string, never interpolated. */
  readonly accent: string;
  /** Sits under the title on the card. One line, concrete, no caveats. */
  readonly tagline: string;
  /** `llms.txt`: the job an agent should reach for this MCP to do. */
  readonly useWhen: string;
}

const DEFAULT_PRESENTATION: McpPresentation = {
  accent: "bg-default text-foreground",
  tagline: "Nederlandse open data, meteen aanroepbaar.",
  useWhen: "Nederlandse open data ophalen zonder eigen koppeling te bouwen.",
};

const PRESENTATIONS: Readonly<Record<string, McpPresentation>> = {
  groceries: {
    accent: "bg-success-soft text-success-soft-foreground",
    tagline: "Zoek producten, reken een mandje door, bewaar een lijstje.",
    useWhen:
      "De gebruiker vraagt naar Nederlandse supermarktprijzen, wil weten wat een boodschappenmandje kost, of wil een boodschappenlijstje samenstellen of teruglezen.",
  },
  marktplaats: {
    accent: "bg-warning-soft text-warning-soft-foreground",
    tagline: "Zoek tweedehands advertenties en lees er één volledig uit.",
    useWhen:
      "De gebruiker zoekt iets tweedehands in Nederland, wil weten wat een gebruikt artikel op Marktplaats kost, of wil de details van één advertentie zien. Persoonlijk gebruik, met een rate limit.",
  },
  ov: {
    accent: "bg-accent-soft text-accent-soft-foreground",
    tagline: "Plan een treinreis, lees een vertrekbord, volg storingen.",
    useWhen:
      "De gebruiker vraagt naar Nederlands openbaar vervoer: hoe laat de trein gaat, of er storingen zijn, of wanneer de volgende bus, tram of metro vertrekt. Begin met find_ov_stop om een naam naar een code te vertalen.",
  },
};

export function presentationFor(mcpId: string): McpPresentation {
  return PRESENTATIONS[mcpId] ?? DEFAULT_PRESENTATION;
}

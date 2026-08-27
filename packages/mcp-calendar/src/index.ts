import { defineMcp, defineOperation } from "@stamppot/core";
import { z } from "zod";

const TIME_ZONE = "Europe/Amsterdam" as const;

function part(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  return parts.find((candidate) => candidate.type === type)?.value ?? "";
}

export const getDutchTime = defineOperation({
  description:
    "Get the current date and time in the Netherlands, or convert an ISO 8601 instant to Dutch local time.",
  execute(context, input) {
    const instant =
      input.instant === undefined ? context.now() : new Date(input.instant);
    const dateParts = new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      timeZone: TIME_ZONE,
      weekday: "long",
      year: "numeric",
    }).formatToParts(instant);
    const timeParts = new Intl.DateTimeFormat("nl-NL", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      second: "2-digit",
      timeZone: TIME_ZONE,
      timeZoneName: "longOffset",
    }).formatToParts(instant);

    return {
      isoInstant: instant.toISOString(),
      localDate: `${part(dateParts, "year")}-${part(dateParts, "month")}-${part(dateParts, "day")}`,
      localTime: `${part(timeParts, "hour")}:${part(timeParts, "minute")}:${part(timeParts, "second")}`,
      timezone: TIME_ZONE,
      utcOffset: part(timeParts, "timeZoneName").replace("GMT", "UTC"),
      weekday: part(dateParts, "weekday"),
    };
  },
  input: z.object({
    instant: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe(
        "ISO 8601 instant with a UTC offset. Omit it to use the current time."
      ),
  }),
  name: "get_dutch_time",
  output: z.object({
    isoInstant: z.string(),
    localDate: z.string(),
    localTime: z.string(),
    timezone: z.literal(TIME_ZONE),
    utcOffset: z.string(),
    weekday: z.string(),
  }),
  title: "Dutch local time",
});

export const calendarMcp = defineMcp({
  description: "Dates, times and calendar conventions for the Netherlands.",
  id: "calendar",
  operations: [getDutchTime],
  title: "Dutch calendar",
});

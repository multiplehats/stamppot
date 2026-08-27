import { getDutchTime } from "@stamppot/mcp-calendar";
import { describe, expect, it } from "vitest";

const request = new Request("https://stamppot.test/mcp/calendar");

describe("get_dutch_time", () => {
  it("uses Central European Summer Time in August", async () => {
    const result = await getDutchTime.invoke(
      {
        now: () => new Date("2026-08-27T10:15:30Z"),
        request,
        signal: request.signal,
      },
      {}
    );

    expect(result).toMatchObject({
      localDate: "2026-08-27",
      localTime: "12:15:30",
      timezone: "Europe/Amsterdam",
      utcOffset: "UTC+02:00",
      weekday: "donderdag",
    });
  });

  it("converts an explicitly supplied winter instant", async () => {
    const result = await getDutchTime.invoke(
      {
        now: () => new Date("2000-01-01T00:00:00Z"),
        request,
        signal: request.signal,
      },
      { instant: "2026-12-24T23:30:00Z" }
    );

    expect(result).toMatchObject({
      localDate: "2026-12-25",
      localTime: "00:30:00",
      utcOffset: "UTC+01:00",
      weekday: "vrijdag",
    });
  });
});

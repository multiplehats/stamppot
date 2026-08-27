---
category: date-and-time
tags:
  - netherlands
  - dutch-time
  - timezone
  - daylight-saving-time
  - iso-8601
related: []
---
# Dutch local time and date

`get_dutch_time` returns the current date and time in the Netherlands, or converts a supplied ISO 8601 instant to Dutch local time. It uses the official `Europe/Amsterdam` timezone, including the correct daylight-saving offset for the requested date.

## When to use this tool

Use the tool when an agent needs a reliable Dutch-local timestamp rather than guessing the offset from UTC. It is useful for scheduling, deadlines, opening hours, travel plans, calendar summaries, and messages that should name the correct Dutch weekday.

The Netherlands alternates between Central European Time and Central European Summer Time. A fixed `UTC+01:00` or `UTC+02:00` conversion will therefore be wrong for part of the year. This tool resolves the timezone rules for the actual instant.

## Input

The optional `instant` field accepts an ISO 8601 timestamp with a UTC offset, such as `2026-12-24T23:30:00Z`. When the field is omitted, the tool uses the current instant.

```json
{
  "instant": "2026-12-24T23:30:00Z"
}
```

## Structured result

The result separates the source instant from its Dutch-local representation. It includes the original ISO instant, local date, local time, IANA timezone, effective UTC offset, and weekday.

```json
{
  "isoInstant": "2026-12-24T23:30:00.000Z",
  "localDate": "2026-12-25",
  "localTime": "00:30:00",
  "timezone": "Europe/Amsterdam",
  "utcOffset": "UTC+01:00",
  "weekday": "vrijdag"
}
```

## Behavior and guarantees

- Dates and times use stable, machine-readable formats.
- The weekday is returned in Dutch.
- Daylight-saving transitions are resolved by the runtime's IANA timezone data.
- Invalid or offset-free timestamps are rejected by the input schema.
- The tool is read-only, requires no account, and stores no request data.

Connect to the combined Stamppot endpoint at `/mcp`, or use `/mcp/calendar` when only Dutch date and time tools are needed.

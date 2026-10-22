---
"@stamppot/edge": patch
---

MCP usage is now measured in the site's OpenPanel project, and only tool calls are reported. Handshakes and `tools/list` calls are no longer tracked: registries and scanners poll them around the clock, which buried the real usage under hundreds of thousands of events a week.

# Initial iOS status absence: observations, not a verified fix

On source `94afc02bc0ab6bf82b837fc828a8c3b8ec8edae7`, QA run
`38103791046`, Native job `114365086721`, XCTest failed its first
`native-parity-state` existence assertion with the unchanged 35 second
deadline. The artifact contains five captures (home through notes), no
recorded journey errors, and a 1 by 1 StaticText at the expected label
location without an identifier or value. Typing, saved acknowledgement,
relaunch, and the accessibility size category were not accepted.

Artifact `11688668949`: 68,446,573 bytes, SHA-256
`9f6b3221489e13008f5adf1996ca7625c58111a49a6a3ade999c57882d519e4c`.
The preceding source's artifact shows the same label successfully exposed
before its separate relaunch failure. Neither artifact explains whether
the new failure occurred in the live-state callback/readiness/serialization
path or after UIKit assigned the accessibility properties.

This change records native appearance, timer requests, callback type and
error, decoded phase/readiness, serialization errors, label publication
properties and capture/ACK progress in per-process JSON-lines logs. Logs
are independent of capture acceptance and preserved in both size modes
and failure artifacts. A failed first assertion also attaches the actual
system screenshot and accessibility hierarchy; an app-wide identifier
query is diagnostic only and never supplies an alternative pass condition.

No readiness, timeout, timer mode, label geometry, application code,
typing, persistence or validator threshold changes are made. This is an
observability change, not a claim that the cause is fixed. The next real
SDK run must provide the missing evidence. A passing changed run alone
does not establish a cause or close the recorded failure. Windows cannot
execute UIKit/XCTest; simulator proof and physical iPhone proof remain
separate.

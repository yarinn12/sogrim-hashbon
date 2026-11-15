# QA532: late first status publication and queued WebKit reads

The original iOS Native job 132682703531 in run 43670572054, attempt 1,
tested `65f3c04bef2dd607e7abb07ca26b6d773bc8bc59`. It failed the initial
35-second status-label wait. No native keyboard input or save was verified.
The original artifact 14145201033 was retained and verified by size, SHA-256
and ZIP CRC. Its first partial download timed out; the missing byte range was
downloaded separately and only the complete, matching ZIP was extracted.

The native status journal shows up to 16 outstanding refresh requests. Timer
ticks submitted another `evaluateJavaScript` while earlier callbacks remained
pending. The first home capture was written within the original wait, but the
first native label publication arrived about 1.5 seconds after its deadline.
The later hierarchy contains the expected StaticText identifier. This is a late
publication, not evidence of a permanently missing element or wrong role. The
fixture retains the relevant timestamps; it does not establish why WebKit or
callback delivery was slow, or prove that the queue alone caused the timeout.

The diagnostic bridge now permits one pending status evaluation. Repeated timer
ticks coalesce; a capture during that evaluation retains exactly one immediate
fresh read after its callback. Every callback exit releases the slot using
`defer`, including malformed, unready, error and unchanged results. An absent
WebView cannot acquire a slot. The 0.4-second timer, capture acknowledgement,
readiness condition, input, screenshot requirements and all budgets remain.

Five local source-backed scheduling controls fail on OLD and pass on FINAL,
with 31 nearby controls passing. They are not Swift execution on Windows.
Four real policy XCTest controls are included in the generated Native target.
Full original Native normal/OS-large-text journeys and all four CI lanes on the
final exact source remain required. A passing scheduling model alone does not
prove timely SDK startup, repair the original screenshot timeout, or permit
signing or delivery.

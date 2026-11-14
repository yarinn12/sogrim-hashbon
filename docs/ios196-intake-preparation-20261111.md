# iOS196 original artifact intake

Application 4.59 remains frozen at 6d7b90a1a15e4e6c2a5af3cf17558d993322f45e. Producer b12ac3ff4dc030a8c27d1e3037d785045e5ec6ed completed original run 43621803389 and job 132528922930. Artifact 14124457546 contains the encrypted original IPA and envelope, retained for one day. ZIP size, digest, CRC and public envelope identity were verified locally; actual IPA decryption and signature/source checks remain mandatory in the intake run.

All immutable bindings now refer to those original bytes. Intake performs no rebuild. Existing first-creation, all four source CI runs and all 68 required jobs, original-source checks, decryption/signature verification, and zero automatic distribution gates remain mandatory. Only the existing 4.59(196) TestFlight upload is in scope. App Store/public rollout and new keys/costs are excluded. Owner-group assignment remains a separate verified operation.

Historical iOS194/195 fixtures are unchanged. The current explicitly synthetic intake fixture changes only reviewed producer identity and one-day retention labels, with all affected hashes recalculated. It remains separate from real artifact bindings. Prior 403 failure and the retention-related cancellation remain preserved.

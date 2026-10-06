# Native iOS Google authentication nonce

GoogleSignIn 9 passes an explicitly supplied nonce to AppAuth. If it is omitted,
AppAuth generates its own random nonce. Google includes that value in the ID
token. Supabase's ID-token exchange requires a corresponding raw nonce and
compares its SHA-256 hexadecimal digest with the token's nonce. The application
previously sent no nonce to either boundary, so the generated SDK nonce could
not satisfy that contract when nonce verification is enabled.

Each native iOS attempt now creates a fresh random value, supplies its SHA-256
hex digest to the SDK and sends the original value with the ID-token exchange.
The pair stays in the attempt's closure. `forcePrompt: true` preserves a fresh
request rather than restoring a token issued for a different nonce. Android
retains its existing options. Signature, audience and server nonce verification
remain enabled; no rejected credential is accepted.

Following the user's real iPad/iPhone failure report and preference, HTTP 400
no longer starts a second authorization in an external browser. The existing
click handler displays the original error and permits another native attempt.
Apple's bound PKCE callback, spent-code cleanup and email recovery retain their
separate tests. The previous Google recovery expectations were replaced with
native retry and rejection/persistence checks because that feature was removed.

`tests/nativeGoogleNonce.test.mjs` exercises the production nonce generator,
native sign-in function and actual ID-token HTTP request serializer. Its
synthetic provider echoes the AppAuth nonce contract and its synthetic server
enforces Supabase's nonce rule. Before the fix, the acceptance and rejection
regressions both fail; Android and cancellation checks pass. All four pass with
the fix. The normal browser roundtrip fixture now also enforces the nonce rule
before returning a synthetic session and checks final account writes/relaunch.

These tests do not validate a real Google signature, authorize a Google account
or prove the user's specific production HTTP 400 was a nonce error. The physical
devices still require acceptance against the new signed build. The earlier
automatic external recovery failed on both devices; TestFlight 188 is not an
accepted App Store release. Do not disable nonce checking to work around this.

Primary contracts:

- [GoogleSignIn 9 request construction](https://github.com/google/GoogleSignIn-iOS/blob/9.0.0/GoogleSignIn/Sources/GIDSignIn.m#L666)
- [AppAuth default nonce generation](https://github.com/openid/AppAuth-iOS/blob/1.7.6/Sources/AppAuthCore/OIDAuthorizationRequest.m#L147)
- [Supabase Google nonce guidance](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase nonce validation](https://github.com/supabase/auth/blob/master/internal/api/token_oidc.go)

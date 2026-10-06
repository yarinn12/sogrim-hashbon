# Apple callback replay and account branding

On TestFlight 4.55 (189), the user confirmed successful Google login but reported
Apple failing after Face ID with the generic incomplete-login message. A read-only
production diagnostic at 19:10 UTC on 2026-10-06 found an Apple PKCE flow created
at 19:05:07 UTC, a code issued at 19:05:24 UTC and provider tokens present, with
that flow still awaiting exchange. No real user's code or token was read or used.
This places the observed failure after Apple's authorization; it does not prove
the only production rejection cause.

The pinned Capacitor iOS App plugin returns
`ApplicationDelegateProxy.shared.lastURL` from `getLaunchUrl()` without consuming
it. The proxy retains the universal link across WebView reloads. The native bridge
used to handle `appUrlOpen`, reload to exchange the bound code, then handle that
same URL again during the new bridge's startup. Its in-memory 1.5-second guard was
reset by the reload. The previous browser fixture always returned null from
`getLaunchUrl()` and concealed this second delivery.

Sources: [Capacitor App API](https://capacitorjs.com/docs/apis/app#getlaunchurl),
[AppPlugin implementation](https://github.com/ionic-team/capacitor-plugins/blob/main/app/ios/Sources/AppPlugin/AppPlugin.swift).
The exact pinned copies in node_modules/@capacitor/app/ios and
node_modules/@capacitor/ios/Capacitor/Capacitor were also inspected.

The bridge now claims each callback before closing its browser and reloading.
A bounded session-storage list retains only opaque flow IDs, or SHA-256 URL
digests for legacy/unbound callbacks, never authorization codes or recovery
tokens. The original account-auth checks still enforce PKCE/recovery binding and
reject unbound input. First and cold callbacks still arrive; retries with a fresh
flow ID and unrelated invitation/navigation links retain their behavior.

Three production-bridge lifecycle regressions fail before and pass after: a
retained code callback, retained provider error, and cold callback across reload.
The browser fixture now retains actual callback URLs like the native SDK, and
checks final account writes, one code exchange, one browser close and persisted
account after relaunch. Rejection and password recovery cases use this same
retained-link fixture; provider/backend credentials remain synthetic.

The login, recovery and name-completion gates all use app-icon-exterior-192.png,
matching the current app header. The design observer no longer restores the old
icon after a gate rerender. Its behavior regression fails before and passes after;
a rendered mobile gate case checks the loaded asset before/after signup rerender
and page reload. PWA 508 refreshes cached modules and precaches the new callback
helper, preserving the already merged browser color updates.

Broad synchronization QA exposed a separate stale-outbox race after self-leave:
the departed member's RLS-filtered empty snapshot was treated as a new event,
causing an unnecessary create_shared_event_snapshot request. The save now checks
the existing explicit server revocation contract before creation, retaining local
financial history and removing only the revoked event's sync credentials. Empty
reads, transport failures and generic denial alone do not establish revocation.
The new normal-suite behavioral regression fails before with the exact unwanted
create payload and passes after without any write. Existing new-event creation,
concurrent creation, expired-session and membership tests pass.

The two-client self-leave fixture previously answered join_shared_event with
200 false after departure. It now models SQL's explicit 42501/403 response and
message in the self-leave scenarios. Unexpected writes, rejection/retry checks,
single committed leave and final cross-client state assertions remain intact.

Physical Apple authorization, account acceptance and relaunch on the replacement
TestFlight build remain required. Simulator callback/SDK checks do not authorize
an actual Apple account or replace that acceptance test.

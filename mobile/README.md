# BuildSphere Mobile

Flutter homeowner app ([ADR-005](../docs/DECISIONS.md): ships after the web MVP proves the design loop).

> ⚠️ **No store upload — TestFlight included — until the production domain is
> final.** The bundle id derives from the domain and can never change after
> the first upload ([LESSONS_LEARNED.md](../docs/LESSONS_LEARNED.md) L6).
> Before the first submission, run the store checklist in L5: agreements
> Active, products on both stores, purchase surface rendering on a physical
> device — in that order.

This is the app shell only — `lib/main.dart` plus the shared sphere catalog,
**verified with the real toolchain**: `flutter analyze` clean and the widget
tests in `test/` green on Flutter stable (3.32). Platform folders
(`android/`, `ios/`) are not committed yet; generate them locally:

```bash
flutter create . --platforms=ios,android --project-name buildsphere_mobile
flutter test && flutter analyze
flutter run
```

### In-app purchases (StoreKit / Play Billing)

`lib/store/` wires the official `in_app_purchase` plugin behind an
injectable gateway, with one iron rule from the previous app's audit
(L1): **the client never grants itself an entitlement** — every purchase
posts its receipt to the BuildSphere server, which validates with
Apple/Google and records ownership. Builds point at a deployment with
`--dart-define=BUILDSPHERE_API=https://…`; without it (and without
`APPLE_SHARED_SECRET` / `GOOGLE_SERVICE_ACCOUNT_JSON` +
`ANDROID_PACKAGE_NAME` on the server) purchases are refused with the
exact fix and nothing unlocks. Product ids live in
`lib/store/products.dart` and must match App Store Connect and Play
Console exactly. The L5 checklist still gates going live: agreements
Active, products approved on both stores, purchase surface rendering on
a physical device.

Phase 1.x targets for this app: project dashboard, 3D viewer, walkthrough mode, and the budget center from the [platform overview](../docs/PLATFORM_OVERVIEW.md).

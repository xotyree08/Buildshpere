# BuildSphere Mobile

Flutter homeowner app ([ADR-005](../docs/DECISIONS.md): ships after the web MVP proves the design loop).

> ⚠️ **No store upload — TestFlight included — until the production domain is
> final.** The bundle id derives from the domain and can never change after
> the first upload ([LESSONS_LEARNED.md](../docs/LESSONS_LEARNED.md) L6).
> Before the first submission, run the store checklist in L5: agreements
> Active, products on both stores, purchase surface rendering on a physical
> device — in that order.

This is the app shell only — `lib/main.dart` plus the shared sphere catalog. Platform folders (`android/`, `ios/`) are not committed yet; generate them locally:

```bash
flutter create . --platforms=ios,android --project-name buildsphere_mobile
flutter run
```

Phase 1.x targets for this app: project dashboard, 3D viewer, walkthrough mode, and the budget center from the [platform overview](../docs/PLATFORM_OVERVIEW.md).

# BuildSphere Mobile

Flutter homeowner app ([ADR-005](../docs/DECISIONS.md): ships after the web MVP proves the design loop).

This is the app shell only — `lib/main.dart` plus the shared sphere catalog. Platform folders (`android/`, `ios/`) are not committed yet; generate them locally:

```bash
flutter create . --platforms=ios,android --project-name buildsphere_mobile
flutter run
```

Phase 1.x targets for this app: project dashboard, 3D viewer, walkthrough mode, and the budget center from the [platform overview](../docs/PLATFORM_OVERVIEW.md).

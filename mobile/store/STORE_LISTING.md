# Store listing — BuildSphere

Everything the store consoles ask for, ready to paste. Identity is
locked: app id `com.onbuildsphere.app`. The app is a FREE companion to
the web platform — it sells nothing in-app. Home projects are licensed
once (one home = one license, no subscription) on onbuildsphere.com.

## App name

BuildSphere

## Subtitle / short description (30 chars for App Store, 80 for Play)

- App Store subtitle: `Design the home you'll build`
- Play short description: `Your custom home: plans, pricing, and progress — from first sketch to move-in.`

## Description (both stores)

Design a custom home the way you'd describe it to a friend — and hold
real plans minutes later.

BuildSphere turns a short interview about how your family lives into
three architect-quality design concepts: floor plans, elevations, a
furnished 3D interior you can walk through, and a line-by-line cost
estimate that shows its sources. Refine by conversation ("bigger
kitchen, add a mudroom"), compare concepts and budget scenarios, and
carry the design through contractor bids, a construction schedule with
draw payments, and a 30-year maintenance plan.

The mobile app keeps your synced projects in your pocket: every
concept's floor plan, health score, and estimate breakdown. There is no
subscription — each home is licensed once on the BuildSphere website,
and everything a licensed project unlocks syncs to the app.

Honest by design: concepts are planning tools, not stamped construction
documents, and every estimate shows its confidence and provenance. Your
projects export to a single file anytime — your data is yours.

## Keywords (App Store, 100 chars)

`home design,floor plan,custom home,house plans,construction,budget,architect,3d home,build,estimate`

## Category

- Primary: Productivity (or Lifestyle / House & Home on Play)

## URLs the consoles require

- Privacy policy: https://onbuildsphere.com/privacy
- Terms of use: https://onbuildsphere.com/terms
- Support: https://onbuildsphere.com/faq (contact support@onbuildsphere.com)
- Marketing: https://onbuildsphere.com

## Assets in this folder

- `playstore/ic_launcher_512.png` — Play Store icon (512×512)
- iOS icons live in `ios/Runner/Assets.xcassets/AppIcon.appiconset`
- Android launcher icons live in `android/app/src/main/res/mipmap-*`

- `screenshots/ios-*.png` — 1290×2796 phone screenshots (home, sign-in,
  concept with floor plan, licensing), captured from the real app via the
  web screenshot harness (`lib/screenshots_app.dart`)
- `screenshots/play-*.png` — the same four at 1080×2340
- `playstore/feature_graphic_1024x500.png` — Play feature graphic

Regenerate anytime: `flutter build web -t lib/screenshots_app.dart
--release --no-web-resources-cdn`, serve `build/web`, and capture at
phone dimensions. Swap in device screenshots later if you prefer —
these are real app screens, not mockups.

## Android release signing (one-time)

1. `keytool -genkey -v -keystore ~/buildsphere-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. Create `mobile/android/key.properties` (gitignored):
   ```
   storeFile=/absolute/path/to/buildsphere-upload.jks
   storePassword=...
   keyAlias=upload
   keyPassword=...
   ```
3. `flutter build appbundle --dart-define=BUILDSPHERE_API=https://onbuildsphere.com`
4. Upload `build/app/outputs/bundle/release/app-release.aab` to Play Console.

## iOS release (one-time, needs a Mac with Xcode)

1. Open `mobile/ios/Runner.xcworkspace`, sign in with the Apple developer
   account, let Xcode manage signing for `com.onbuildsphere.app`.
2. `flutter build ipa --dart-define=BUILDSPHERE_API=https://onbuildsphere.com`
3. Upload the archive with Xcode Organizer or Transporter.

## In-app purchases

None. Do not create subscriptions or in-app products in either console —
the app sells nothing. Project licenses (Concept $695 / Design $1,495 /
Complete $2,495 / Build+ $3,495, one-time per project) are purchased on
onbuildsphere.com; see `CONSOLE_SETUP.md` § Stripe.

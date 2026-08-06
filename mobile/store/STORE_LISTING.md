# Store listing — BuildSphere

Everything the store consoles ask for, ready to paste. Identity is
locked: app id `com.onbuildsphere.app`, subscriptions
`buildsphere_plus_monthly` and `buildsphere_plus_yearly`.

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
concept's floor plan, health score, and estimate breakdown — plus
BuildSphere Plus, one subscription across web and mobile.

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

Still needed from a device or simulator (consoles reject without them):

- Phone screenshots: 3–8 per store (6.5" iPhone; Play accepts any phone)
- Play feature graphic: 1024×500

Suggested screenshot set: projects list → concept with floor plan →
estimate breakdown → upgrade page.

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

## Subscriptions to create in each console

| Product id | Period | Store setup |
| --- | --- | --- |
| `buildsphere_plus_monthly` | 1 month | App Store: Subscriptions → group "BuildSphere Plus". Play: Subscriptions → base plan `monthly` |
| `buildsphere_plus_yearly` | 1 year | Same group / base plan `yearly` |

After creating them, put `APPLE_SHARED_SECRET` (App Store Connect → App
Information → Shared Secret) and `GOOGLE_SERVICE_ACCOUNT_JSON` +
`ANDROID_PACKAGE_NAME=com.onbuildsphere.app` into Vercel env — receipt
validation lights up on redeploy.

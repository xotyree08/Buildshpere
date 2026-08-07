# Console setup playbook — BuildSphere

For an assistant driving the owner's browser (or the owner directly).
Work top to bottom. All identity values are locked — use them exactly.

| Value | Locked setting |
| --- | --- |
| App / product name | BuildSphere |
| Bundle / application id | `com.onbuildsphere.app` |
| Subscription ids | `buildsphere_plus_monthly`, `buildsphere_plus_yearly` |
| Prices | $4.99/month, $49.99/year |
| Privacy policy | https://onbuildsphere.com/privacy |
| Terms | https://onbuildsphere.com/terms |
| Support | https://onbuildsphere.com/faq |
| Webhook (Stripe) | `https://onbuildsphere.com/api/v1/purchases/stripe/webhook` |
| Vercel project | `buildshpere` (team xotyree-9876s-projects) |

Listing copy and images: `STORE_LISTING.md` and the files in this
folder (`playstore/`, `screenshots/`).

## 1. Stripe → live web payments (do first)

1. dashboard.stripe.com — complete any "Activate payments" banner.
2. Product catalog → **+ Add product** → name `BuildSphere Plus`.
   - Price 1: Recurring, Monthly, **$4.99** → save → copy its `price_…` id.
   - Same product → **Add another price**: Recurring, Yearly, **$49.99**
     → save → copy that `price_…` id.
3. Developers → API keys → copy the **Secret key** (`sk_live_…`).
4. Developers → Webhooks → **+ Add endpoint**:
   - Endpoint URL: the webhook URL from the table above.
   - Events: `checkout.session.completed`, `customer.subscription.deleted`.
   - Save → open the endpoint → **Reveal signing secret** (`whsec_…`).
5. Settings → Billing → **Customer portal** → Activate (default config is
   fine) — this powers the site's "Manage or cancel" button.
6. vercel.com → project `buildshpere` → Settings → Environment Variables —
   add for Production:
   - `STRIPE_SECRET_KEY` = the `sk_live_…` key
   - `STRIPE_WEBHOOK_SECRET` = the `whsec_…` secret
   - `STRIPE_PRICE_MONTHLY` = the monthly `price_…` id
   - `STRIPE_PRICE_YEARLY` = the yearly `price_…` id
7. Deployments → ⋯ on the latest → **Redeploy**.
8. Verify: onbuildsphere.com/app/account → sign in → "Plus monthly"
   should open a real Stripe checkout showing $4.99.

## 2. Google Play Console

1. play.google.com/console → **Create app**: BuildSphere, App, Free,
   accept declarations.
2. Store presence → Main store listing: paste short + full description
   from `STORE_LISTING.md`; upload `playstore/ic_launcher_512.png`,
   `playstore/feature_graphic_1024x500.png`, and the four
   `screenshots/play-*.png`.
3. App content (complete every task):
   - Privacy policy: the URL from the table.
   - Data safety: collects **Email address** (account management) and
     **App activity** (synced projects); encrypted in transit; users can
     request deletion (the privacy page describes how). No data sold, no ads.
   - Content rating questionnaire: utility/productivity, none of the
     sensitive content applies → rated Everyone.
   - Ads: No.
4. Monetize → Subscriptions → **Create subscription**:
   - id `buildsphere_plus_monthly` → base plan id `monthly`,
     auto-renewing, monthly, $4.99.
   - id `buildsphere_plus_yearly` → base plan id `yearly`,
     auto-renewing, yearly, $49.99.
5. Receipt validation credentials (for the server):
   - Setup → API access → create/link a Google Cloud project → create a
     **service account** with role "Service Account User", grant it
     access in Play Console (Financial data not required; "View app
     information and manage orders" is enough), create a JSON key.
   - Vercel env: `GOOGLE_SERVICE_ACCOUNT_JSON` = the JSON file contents,
     `ANDROID_PACKAGE_NAME` = `com.onbuildsphere.app` → redeploy.
6. The app bundle (needs Flutter on a computer, ~15 min):
   - Install Flutter: docs.flutter.dev/get-started
   - `git clone https://github.com/xotyree08/Buildshpere && cd Buildshpere/mobile`
   - Follow `STORE_LISTING.md` § "Android release signing" (keystore +
     `android/key.properties`), then
     `flutter build appbundle --dart-define=BUILDSPHERE_API=https://onbuildsphere.com`
   - Play Console → Testing → Internal testing → Create release → upload
     `build/app/outputs/bundle/release/app-release.aab`.

## 3. App Store Connect (upload step needs a Mac)

1. developer.apple.com/account → Certificates, IDs & Profiles →
   Identifiers → **+** → App IDs → App → Explicit bundle id
   `com.onbuildsphere.app` → Register.
2. appstoreconnect.apple.com → My Apps → **+ New App**: iOS, name
   BuildSphere, that bundle id, SKU `buildsphere-app`.
3. App Information: subtitle + category from `STORE_LISTING.md`;
   privacy policy URL from the table.
4. The version page: description + keywords from `STORE_LISTING.md`;
   upload the four `screenshots/ios-*.png` (6.7-inch size).
5. App Privacy questionnaire: collects Email (account), User Content
   (projects, linked to the user); no tracking, no ads.
6. Monetization → Subscriptions → create group `BuildSphere Plus` →
   two auto-renewable subscriptions with the locked ids and prices.
7. App Information → App-Specific Shared Secret → Generate → Vercel env
   `APPLE_SHARED_SECRET` → redeploy.
8. Binary (Mac only): open `mobile/ios/Runner.xcworkspace` in Xcode,
   sign in, let Xcode manage signing; then
   `flutter build ipa --dart-define=BUILDSPHERE_API=https://onbuildsphere.com`
   and upload with Xcode Organizer or Transporter.

## Never paste secrets into chats

Keys and secrets go straight from the dashboard into Vercel's
environment variables. Any secret that transits a conversation should
be considered exposed and rotated.

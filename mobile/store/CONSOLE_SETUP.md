# Console setup playbook — BuildSphere

For an assistant driving the owner's browser (or the owner directly).
Work top to bottom. All identity values are locked — use them exactly.

Pricing model: **one home = one project license**, purchased once on the
web. There are NO subscriptions and NO in-app purchases — do not create
subscription products in Stripe, Play, or App Store Connect. (An older
version of this playbook described $4.99/$49.99 subscriptions; that model
is retired. If any were already created, archive them unused.)

| Value | Locked setting |
| --- | --- |
| App / product name | BuildSphere |
| Bundle / application id | `com.onbuildsphere.app` |
| License tiers (web only) | Concept $695 · Design $1,495 · Complete $2,495 · Build+ $3,495 — one-time, per project |
| Privacy policy | https://onbuildsphere.com/privacy |
| Terms | https://onbuildsphere.com/terms |
| Support | https://onbuildsphere.com/faq |
| Pricing page | https://onbuildsphere.com/pricing |
| Webhook (Stripe) | `https://onbuildsphere.com/api/v1/purchases/stripe/webhook` |
| Vercel project | `buildshpere` (team xotyree-9876s-projects) |

Listing copy and images: `STORE_LISTING.md` and the files in this
folder (`playstore/`, `screenshots/`).

## 1. Stripe → live web payments (do first)

No products or prices need to be created in the dashboard — the site
sends each license's price with the checkout itself. Stripe setup is
just an API key and a webhook:

1. dashboard.stripe.com — complete any "Activate payments" banner.
2. Developers → API keys → copy the **Secret key** (`sk_live_…`).
3. Developers → Webhooks → **+ Add endpoint**:
   - Endpoint URL: the webhook URL from the table above.
   - Events: `checkout.session.completed` (only this one).
   - Save → open the endpoint → **Reveal signing secret** (`whsec_…`).
4. vercel.com → project `buildshpere` → Settings → Environment Variables —
   add for Production:
   - `STRIPE_SECRET_KEY` = the `sk_live_…` key
   - `STRIPE_WEBHOOK_SECRET` = the `whsec_…` secret
5. Deployments → ⋯ on the latest → **Redeploy**.
6. Verify: onbuildsphere.com/app → open a project → "Project license"
   panel → "License this project" should open a real Stripe checkout
   showing the tier's one-time price.

## 2. Google Play Console

The app sells nothing — it is a free companion to the web platform, so
skip the Monetize section entirely. No subscriptions, no in-app
products, no service-account/receipt credentials needed.

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
4. The app bundle (needs Flutter on a computer, ~15 min):
   - Install Flutter: docs.flutter.dev/get-started
   - `git clone https://github.com/xotyree08/Buildshpere && cd Buildshpere/mobile`
   - Follow `STORE_LISTING.md` § "Android release signing" (keystore +
     `android/key.properties`), then
     `flutter build appbundle --dart-define=BUILDSPHERE_API=https://onbuildsphere.com`
   - Play Console → Testing → Internal testing → Create release → upload
     `build/app/outputs/bundle/release/app-release.aab`.

## 3. App Store Connect (upload step needs a Mac)

Same rule: no in-app purchases, no subscription groups, no shared
secret. The app is a free companion; skip every monetization screen.

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
6. Binary (Mac only): open `mobile/ios/Runner.xcworkspace` in Xcode,
   sign in, let Xcode manage signing; then
   `flutter build ipa --dart-define=BUILDSPHERE_API=https://onbuildsphere.com`
   and upload with Xcode Organizer or Transporter.

## Never paste secrets into chats

Keys and secrets go straight from the dashboard into Vercel's
environment variables. Any secret that transits a conversation should
be considered exposed and rotated.

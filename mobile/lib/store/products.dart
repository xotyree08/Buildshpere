/// BuildSphere Plus product catalog — the single source of the ids that
/// must be configured identically in App Store Connect and Play Console.
/// Per LESSONS_LEARNED.md L5, nothing here goes live until the store
/// checklist passes: agreements Active, products approved on BOTH stores,
/// and the purchase surface rendering on a physical device.
library;

class PlusProduct {
  const PlusProduct({required this.id, required this.title, required this.blurb});

  final String id;
  final String title;
  final String blurb;
}

const plusProducts = <PlusProduct>[
  PlusProduct(
    id: 'buildsphere_plus_monthly',
    title: 'BuildSphere Plus — Monthly',
    blurb: 'Supports development. Plus benefits activate as Phase 2 systems ship.',
  ),
  PlusProduct(
    id: 'buildsphere_plus_yearly',
    title: 'BuildSphere Plus — Yearly',
    blurb: 'Two months free versus monthly.',
  ),
];

Set<String> get plusProductIds => plusProducts.map((p) => p.id).toSet();

import 'package:flutter/material.dart';

import 'store/purchase_service.dart';
import 'store/products.dart';

/// BuildSphere Plus paywall. Honest by construction: when billing is
/// unreachable or products are not yet configured on the stores, it says so
/// instead of pretending (LESSONS_LEARNED.md L5); nothing unlocks until the
/// server confirms the receipt (L1).
class UpgradeScreen extends StatefulWidget {
  const UpgradeScreen({super.key, required this.service});

  final PurchaseService service;

  @override
  State<UpgradeScreen> createState() => _UpgradeScreenState();
}

class _UpgradeScreenState extends State<UpgradeScreen> {
  @override
  void initState() {
    super.initState();
    widget.service.addListener(_onChange);
  }

  void _onChange() => setState(() {});

  @override
  void dispose() {
    widget.service.removeListener(_onChange);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final service = widget.service;
    return Scaffold(
      appBar: AppBar(title: const Text('BuildSphere Plus')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Plus supports development today; member benefits activate as '
            'Phase 2 systems ship. Purchases are confirmed by the BuildSphere '
            'server before anything unlocks.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 16),
          if (service.notice != null)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(service.notice!),
              ),
            ),
          switch (service.status) {
            StoreStatus.loading => const Center(child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              )),
            StoreStatus.unavailable => Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    'The store is not available here yet. On a simulator, or '
                    'before the products are configured in App Store Connect '
                    'and Play Console, this screen stays honest instead of '
                    'showing a broken purchase button.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
              ),
            StoreStatus.ready => Column(
                children: [
                  for (final product in service.products)
                    Card(
                      child: ListTile(
                        title: Text(product.title),
                        subtitle: Text(
                          plusProducts
                                  .where((p) => p.id == product.id)
                                  .map((p) => p.blurb)
                                  .firstOrNull ??
                              product.description,
                        ),
                        trailing: service.entitled.contains(product.id)
                            ? const Chip(label: Text('Active'))
                            : FilledButton(
                                onPressed: service.busy ? null : () => service.buy(product),
                                child: Text(product.price),
                              ),
                      ),
                    ),
                ],
              ),
          },
          const SizedBox(height: 8),
          TextButton(
            onPressed: service.busy ? null : service.restore,
            child: const Text('Restore purchases'),
          ),
        ],
      ),
    );
  }
}

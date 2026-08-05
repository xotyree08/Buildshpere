/// Store gateway: the seam between purchase logic and the platform billing
/// plugin. Production wraps the official `in_app_purchase` plugin (StoreKit
/// on iOS, Play Billing on Android); tests substitute a fake so the purchase
/// state machine is verified without platform channels.
library;

import 'dart:async';

import 'package:in_app_purchase/in_app_purchase.dart';

class StoreProduct {
  const StoreProduct({
    required this.id,
    required this.title,
    required this.description,
    required this.price,
  });

  final String id;
  final String title;
  final String description;
  /// Localized display price from the store (e.g. "$4.99").
  final String price;
}

enum PurchaseEvent { pending, purchased, restored, canceled, error }

class StorePurchase {
  const StorePurchase({
    required this.productId,
    required this.event,
    required this.verificationData,
    this.errorMessage,
  });

  final String productId;
  final PurchaseEvent event;

  /// The store's server-verifiable payload (App Store receipt / Play purchase
  /// token). Sent to the BuildSphere server, which alone decides entitlement
  /// (LESSONS_LEARNED.md L1: entitlements are never client-writable).
  final String verificationData;
  final String? errorMessage;
}

abstract class StoreGateway {
  Future<bool> isAvailable();
  Future<List<StoreProduct>> queryProducts(Set<String> ids);
  Future<void> buy(StoreProduct product);
  Future<void> restorePurchases();
  Stream<StorePurchase> get purchases;
}

/// Production gateway over the official plugin.
class PluginStoreGateway implements StoreGateway {
  PluginStoreGateway([InAppPurchase? plugin]) : _plugin = plugin ?? InAppPurchase.instance;

  final InAppPurchase _plugin;
  final Map<String, ProductDetails> _details = {};

  @override
  Future<bool> isAvailable() => _plugin.isAvailable();

  @override
  Future<List<StoreProduct>> queryProducts(Set<String> ids) async {
    final response = await _plugin.queryProductDetails(ids);
    for (final d in response.productDetails) {
      _details[d.id] = d;
    }
    return response.productDetails
        .map((d) => StoreProduct(
              id: d.id,
              title: d.title,
              description: d.description,
              price: d.price,
            ))
        .toList();
  }

  @override
  Future<void> buy(StoreProduct product) async {
    final details = _details[product.id];
    if (details == null) {
      throw StateError('Product ${product.id} not loaded from the store.');
    }
    await _plugin.buyNonConsumable(purchaseParam: PurchaseParam(productDetails: details));
  }

  @override
  Future<void> restorePurchases() => _plugin.restorePurchases();

  @override
  Stream<StorePurchase> get purchases => _plugin.purchaseStream.expand((updates) sync* {
        for (final u in updates) {
          yield StorePurchase(
            productId: u.productID,
            event: switch (u.status) {
              PurchaseStatus.pending => PurchaseEvent.pending,
              PurchaseStatus.purchased => PurchaseEvent.purchased,
              PurchaseStatus.restored => PurchaseEvent.restored,
              PurchaseStatus.canceled => PurchaseEvent.canceled,
              PurchaseStatus.error => PurchaseEvent.error,
            },
            verificationData: u.verificationData.serverVerificationData,
            errorMessage: u.error?.message,
          );
          // Always complete delivered purchases so stores stop re-delivering.
          if (u.pendingCompletePurchase) {
            _plugin.completePurchase(u);
          }
        }
      });
}

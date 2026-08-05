/// The purchase state machine. One rule above all others
/// (LESSONS_LEARNED.md L1): the client NEVER grants itself an entitlement.
/// A store purchase is only "yours" after the BuildSphere server validates
/// the receipt with Apple/Google and records the entitlement; until then the
/// UI says "confirming with the server", and on failure it says exactly why.
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import 'gateway.dart';
import 'products.dart';

enum StoreStatus {
  loading,
  /// Billing is not reachable (simulator, no store account, or products not
  /// yet configured in App Store Connect / Play Console).
  unavailable,
  ready,
}

class ServerVerdict {
  const ServerVerdict.granted() : granted = true, message = null;
  const ServerVerdict.denied(this.message) : granted = false;

  final bool granted;
  final String? message;
}

/// Posts the store's verification payload to the BuildSphere server and
/// returns its verdict. Production implements this over HTTP; tests fake it.
typedef ServerValidator = Future<ServerVerdict> Function(StorePurchase purchase);

class PurchaseService extends ChangeNotifier {
  PurchaseService({required StoreGateway gateway, required ServerValidator validateOnServer})
      : _gateway = gateway,
        _validateOnServer = validateOnServer;

  final StoreGateway _gateway;
  final ServerValidator _validateOnServer;
  StreamSubscription<StorePurchase>? _sub;

  StoreStatus status = StoreStatus.loading;
  List<StoreProduct> products = const [];
  bool busy = false;
  /// Product ids the SERVER confirmed as owned. Never written locally.
  final Set<String> entitled = {};
  String? notice;

  Future<void> init() async {
    _sub = _gateway.purchases.listen(_onPurchase);
    if (!await _gateway.isAvailable()) {
      status = StoreStatus.unavailable;
      notifyListeners();
      return;
    }
    products = await _gateway.queryProducts(plusProductIds);
    status = products.isEmpty ? StoreStatus.unavailable : StoreStatus.ready;
    notifyListeners();
  }

  Future<void> buy(StoreProduct product) async {
    busy = true;
    notice = null;
    notifyListeners();
    try {
      await _gateway.buy(product);
    } catch (e) {
      busy = false;
      notice = 'Purchase could not start: $e';
      notifyListeners();
    }
  }

  Future<void> restore() async {
    busy = true;
    notice = null;
    notifyListeners();
    await _gateway.restorePurchases();
    busy = false;
    notice = 'Restore requested — any past purchases will re-confirm below.';
    notifyListeners();
  }

  Future<void> _onPurchase(StorePurchase purchase) async {
    switch (purchase.event) {
      case PurchaseEvent.pending:
        busy = true;
        notice = 'Waiting for the store…';
      case PurchaseEvent.canceled:
        busy = false;
        notice = null;
      case PurchaseEvent.error:
        busy = false;
        notice = purchase.errorMessage == null
            ? 'The store reported an error. You were not charged twice — retry or restore.'
            : 'Store error: ${purchase.errorMessage}';
      case PurchaseEvent.purchased || PurchaseEvent.restored:
        notice = 'Confirming with the BuildSphere server…';
        notifyListeners();
        final verdict = await _validateOnServer(purchase);
        busy = false;
        if (verdict.granted) {
          entitled.add(purchase.productId);
          notice = null;
        } else {
          // L1 + L2: the client does not self-grant, and the failure is loud.
          notice = verdict.message ??
              'The server could not confirm this purchase. Nothing was unlocked — use Restore once it is resolved.';
        }
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

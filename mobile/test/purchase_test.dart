import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:buildsphere_mobile/store/gateway.dart';
import 'package:buildsphere_mobile/store/products.dart';
import 'package:buildsphere_mobile/store/purchase_service.dart';
import 'package:buildsphere_mobile/store/server_validator.dart';
import 'package:buildsphere_mobile/license_screen.dart';

class FakeGateway implements StoreGateway {
  FakeGateway({this.available = true, List<StoreProduct>? products})
      : products = products ??
            [
              const StoreProduct(
                id: 'buildsphere_plus_monthly',
                title: 'Plus Monthly',
                description: 'd',
                price: r'$4.99',
              ),
            ];

  final bool available;
  final List<StoreProduct> products;
  final controller = StreamController<StorePurchase>.broadcast();
  final bought = <String>[];
  bool restored = false;

  @override
  Future<bool> isAvailable() async => available;

  @override
  Future<List<StoreProduct>> queryProducts(Set<String> ids) async =>
      products.where((p) => ids.contains(p.id)).toList();

  @override
  Future<void> buy(StoreProduct product) async => bought.add(product.id);

  @override
  Future<void> restorePurchases() async => restored = true;

  @override
  Stream<StorePurchase> get purchases => controller.stream;
}

void main() {
  test('entitlement is granted ONLY when the server confirms (L1)', () async {
    final gateway = FakeGateway();
    var serverAnswer = const ServerVerdict.denied('Receipt validation is not configured.');
    final service = PurchaseService(
      gateway: gateway,
      validateOnServer: (_) async => serverAnswer,
    );
    await service.init();
    expect(service.status, StoreStatus.ready);

    // Store says purchased, server says no → nothing unlocks, reason shown.
    gateway.controller.add(const StorePurchase(
      productId: 'buildsphere_plus_monthly',
      event: PurchaseEvent.purchased,
      verificationData: 'receipt-1',
    ));
    await Future<void>.delayed(Duration.zero);
    expect(service.entitled, isEmpty);
    expect(service.notice, contains('not configured'));

    // Server confirms (e.g. after deployment is configured) → unlocked.
    serverAnswer = const ServerVerdict.granted();
    gateway.controller.add(const StorePurchase(
      productId: 'buildsphere_plus_monthly',
      event: PurchaseEvent.restored,
      verificationData: 'receipt-1',
    ));
    await Future<void>.delayed(Duration.zero);
    expect(service.entitled, {'buildsphere_plus_monthly'});
    expect(service.notice, isNull);
  });

  test('store errors and cancels never grant and never crash', () async {
    final gateway = FakeGateway();
    final service = PurchaseService(
      gateway: gateway,
      validateOnServer: (_) async => const ServerVerdict.granted(),
    );
    await service.init();

    gateway.controller.add(const StorePurchase(
      productId: 'buildsphere_plus_monthly',
      event: PurchaseEvent.error,
      verificationData: '',
      errorMessage: 'card declined',
    ));
    await Future<void>.delayed(Duration.zero);
    expect(service.entitled, isEmpty);
    expect(service.notice, contains('card declined'));

    gateway.controller.add(const StorePurchase(
      productId: 'buildsphere_plus_monthly',
      event: PurchaseEvent.canceled,
      verificationData: '',
    ));
    await Future<void>.delayed(Duration.zero);
    expect(service.entitled, isEmpty);
    expect(service.notice, isNull);
  });

  test('a build without a server URL denies with the exact fix', () async {
    final validate = buildServerValidator(base: '');
    final verdict = await validate(const StorePurchase(
      productId: 'buildsphere_plus_monthly',
      event: PurchaseEvent.purchased,
      verificationData: 'r',
    ));
    expect(verdict.granted, isFalse);
    expect(verdict.message, contains('--dart-define=BUILDSPHERE_API'));
  });

  testWidgets('licensing screen sells nothing: no prices, no purchase buttons', (tester) async {
    tester.view.physicalSize = const Size(900, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(const MaterialApp(home: LicenseScreen()));
    expect(find.textContaining('no monthly subscription'), findsOneWidget);
    expect(find.text('BuildSphere Complete'), findsOneWidget);
    expect(find.textContaining(r'$'), findsNothing);
    expect(find.byType(FilledButton), findsNothing);
    expect(find.textContaining('licensed professionals'), findsOneWidget);
  });

  test('catalog ids are unique and store-safe', () {
    expect(plusProductIds.length, plusProducts.length);
    for (final id in plusProductIds) {
      expect(RegExp(r'^[a-z0-9_.]+$').hasMatch(id), isTrue, reason: id);
    }
  });
}

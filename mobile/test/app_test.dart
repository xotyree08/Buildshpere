import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:buildsphere_mobile/main.dart';
import 'package:buildsphere_mobile/spheres.dart';

void main() {
  testWidgets('home screen lists all eight spheres with phase chips', (tester) async {
    await tester.pumpWidget(const BuildSphereApp());

    expect(spheres.length, 8);
    for (final sphere in spheres) {
      // The list is scrollable — bring each entry into view before asserting.
      await tester.scrollUntilVisible(find.text(sphere.name), 100);
      expect(find.text(sphere.name), findsOneWidget);
      expect(find.text(sphere.tagline), findsOneWidget);
    }
  });

  testWidgets("each sphere's card carries its own phase chip", (tester) async {
    await tester.pumpWidget(const BuildSphereApp());

    for (final sphere in spheres) {
      await tester.scrollUntilVisible(find.text(sphere.name), 100);
      final card = find.ancestor(of: find.text(sphere.name), matching: find.byType(Card));
      expect(
        find.descendant(of: card, matching: find.text('Phase ${sphere.phase}')),
        findsOneWidget,
      );
    }
  });

  test('sphere registry mirrors the web app: keys unique, phases 1-5 present', () {
    final keys = spheres.map((s) => s.key).toSet();
    expect(keys.length, spheres.length, reason: 'duplicate sphere key');
    final phases = spheres.map((s) => s.phase).toSet();
    expect(phases.containsAll({1, 2, 3, 4, 5}), isTrue);
    expect(spheres.where((s) => s.phase == 1).length, 3,
        reason: 'DesignSphere, ModelSphere, CostSphere ship in Phase 1');
  });
}

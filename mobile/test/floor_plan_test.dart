import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:buildsphere_mobile/api/client.dart';
import 'package:buildsphere_mobile/floor_plan.dart';
import 'package:buildsphere_mobile/project_detail_screen.dart';

const roomsJson = {
  'levels': 2,
  'rooms': [
    {'label': 'Great Room', 'kind': 'living', 'level': 0, 'rect': [0, 0, 20, 16]},
    {'label': 'Kitchen', 'kind': 'kitchen', 'level': 0, 'rect': [20, 0, 14, 12]},
    {'label': 'Primary Suite', 'kind': 'bedroom', 'level': 1, 'rect': [0, 0, 16, 14]},
    {'label': 'broken', 'kind': 'bedroom', 'level': 0, 'rect': [1, 2]},
  ],
};

void main() {
  test('parseRooms reads rects and skips malformed entries without throwing', () {
    final rooms = parseRooms(roomsJson);
    expect(rooms, hasLength(3));
    expect(rooms.first.label, 'Great Room');
    expect(rooms.first.w, 20);
    expect(rooms.where((r) => r.level == 1).single.label, 'Primary Suite');
    expect(parseRooms(null), isEmpty);
    expect(parseRooms({'rooms': 'nope'}), isEmpty);
  });

  test('categoryTotals rolls up qty x unit cost, largest category first', () {
    final totals = categoryTotals([
      {'category': 'Framing', 'qty': 100.0, 'unitCostCents': 500},
      {'category': 'Framing', 'qty': 10.0, 'unitCostCents': 100},
      {'category': 'Roofing', 'qty': 200.0, 'unitCostCents': 900},
      {'not': 'a line'},
    ]);
    expect(totals, hasLength(2));
    expect(totals.first.category, 'Roofing');
    expect(totals.first.cents, 180000);
    expect(totals.last.cents, 51000);
    expect(totals.last.price, r'$510');
  });

  test('computeFit scales the footprint to the canvas and centers it', () {
    final rooms = parseRooms(roomsJson).where((r) => r.level == 0).toList();
    // Footprint is 34ft x 16ft; a 348x168 canvas with 8px padding leaves
    // 332x152, so the width is the binding constraint at scale ~9.5.
    final fit = computeFit(rooms, const Size(348, 168));
    expect(fit.scale, closeTo(152 / 16, 0.001));
    final great = fit.map(rooms.first);
    expect(great.width, closeTo(20 * fit.scale, 0.001));
    // The whole footprint stays inside the canvas.
    for (final r in rooms) {
      final m = fit.map(r);
      expect(m.left, greaterThanOrEqualTo(0));
      expect(m.top, greaterThanOrEqualTo(0));
      expect(m.right, lessThanOrEqualTo(348));
      expect(m.bottom, lessThanOrEqualTo(168));
    }
    expect(computeFit(const [], const Size(100, 100)).scale, 1);
  });

  testWidgets('detail screen paints a plan per level and the estimate breakdown', (tester) async {
    final concept = ConceptSummary(
      label: 'The Courtyard',
      healthScore: 96,
      totalCents: 45000000,
      lowCents: 38250000,
      highCents: 51750000,
      beds: 3,
      baths: 2,
      levels: 2,
      rooms: parseRooms(roomsJson),
      categories: const [
        CategoryTotal(category: 'Framing', cents: 5100000),
        CategoryTotal(category: 'Roofing', cents: 2100000),
      ],
    );
    final project = ProjectSummary(
      id: 'p1',
      name: 'Cedar Ridge',
      conceptCount: 1,
      bestHealth: 96,
      fromTotalCents: 45000000,
      status: 'designing',
      concepts: [concept],
    );
    tester.view.physicalSize = const Size(900, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: ProjectDetailScreen(project: project)));
    expect(find.byType(FloorPlanView), findsNWidgets(2));
    expect(find.text('Level 2'), findsOneWidget);
    await tester.tap(find.text('Estimate breakdown'));
    await tester.pumpAndSettle();
    expect(find.text('Framing'), findsOneWidget);
    expect(find.text(r'$51,000'), findsOneWidget);
  });

  test('fetchProjects carries rooms and categories through the sync payload', () async {
    final payload = {
      'projects': [
        {
          'project': {'id': 'p1', 'name': 'Cedar Ridge', 'status': 'designing'},
          'packages': [
            {
              'concept': {'label': 'The Courtyard', 'beds': 3, 'baths': 2, 'model': roomsJson},
              'healthScore': 96,
              'estimate': {
                'totalCents': 45000000,
                'lowCents': 38250000,
                'highCents': 51750000,
                'lineItems': [
                  {'category': 'Framing', 'qty': 100.0, 'unitCostCents': 500},
                ],
              },
            },
          ],
        },
      ],
    };
    final client = ApiClient(
      transport: _StaticTransport(jsonEncode(payload)),
      base: 'https://onbuildsphere.com',
    );
    await client.login('a@b.co', 'hunter2hunter2');
    final outcome = await client.fetchProjects();
    final concept = (outcome as ApiOk<List<ProjectSummary>>).value.single.concepts.single;
    expect(concept.levels, 2);
    expect(concept.rooms, hasLength(3));
    expect(concept.categories.single.category, 'Framing');
  });
}

class _StaticTransport implements Transport {
  _StaticTransport(this.projectsBody);
  final String projectsBody;

  @override
  Future<ApiResponse> send(String method, Uri url,
      {Map<String, String> headers = const {}, String? body}) async {
    if (url.path.endsWith('/auth/login')) {
      return const ApiResponse(200, '{"user":{"email":"a@b.co"}}',
          setCookie: 'bs_session=tok; Path=/');
    }
    return ApiResponse(200, projectsBody);
  }
}

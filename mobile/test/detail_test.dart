import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:buildsphere_mobile/api/client.dart';
import 'package:buildsphere_mobile/project_detail_screen.dart';
import 'package:buildsphere_mobile/projects_screen.dart';

class FakeTransport implements Transport {
  FakeTransport(this.handler);
  final Future<ApiResponse> Function(String method, Uri url, Map<String, String> headers, String? body) handler;

  @override
  Future<ApiResponse> send(String method, Uri url, {Map<String, String> headers = const {}, String? body}) {
    return handler(method, url, headers, body);
  }
}

const projectsJson = {
  'projects': [
    {
      'project': {'id': 'p1', 'name': 'Cedar Ridge', 'status': 'designing'},
      'packages': [
        {
          'concept': {'label': 'The Courtyard', 'beds': 3, 'baths': 2},
          'healthScore': 96,
          'estimate': {'totalCents': 45000000, 'lowCents': 38250000, 'highCents': 51750000},
        },
        {
          'concept': {'label': 'The Wide Ranch', 'beds': 3, 'baths': 2},
          'healthScore': 100,
          'estimate': {'totalCents': 42000000, 'lowCents': 35700000, 'highCents': 48300000},
        },
      ],
    },
  ],
};

void main() {
  test('fetchProjects parses per-concept details from the sync payload', () async {
    final transport = FakeTransport((method, url, headers, body) async {
      if (url.path.endsWith('/auth/login')) {
        return const ApiResponse(200, '{"user":{"email":"a@b.co"}}',
            setCookie: 'bs_session=tok; Path=/');
      }
      return ApiResponse(200, jsonEncode(projectsJson));
    });
    final client = ApiClient(transport: transport, base: 'https://onbuildsphere.com');
    await client.login('a@b.co', 'hunter2hunter2');
    final projects = await client.fetchProjects();
    final list = (projects as ApiOk<List<ProjectSummary>>).value;
    expect(list.single.concepts, hasLength(2));
    expect(list.single.concepts.first.label, 'The Courtyard');
    expect(list.single.concepts.first.range, r'$382,500 – $517,500');
    expect(list.single.concepts.last.price, r'$420,000');
  });

  testWidgets('detail screen renders every concept with health and range', (tester) async {
    const project = ProjectSummary(
      id: 'p1',
      name: 'Cedar Ridge',
      conceptCount: 2,
      bestHealth: 100,
      fromTotalCents: 42000000,
      status: 'designing',
      concepts: [
        ConceptSummary(label: 'The Courtyard', healthScore: 96, totalCents: 45000000, lowCents: 38250000, highCents: 51750000, beds: 3, baths: 2),
        ConceptSummary(label: 'The Wide Ranch', healthScore: 100, totalCents: 42000000, lowCents: 35700000, highCents: 48300000, beds: 3, baths: 2),
      ],
    );
    await tester.pumpWidget(const MaterialApp(home: ProjectDetailScreen(project: project)));
    expect(find.text('The Courtyard'), findsOneWidget);
    expect(find.text('The Wide Ranch'), findsOneWidget);
    expect(find.text('Health 100'), findsOneWidget);
    expect(find.textContaining(r'$382,500'), findsOneWidget);
    expect(find.text('3 bed / 2 bath'), findsNWidgets(2));
    expect(find.textContaining('on the web app'), findsOneWidget);
  });

  testWidgets('tapping a project on the dashboard opens its detail', (tester) async {
    final transport = FakeTransport((method, url, headers, body) async {
      if (url.path.endsWith('/auth/login')) {
        return const ApiResponse(200, '{"user":{"email":"a@b.co"}}',
            setCookie: 'bs_session=tok; Path=/');
      }
      return ApiResponse(200, jsonEncode(projectsJson));
    });
    final client = ApiClient(transport: transport, base: 'https://onbuildsphere.com');
    await tester.pumpWidget(MaterialApp(home: ProjectsScreen(client: client)));
    await tester.enterText(find.byType(TextField).first, 'a@b.co');
    await tester.enterText(find.byType(TextField).last, 'hunter2hunter2');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cedar Ridge'));
    await tester.pumpAndSettle();
    expect(find.text('The Courtyard'), findsOneWidget);
    expect(find.text('The Wide Ranch'), findsOneWidget);
  });
}

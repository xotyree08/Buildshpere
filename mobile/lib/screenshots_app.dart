/// Store-screenshot harness: boots the REAL app screens with
/// representative data so the store listings show the product as it is —
/// same widgets, same theme, no mockups. Built for web
/// (`flutter build web -t lib/screenshots_app.dart`) and captured
/// headlessly at phone dimensions; never shipped in the store binaries.
library;

import 'dart:convert';

import 'package:flutter/material.dart';

import 'api/client.dart';
import 'license_screen.dart';
import 'main.dart' show HomeScreen;
import 'project_detail_screen.dart';
import 'projects_screen.dart';

const _projectsJson = {
  'projects': [
    {
      'project': {'id': 'p1', 'name': 'Cedar Ridge', 'status': 'designing'},
      'packages': [
        {
          'concept': {
            'label': 'The Garden Courtyard',
            'beds': 4,
            'baths': 3.5,
            'model': {
              'levels': 1,
              'rooms': [
                {'label': 'Living Room', 'kind': 'living', 'level': 0, 'rect': [0, 0, 18, 15]},
                {'label': 'Kitchen', 'kind': 'kitchen', 'level': 0, 'rect': [18, 0, 14, 12]},
                {'label': 'Dining', 'kind': 'dining', 'level': 0, 'rect': [32, 0, 12, 12]},
                {'label': 'Primary Suite', 'kind': 'bedroom', 'level': 0, 'rect': [0, 19, 16, 14]},
                {'label': 'Bedroom 2', 'kind': 'bedroom', 'level': 0, 'rect': [16, 19, 13, 12]},
                {'label': 'Bedroom 3', 'kind': 'bedroom', 'level': 0, 'rect': [29, 19, 13, 12]},
                {'label': 'Primary Bath', 'kind': 'bathroom', 'level': 0, 'rect': [0, 33, 10, 9]},
                {'label': 'Office', 'kind': 'office', 'level': 0, 'rect': [10, 33, 12, 11]},
                {'label': '2-Car Garage', 'kind': 'garage', 'level': 0, 'rect': [22, 33, 23, 19]},
              ],
            },
          },
          'healthScore': 96,
          'estimate': {
            'totalCents': 58331543,
            'lowCents': 49581812,
            'highCents': 67081275,
            'lineItems': [
              {'category': 'Structure & Envelope', 'qty': 1.0, 'unitCostCents': 21000000},
              {'category': 'Interior Finishes', 'qty': 1.0, 'unitCostCents': 12400000},
              {'category': 'Mechanical, Electrical & Plumbing', 'qty': 1.0, 'unitCostCents': 9800000},
              {'category': 'Sitework & Foundation', 'qty': 1.0, 'unitCostCents': 7600000},
              {'category': 'Soft Costs & Contingency', 'qty': 1.0, 'unitCostCents': 7531543},
            ],
          },
        },
        {
          'concept': {'label': 'The Foursquare', 'beds': 4, 'baths': 3.5},
          'healthScore': 100,
          'estimate': {'totalCents': 55381115, 'lowCents': 47073948, 'highCents': 63688282},
        },
        {
          'concept': {'label': 'The Wide Ranch', 'beds': 4, 'baths': 3.5},
          'healthScore': 96,
          'estimate': {'totalCents': 59109807, 'lowCents': 50243336, 'highCents': 67976278},
        },
      ],
    },
  ],
};

class _DemoTransport implements Transport {
  @override
  Future<ApiResponse> send(String method, Uri url,
      {Map<String, String> headers = const {}, String? body}) async {
    if (url.path.endsWith('/auth/login')) {
      return const ApiResponse(200, '{"user":{"email":"you@onbuildsphere.com"}}',
          setCookie: 'bs_session=demo; Path=/');
    }
    return ApiResponse(200, jsonEncode(_projectsJson));
  }
}

ConceptSummary _demoConcept() {
  final pkg = ((_projectsJson['projects'] as List).first as Map)['packages'] as List;
  final first = pkg.first as Map;
  final concept = first['concept'] as Map;
  final estimate = first['estimate'] as Map;
  return ConceptSummary(
    label: concept['label'] as String,
    healthScore: first['healthScore'] as int,
    totalCents: estimate['totalCents'] as int,
    lowCents: estimate['lowCents'] as int,
    highCents: estimate['highCents'] as int,
    beds: 4,
    baths: 4,
    levels: 1,
    rooms: parseRooms(concept['model']),
    categories: categoryTotals(estimate['lineItems'] as List),
  );
}

void main() {
  final screen = Uri.base.queryParameters['screen'] ?? 'home';
  runApp(_ScreenshotApp(screen: screen));
}

class _ScreenshotApp extends StatelessWidget {
  const _ScreenshotApp({required this.screen});

  final String screen;

  @override
  Widget build(BuildContext context) {
    final Widget page;
    switch (screen) {
      case 'projects':
        page = ProjectsScreen(client: ApiClient(transport: _DemoTransport(), base: 'https://onbuildsphere.com'));
      case 'detail':
        page = ProjectDetailScreen(
          project: ProjectSummary(
            id: 'p1',
            name: 'Cedar Ridge',
            conceptCount: 3,
            bestHealth: 100,
            fromTotalCents: 55381115,
            status: 'designing',
            concepts: [_demoConcept()],
          ),
        );
      case 'upgrade':
        page = const LicenseScreen();
      default:
        page = const HomeScreen();
    }
    return MaterialApp(
      title: 'BuildSphere',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1A6E4A)),
        useMaterial3: true,
      ),
      home: page,
    );
  }
}

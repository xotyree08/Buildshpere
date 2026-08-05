import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:buildsphere_mobile/api/client.dart';
import 'package:buildsphere_mobile/projects_screen.dart';

class FakeTransport implements Transport {
  FakeTransport(this.handler);
  final Future<ApiResponse> Function(String method, Uri url, Map<String, String> headers, String? body) handler;
  final calls = <String>[];

  @override
  Future<ApiResponse> send(String method, Uri url, {Map<String, String> headers = const {}, String? body}) {
    calls.add('$method ${url.path}');
    return handler(method, url, headers, body);
  }
}

const projectsJson = {
  'projects': [
    {
      'project': {'id': 'p1', 'name': 'Cedar Ridge', 'status': 'designing'},
      'packages': [
        {
          'healthScore': 96,
          'estimate': {'totalCents': 45000000},
        },
        {
          'healthScore': 100,
          'estimate': {'totalCents': 42000000},
        },
      ],
    },
  ],
};

void main() {
  test('login captures the session cookie and sends it on later calls', () async {
    String? seenCookie;
    final transport = FakeTransport((method, url, headers, body) async {
      if (url.path.endsWith('/auth/login')) {
        expect(jsonDecode(body!), {'email': 'a@b.co', 'password': 'hunter2hunter2'});
        return const ApiResponse(200, '{"user":{"email":"a@b.co"}}',
            setCookie: 'bs_session=tok123; Path=/; HttpOnly');
      }
      seenCookie = headers['cookie'];
      return ApiResponse(200, jsonEncode(projectsJson));
    });
    final client = ApiClient(transport: transport, base: 'https://onbuildsphere.com');

    final login = await client.login('a@b.co', 'hunter2hunter2');
    expect(login, isA<ApiOk<String>>());
    final projects = await client.fetchProjects();
    expect(projects, isA<ApiOk<List<ProjectSummary>>>());
    expect(seenCookie, 'bs_session=tok123');

    final list = (projects as ApiOk<List<ProjectSummary>>).value;
    expect(list.single.name, 'Cedar Ridge');
    expect(list.single.bestHealth, 100);
    expect(list.single.fromPrice, r'$420,000'); // cheapest concept
  });

  test('wrong password and unconfigured builds fail with exact reasons', () async {
    final transport = FakeTransport((m, u, h, b) async =>
        const ApiResponse(401, '{"error":"Email or password is incorrect."}'));
    final client = ApiClient(transport: transport, base: 'https://onbuildsphere.com');
    final denied = await client.login('a@b.co', 'wrong');
    expect((denied as ApiError).message, contains('incorrect'));

    final unconfigured = ApiClient(transport: transport, base: '');
    final result = await unconfigured.login('a@b.co', 'x');
    expect((result as ApiError).message, contains('--dart-define=BUILDSPHERE_API'));
  });

  testWidgets('dashboard signs in and lists projects with health and price', (tester) async {
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

    expect(find.text('Cedar Ridge'), findsOneWidget);
    expect(find.textContaining('best health 100'), findsOneWidget);
    expect(find.textContaining(r'$420,000'), findsOneWidget);
  });

  testWidgets('a failed sign-in shows the server reason, not a crash', (tester) async {
    final transport = FakeTransport((m, u, h, b) async =>
        const ApiResponse(429, '{"error":"Too many failed sign-in attempts for this email — wait 15 minutes and try again."}'));
    final client = ApiClient(transport: transport, base: 'https://onbuildsphere.com');
    await tester.pumpWidget(MaterialApp(home: ProjectsScreen(client: client)));
    await tester.enterText(find.byType(TextField).first, 'a@b.co');
    await tester.enterText(find.byType(TextField).last, 'pw-pw-pw-pw');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.textContaining('wait 15 minutes'), findsOneWidget);
  });
}

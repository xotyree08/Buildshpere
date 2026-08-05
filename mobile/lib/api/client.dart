/// BuildSphere API client for the homeowner app. The session cookie the
/// web app uses works identically here: sign in, capture bs_session, send
/// it back. Transport is injectable so the whole client is unit-tested
/// without a network; a build without --dart-define=BUILDSPHERE_API says
/// so honestly instead of failing cryptically.
library;

import 'dart:convert';
import 'dart:io';

const apiBase = String.fromEnvironment('BUILDSPHERE_API');

class ApiResponse {
  const ApiResponse(this.statusCode, this.body, {this.setCookie});
  final int statusCode;
  final String body;
  final String? setCookie;
}

/// Minimal transport surface; production uses dart:io, tests use a fake.
abstract class Transport {
  Future<ApiResponse> send(
    String method,
    Uri url, {
    Map<String, String> headers = const {},
    String? body,
  });
}

class HttpTransport implements Transport {
  @override
  Future<ApiResponse> send(String method, Uri url,
      {Map<String, String> headers = const {}, String? body}) async {
    final client = HttpClient();
    try {
      final req = await client.openUrl(method, url);
      headers.forEach(req.headers.set);
      if (body != null) {
        req.headers.contentType = ContentType.json;
        req.write(body);
      }
      final res = await req.close();
      final text = await res.transform(utf8.decoder).join();
      return ApiResponse(res.statusCode, text,
          setCookie: res.headers.value(HttpHeaders.setCookieHeader));
    } finally {
      client.close();
    }
  }
}

class ProjectSummary {
  const ProjectSummary({
    required this.id,
    required this.name,
    required this.conceptCount,
    required this.bestHealth,
    required this.fromTotalCents,
    required this.status,
  });

  final String id;
  final String name;
  final int conceptCount;
  final int bestHealth;
  final int fromTotalCents;
  final String status;

  String get fromPrice {
    final dollars = (fromTotalCents / 100).round();
    final s = dollars.toString();
    final buf = StringBuffer('\$');
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return buf.toString();
  }
}

sealed class ApiOutcome<T> {
  const ApiOutcome();
}

class ApiOk<T> extends ApiOutcome<T> {
  const ApiOk(this.value);
  final T value;
}

class ApiError<T> extends ApiOutcome<T> {
  const ApiError(this.message);
  final String message;
}

class ApiClient {
  ApiClient({required this.transport, String? base}) : base = base ?? apiBase;

  final Transport transport;
  final String base;
  String? _cookie;

  bool get configured => base.isNotEmpty;
  bool get signedIn => _cookie != null;

  static const _unconfigured =
      'This build has no server configured — rebuild with --dart-define=BUILDSPHERE_API=https://onbuildsphere.com';

  Future<ApiOutcome<String>> login(String email, String password) async {
    if (!configured) return const ApiError(_unconfigured);
    try {
      final res = await transport.send(
        'POST',
        Uri.parse('$base/api/v1/auth/login'),
        body: jsonEncode({'email': email, 'password': password}),
      );
      final data = jsonDecode(res.body);
      if (res.statusCode != 200) {
        return ApiError(
            data is Map && data['error'] is String ? data['error'] as String : 'Sign-in failed (HTTP ${res.statusCode}).');
      }
      final cookie = res.setCookie;
      if (cookie == null || !cookie.contains('bs_session=')) {
        return const ApiError('The server did not return a session — try again.');
      }
      _cookie = cookie.split(';').first;
      return ApiOk((data as Map)['user']['email'] as String);
    } catch (e) {
      return ApiError('Could not reach the server ($e).');
    }
  }

  Future<ApiOutcome<List<ProjectSummary>>> fetchProjects() async {
    if (!configured) return const ApiError(_unconfigured);
    if (_cookie == null) return const ApiError('Sign in first.');
    try {
      final res = await transport.send(
        'GET',
        Uri.parse('$base/api/v1/projects'),
        headers: {'cookie': _cookie!},
      );
      final data = jsonDecode(res.body);
      if (res.statusCode != 200) {
        return ApiError(
            data is Map && data['error'] is String ? data['error'] as String : 'Loading projects failed (HTTP ${res.statusCode}).');
      }
      final list = (data as Map)['projects'] as List;
      return ApiOk(list.map((raw) {
        final entry = raw as Map;
        final project = entry['project'] as Map;
        final packages = (entry['packages'] as List?) ?? const [];
        var best = 0;
        var from = 0;
        for (final p in packages) {
          final pkg = p as Map;
          final health = (pkg['healthScore'] as num?)?.toInt() ?? 0;
          if (health > best) best = health;
          final total = ((pkg['estimate'] as Map?)?['totalCents'] as num?)?.toInt() ?? 0;
          if (from == 0 || (total > 0 && total < from)) from = total;
        }
        return ProjectSummary(
          id: project['id'] as String,
          name: project['name'] as String,
          conceptCount: packages.length,
          bestHealth: best,
          fromTotalCents: from,
          status: (project['status'] as String?) ?? 'designing',
        );
      }).toList());
    } catch (e) {
      return ApiError('Could not reach the server ($e).');
    }
  }
}

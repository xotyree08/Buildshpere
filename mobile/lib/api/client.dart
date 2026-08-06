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

String formatUsd(int cents) {
  final dollars = (cents / 100).round();
  final s = dollars.toString();
  final buf = StringBuffer('\$');
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
    buf.write(s[i]);
  }
  return buf.toString();
}

/// One room's footprint, in feet, for the native floor-plan painter.
class RoomShape {
  const RoomShape({
    required this.label,
    required this.kind,
    required this.level,
    required this.x,
    required this.y,
    required this.w,
    required this.d,
  });

  final String label;
  final String kind;
  final int level;
  final double x;
  final double y;
  final double w;
  final double d;
}

/// One estimate category rolled up from its line items.
class CategoryTotal {
  const CategoryTotal({required this.category, required this.cents});
  final String category;
  final int cents;

  String get price => formatUsd(cents);
}

/// One concept inside a synced project — enough for the detail screen.
class ConceptSummary {
  const ConceptSummary({
    required this.label,
    required this.healthScore,
    required this.totalCents,
    required this.lowCents,
    required this.highCents,
    required this.beds,
    required this.baths,
    this.levels = 1,
    this.rooms = const [],
    this.categories = const [],
  });

  final String label;
  final int healthScore;
  final int totalCents;
  final int lowCents;
  final int highCents;
  final int beds;
  final int baths;
  final int levels;
  final List<RoomShape> rooms;
  final List<CategoryTotal> categories;

  String get price => formatUsd(totalCents);
  String get range => '${formatUsd(lowCents)} – ${formatUsd(highCents)}';
}

/// Roll estimate line items up into category subtotals, largest first —
/// the same qty × unit-cost arithmetic the web estimate engine uses.
List<CategoryTotal> categoryTotals(List<dynamic> lineItems) {
  final sums = <String, double>{};
  for (final raw in lineItems) {
    if (raw is! Map) continue;
    final category = (raw['category'] as String?) ?? 'Other';
    final qty = (raw['qty'] as num?)?.toDouble() ?? 0;
    final unit = (raw['unitCostCents'] as num?)?.toDouble() ?? 0;
    sums[category] = (sums[category] ?? 0) + qty * unit;
  }
  final list = sums.entries
      .map((e) => CategoryTotal(category: e.key, cents: e.value.round()))
      .where((c) => c.cents > 0)
      .toList()
    ..sort((a, b) => b.cents.compareTo(a.cents));
  return list;
}

/// Parse the synced model's rooms; malformed entries are skipped, never fatal.
List<RoomShape> parseRooms(dynamic model) {
  if (model is! Map) return const [];
  final rooms = model['rooms'];
  if (rooms is! List) return const [];
  final out = <RoomShape>[];
  for (final raw in rooms) {
    if (raw is! Map) continue;
    final rect = raw['rect'];
    if (rect is! List || rect.length != 4) continue;
    final nums = rect.map((v) => (v as num?)?.toDouble()).toList();
    if (nums.any((v) => v == null)) continue;
    out.add(RoomShape(
      label: (raw['label'] as String?) ?? '',
      kind: (raw['kind'] as String?) ?? 'other',
      level: (raw['level'] as num?)?.toInt() ?? 0,
      x: nums[0]!,
      y: nums[1]!,
      w: nums[2]!,
      d: nums[3]!,
    ));
  }
  return out;
}

class ProjectSummary {
  const ProjectSummary({
    required this.id,
    required this.name,
    required this.conceptCount,
    required this.bestHealth,
    required this.fromTotalCents,
    required this.status,
    this.concepts = const [],
  });

  final String id;
  final String name;
  final int conceptCount;
  final int bestHealth;
  final int fromTotalCents;
  final String status;
  final List<ConceptSummary> concepts;

  String get fromPrice => formatUsd(fromTotalCents);
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
        final concepts = <ConceptSummary>[];
        for (var i = 0; i < packages.length; i++) {
          final pkg = packages[i] as Map;
          final health = (pkg['healthScore'] as num?)?.toInt() ?? 0;
          if (health > best) best = health;
          final estimate = pkg['estimate'] as Map?;
          final total = (estimate?['totalCents'] as num?)?.toInt() ?? 0;
          if (from == 0 || (total > 0 && total < from)) from = total;
          final concept = pkg['concept'] as Map?;
          concepts.add(ConceptSummary(
            label: (concept?['label'] as String?) ?? 'Concept ${i + 1}',
            healthScore: health,
            totalCents: total,
            lowCents: (estimate?['lowCents'] as num?)?.toInt() ?? total,
            highCents: (estimate?['highCents'] as num?)?.toInt() ?? total,
            beds: (concept?['beds'] as num?)?.toInt() ?? 0,
            baths: (concept?['baths'] as num?)?.toInt() ?? 0,
            levels: (concept?['model'] is Map
                    ? ((concept!['model'] as Map)['levels'] as num?)?.toInt()
                    : null) ??
                1,
            rooms: parseRooms(concept?['model']),
            categories: categoryTotals((estimate?['lineItems'] as List?) ?? const []),
          ));
        }
        return ProjectSummary(
          id: project['id'] as String,
          name: project['name'] as String,
          conceptCount: packages.length,
          bestHealth: best,
          fromTotalCents: from,
          status: (project['status'] as String?) ?? 'designing',
          concepts: concepts,
        );
      }).toList());
    } catch (e) {
      return ApiError('Could not reach the server ($e).');
    }
  }
}

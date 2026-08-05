/// Production server validator: posts the store receipt to the BuildSphere
/// server, which validates it with Apple/Google and records the entitlement.
/// The API base comes from --dart-define=BUILDSPHERE_API=https://… ; a build
/// without it denies every purchase with the exact fix rather than granting
/// anything locally (L1) or failing silently (L2).
library;

import 'dart:convert';
import 'dart:io';

import 'gateway.dart';
import 'purchase_service.dart';

const apiBase = String.fromEnvironment('BUILDSPHERE_API');

ServerValidator buildServerValidator({String base = apiBase}) {
  return (StorePurchase purchase) async {
    if (base.isEmpty) {
      return const ServerVerdict.denied(
        'This build has no server configured — rebuild with '
        '--dart-define=BUILDSPHERE_API=<your deployment URL>. '
        'The purchase is safe with the store; use Restore afterwards.',
      );
    }
    try {
      final client = HttpClient();
      final req = await client.postUrl(Uri.parse('$base/api/v1/purchases/validate'));
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode({
        'platform': Platform.isIOS ? 'apple' : 'google',
        'productId': purchase.productId,
        'verificationData': purchase.verificationData,
      }));
      final res = await req.close();
      final body = jsonDecode(await res.transform(utf8.decoder).join());
      client.close();
      if (res.statusCode == 200 && body is Map && body['granted'] == true) {
        return const ServerVerdict.granted();
      }
      final message = body is Map && body['error'] is String
          ? body['error'] as String
          : 'Server rejected the purchase (HTTP ${res.statusCode}).';
      return ServerVerdict.denied(message);
    } catch (e) {
      return ServerVerdict.denied(
        'Could not reach the BuildSphere server ($e). The purchase is safe '
        'with the store — use Restore once you are back online.',
      );
    }
  };
}

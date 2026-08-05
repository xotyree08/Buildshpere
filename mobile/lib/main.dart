import 'package:flutter/material.dart';

import 'api/client.dart';
import 'projects_screen.dart';
import 'spheres.dart';
import 'store/gateway.dart';
import 'store/purchase_service.dart';
import 'store/server_validator.dart';
import 'upgrade_screen.dart';

void main() {
  runApp(const BuildSphereApp());
}

class BuildSphereApp extends StatelessWidget {
  const BuildSphereApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'BuildSphere',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1A6E4A)),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF4FAE82),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('BuildSphere')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Design, visualize, budget, and build your custom home.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              title: const Text('My Projects'),
              subtitle: const Text('Sign in to see your synced home designs.'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ProjectsScreen(client: ApiClient(transport: HttpTransport())),
                  ),
                );
              },
            ),
          ),
          for (final sphere in spheres)
            Card(
              child: ListTile(
                title: Text(sphere.name),
                subtitle: Text(sphere.tagline),
                trailing: Chip(label: Text('Phase ${sphere.phase}')),
              ),
            ),
          Card(
            child: ListTile(
              title: const Text('BuildSphere Plus'),
              subtitle: const Text('Support development — benefits activate as Phase 2 ships.'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                final service = PurchaseService(
                  gateway: PluginStoreGateway(),
                  validateOnServer: buildServerValidator(),
                )..init();
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => UpgradeScreen(service: service)),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

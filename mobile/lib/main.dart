import 'package:flutter/material.dart';

import 'api/client.dart';
import 'license_screen.dart';
import 'projects_screen.dart';
import 'spheres.dart';

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
              title: const Text('Project licensing'),
              subtitle: const Text('One home, one license — no monthly subscription.'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const LicenseScreen()),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

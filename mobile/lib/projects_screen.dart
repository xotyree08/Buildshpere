import 'package:flutter/material.dart';

import 'api/client.dart';
import 'project_detail_screen.dart';

/// The homeowner dashboard: sign in with the same account as the web app
/// and see every synced project — concepts, best health, starting price.
/// Honest states throughout: unconfigured builds, offline, and wrong
/// passwords each say exactly what's wrong.
class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key, required this.client});

  final ApiClient client;

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _signedInAs;
  List<ProjectSummary>? _projects;

  Future<void> _signIn() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final outcome = await widget.client.login(_email.text.trim(), _password.text);
    switch (outcome) {
      case ApiError(:final message):
        setState(() {
          _busy = false;
          _error = message;
        });
      case ApiOk(:final value):
        _signedInAs = value;
        final projects = await widget.client.fetchProjects();
        setState(() {
          _busy = false;
          switch (projects) {
            case ApiError(:final message):
              _error = message;
            case ApiOk(value: final list):
              _projects = list;
          }
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Projects')),
      body: _projects != null
          ? ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text('Signed in as $_signedInAs',
                      style: Theme.of(context).textTheme.bodySmall),
                ),
                if (_projects!.isEmpty)
                  const Card(
                    child: Padding(
                      padding: EdgeInsets.all(14),
                      child: Text(
                          'No synced projects yet. Design a home on the web app and sync it from Account.'),
                    ),
                  ),
                for (final p in _projects!)
                  Card(
                    child: ListTile(
                      title: Text(p.name),
                      subtitle: Text(p.conceptCount > 0
                          ? '${p.conceptCount} concepts · best health ${p.bestHealth} · from ${p.fromPrice}'
                          : 'Interview not finished'),
                      trailing: Chip(label: Text(p.status)),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => ProjectDetailScreen(project: p),
                        ),
                      ),
                    ),
                  ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  'Sign in with your BuildSphere account to see your synced projects.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _email,
                  decoration: const InputDecoration(labelText: 'Email'),
                  keyboardType: TextInputType.emailAddress,
                ),
                TextField(
                  controller: _password,
                  decoration: const InputDecoration(labelText: 'Password'),
                  obscureText: true,
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _busy ? null : _signIn,
                  child: Text(_busy ? 'Signing in…' : 'Sign in'),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(_error!,
                        style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ),
              ],
            ),
    );
  }
}

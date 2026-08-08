import 'package:flutter/material.dart';

/// Project licensing, explained honestly. BuildSphere sells no subscriptions
/// and this app sells nothing at all: each home is licensed once, per
/// project, in the BuildSphere web app, and everything a licensed project
/// unlocks syncs here. No purchase buttons, no store products — the app is
/// the companion to your projects, wherever you licensed them.
class LicenseScreen extends StatelessWidget {
  const LicenseScreen({super.key});

  static const _tiers = [
    (
      'BuildSphere Concept',
      'Explore your possibilities — concepts, floor plans, renders, and a preliminary estimate for one home.',
    ),
    (
      'BuildSphere Design',
      'Full interior and exterior design with a walkthrough, materials, and a preliminary bill of materials.',
    ),
    (
      'BuildSphere Complete',
      'The flagship: parcel analysis through permit preparation and contractor bid comparison.',
    ),
    (
      'BuildSphere Build+',
      'Everything in Complete plus the construction workspace, through to as-built records.',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Project licensing')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'One home, one license. There is no monthly subscription — each '
            'home project is licensed once and keeps its included renders, '
            'revision rounds, and deliverables.',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
          const SizedBox(height: 12),
          for (final (name, blurb) in _tiers)
            Card(
              child: ListTile(
                title: Text(name),
                subtitle: Text(blurb),
              ),
            ),
          const SizedBox(height: 12),
          Text(
            'Licenses are purchased and managed in the BuildSphere web app, '
            'from each project\'s page. Everything a licensed project '
            'unlocks syncs to this app automatically.',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          const SizedBox(height: 8),
          Text(
            'AI-generated plans are preliminary design work — final '
            'construction documents, seals, and permits come from licensed '
            'professionals in your jurisdiction.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

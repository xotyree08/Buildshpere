import 'package:flutter/material.dart';

import 'api/client.dart';

/// One project's concepts at a glance: label, health, price range, and
/// program. Read-only by design — the full document suite (bids,
/// schedule, maintenance, interiors) lives on the web app, and this
/// screen says so instead of pretending.
class ProjectDetailScreen extends StatelessWidget {
  const ProjectDetailScreen({super.key, required this.project});

  final ProjectSummary project;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(project.name)),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Row(
            children: [
              Chip(label: Text(project.status)),
              const SizedBox(width: 8),
              Text('${project.conceptCount} concepts',
                  style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
          const SizedBox(height: 6),
          if (project.concepts.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(14),
                child: Text('No concepts synced yet — finish the design interview on the web app.'),
              ),
            ),
          for (final c in project.concepts)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(c.label,
                              style: Theme.of(context).textTheme.titleMedium),
                        ),
                        Chip(label: Text('Health ${c.healthScore}')),
                      ],
                    ),
                    const SizedBox(height: 4),
                    if (c.beds > 0)
                      Text('${c.beds} bed / ${c.baths} bath',
                          style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 4),
                    Text(c.price, style: Theme.of(context).textTheme.titleLarge),
                    Text('Range ${c.range}',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 8),
          Text(
            'Drawings, the 3D walkthrough, bid package, schedule, and maintenance plan are on the web app — this screen keeps the numbers in your pocket.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}

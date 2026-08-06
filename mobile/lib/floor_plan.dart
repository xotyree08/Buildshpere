import 'package:flutter/material.dart';

import 'api/client.dart';

/// Native floor-plan rendering from the synced parametric model. The
/// same room rectangles the web viewer draws, painted with Canvas —
/// no webview, works offline once the project has synced.

/// How model feet map onto a canvas: scale and offsets that center the
/// level's footprint. Pure so tests can pin the geometry.
class PlanFit {
  const PlanFit(this.scale, this.dx, this.dy);
  final double scale;
  final double dx;
  final double dy;

  Rect map(RoomShape r) =>
      Rect.fromLTWH(dx + r.x * scale, dy + r.y * scale, r.w * scale, r.d * scale);
}

PlanFit computeFit(List<RoomShape> rooms, Size size, {double padding = 8}) {
  if (rooms.isEmpty) return const PlanFit(1, 0, 0);
  var minX = double.infinity, minY = double.infinity;
  var maxX = -double.infinity, maxY = -double.infinity;
  for (final r in rooms) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.d > maxY) maxY = r.y + r.d;
  }
  final w = maxX - minX, d = maxY - minY;
  if (w <= 0 || d <= 0) return const PlanFit(1, 0, 0);
  final scale = ((size.width - 2 * padding) / w)
      .clamp(0.0, (size.height - 2 * padding) / d)
      .toDouble();
  final dx = padding + (size.width - 2 * padding - w * scale) / 2 - minX * scale;
  final dy = padding + (size.height - 2 * padding - d * scale) / 2 - minY * scale;
  return PlanFit(scale, dx, dy);
}

const _kindFills = <String, Color>{
  'bedroom': Color(0xFFEDE7DC),
  'bathroom': Color(0xFFDCE8ED),
  'kitchen': Color(0xFFF2E8D5),
  'living': Color(0xFFE8E2D2),
  'dining': Color(0xFFEAE4D6),
  'office': Color(0xFFE2E6DA),
  'garage': Color(0xFFE5E5E5),
  'outdoor': Color(0xFFDDE8DC),
};

class FloorPlanPainter extends CustomPainter {
  FloorPlanPainter(this.rooms);

  final List<RoomShape> rooms;

  @override
  void paint(Canvas canvas, Size size) {
    final fit = computeFit(rooms, size);
    final wall = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = const Color(0xFF3A362E);
    for (final room in rooms) {
      final rect = fit.map(room);
      canvas.drawRect(
          rect, Paint()..color = _kindFills[room.kind] ?? const Color(0xFFEDEAE2));
      canvas.drawRect(rect, wall);
      if (rect.width > 44 && rect.height > 24) {
        final painter = TextPainter(
          text: TextSpan(
            text: room.label,
            style: const TextStyle(color: Color(0xFF3A362E), fontSize: 9),
          ),
          textDirection: TextDirection.ltr,
          maxLines: 2,
          ellipsis: '…',
        )..layout(maxWidth: rect.width - 6);
        painter.paint(
            canvas,
            Offset(rect.left + (rect.width - painter.width) / 2,
                rect.top + (rect.height - painter.height) / 2));
      }
    }
  }

  @override
  bool shouldRepaint(FloorPlanPainter oldDelegate) => oldDelegate.rooms != rooms;
}

/// One level of a concept's plan, sized for a card.
class FloorPlanView extends StatelessWidget {
  const FloorPlanView({super.key, required this.rooms, this.height = 220});

  final List<RoomShape> rooms;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(painter: FloorPlanPainter(rooms)),
    );
  }
}

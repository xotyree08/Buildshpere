# Frozen plans

Eight complete buildings, captured once and then left alone.

They are **literal JSON, not generator output**, and that is the whole point.
A snapshot taken from `generateConcepts()` moves every time the layout engine
moves, so it never tells you whether the thing you changed was the thing that
changed the number — it only ever tells you the layout is different, which you
already knew. These do not move. When a design-health score against one of
them changes, something in the scoring changed, and that is a question worth
being asked.

Regenerate them only when you mean to: when the model schema itself changes in
a way that makes them unreadable. Never to make a failing test pass.

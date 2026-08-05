import Link from "next/link";

import { SPHERES } from "@/lib/spheres";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <h1>BuildSphere</h1>
        <p>
          Design, visualize, budget, engineer, permit, and manage the construction of a custom
          home — from first sketch through decades of ownership. Eight integrated systems, one
          source of truth.
        </p>
        <p>
          <Link className="btn" href="/app">
            Design your home
          </Link>
        </p>
      </section>
      <section className="grid">
        {SPHERES.map((s) => (
          <div className="card" key={s.key}>
            <h2>{s.name}</h2>
            <p>{s.tagline}</p>
            <span className="phase">Phase {s.phase}</span>
          </div>
        ))}
      </section>
    </main>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { runDesignLoop } from "@/lib/engine/loop";
import { loadProject, saveProject } from "@/lib/store";
import type { DesignBrief } from "@/lib/types";

/**
 * The sample project: one click from the landing page to the full
 * document suite, no account, no interview. Generated deterministically
 * in this browser by the same engines as a real project — it IS a real
 * project, stored locally like any other, deletable like any other.
 */

const SAMPLE_ID = "sample-home";

const SAMPLE_BRIEF: DesignBrief = {
  id: `${SAMPLE_ID}-brief-1`,
  projectId: SAMPLE_ID,
  version: 1,
  program: {
    familySize: 4,
    bedrooms: 4,
    bathrooms: 3.5,
    office: true,
    gym: false,
    theater: false,
    outdoorKitchen: true,
    garageBays: 2,
  },
  style: "craftsman",
  interiors: {},
  lifestyleNotes:
    "A family that cooks together and works from home. Morning light in the kitchen, a porch worth sitting on.",
};

const SAMPLE_FINISHES = {
  siding: "fiber_cement",
  roofing: "cedar_shake",
  windows: "clad_wood",
  flooring: "hardwood",
  countertops: "quartz",
  cabinets: "semi_custom",
};

export default function SamplePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Idempotent: revisiting the sample reuses the stored copy so any
    // revisions the visitor made survive their curiosity.
    if (loadProject(SAMPLE_ID)) {
      router.replace(`/app/project/${SAMPLE_ID}`);
      return;
    }
    // An estate lot: a 4-bed single-story with an outdoor kitchen needs
    // real ground. The showcase must fit its own site plan — a sample
    // wearing setback violations sells nothing.
    const packages = runDesignLoop(SAMPLE_BRIEF, {
      lotWidthFt: 90,
      lotDepthFt: 150,
      budgetCents: 685_000_00,
      regionCode: "US_NATIONAL",
      finishes: SAMPLE_FINISHES,
    });
    const saved = saveProject({
      project: {
        id: SAMPLE_ID,
        ownerId: "local",
        name: "The Sample Home",
        addressText: null,
        lotWidthFt: 90,
        lotDepthFt: 150,
        budgetCents: 685_000_00,
        status: "designing",
      },
      brief: SAMPLE_BRIEF,
      packages,
      regionCode: "US_NATIONAL",
      finishes: SAMPLE_FINISHES,
    });
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    router.replace(`/app/project/${SAMPLE_ID}`);
  }, [router]);

  return (
    <main>
      <div className="card" style={{ maxWidth: 560, margin: "4rem auto", textAlign: "center" }}>
        {error ? (
          <p className="status-fail">{error}</p>
        ) : (
          <p>Drawing the sample home — plans, pricing, and documents are being generated in your browser…</p>
        )}
      </div>
    </main>
  );
}

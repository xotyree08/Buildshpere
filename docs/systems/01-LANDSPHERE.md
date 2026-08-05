# LandSphere — Site Intelligence

**Purpose:** Determine whether a property can support construction *before* design begins, and constrain everything downstream (design envelope, budget, permits) to what the land actually allows.

**Primary users:** Homeowners, investors, land owners, real estate developers. Surveyors and civil engineers contribute verified data.

## Core Capabilities

### Property identification
- Parcel search by address, parcel number, or GPS/map selection
- County parcel database and GIS integration
- Survey upload (PDF/CAD) with extraction of boundaries and easements

### Site analysis
- Topographic analysis and digital terrain model (DTM)
- Slope analysis (buildable area, cut/fill implications)
- Flood zone detection (FEMA layers where available)
- Wetland detection
- Utility availability (water, sewer/septic, power, gas, broadband)

### Regulatory screening
- Zoning review: permitted use, density
- Setback analysis (front/side/rear, corner-lot rules)
- Height restrictions and lot coverage limits
- HOA detection and flagging of private covenants

### Feasibility outputs
- Driveway feasibility (grade, sight lines, curb cuts)
- Garage and pool placement options
- Recommended home size for the lot
- **Buildability Score** — a composite 0–100 rating
- Risk assessment (flood, slope, access, utility, regulatory risks with severity)

## Primary Flow

1. User locates the parcel (address search or map pin).
2. LandSphere pulls parcel geometry, zoning, and GIS layers; user optionally uploads a survey.
3. Analysis runs; results are summarized as the **Site Intelligence Report**.
4. The report's constraints (setbacks, buildable envelope, height, coverage) are handed to DesignSphere as hard inputs.

## Key Data Entities

| Entity | Notes |
| --- | --- |
| `Parcel` | Geometry, jurisdiction, APN, zoning designation |
| `SiteAnalysis` | One per run: layers evaluated, findings, scores |
| `SiteConstraint` | Machine-readable constraint (type, value, source) consumed by DesignSphere |
| `SiteIntelligenceReport` | Human-readable report generated from an analysis |
| `SurveyDocument` | Uploaded survey with extraction results and verification status |

## Integrations

County parcel APIs · GIS services · mapping · flood/wetland data layers · weather.

## Depends on / feeds

- **Feeds:** DesignSphere (buildable envelope, placement), CostSphere (sitework cost drivers), PermitSphere (jurisdiction identification).
- **Depends on:** external data coverage; where county data is unavailable, falls back to user-supplied documents with clear confidence labeling.

## Phase mapping

Not in Phase 1 MVP (design can start from user-entered lot dimensions). Full LandSphere lands alongside Phase 3 permitting, since both depend on jurisdiction data.

## Open questions

- Data licensing and coverage per county; fallback UX where GIS data is missing.
- Whether the Buildability Score needs professional (surveyor) sign-off before being shown as more than an estimate.
- Liability language: the report is a screening tool, not a substitute for a survey or geotechnical report.

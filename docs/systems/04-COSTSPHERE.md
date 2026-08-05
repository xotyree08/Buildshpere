# CostSphere — Real-Time Budgeting

**Purpose:** Keep a live, honest number attached to every design decision — from first concept through construction draws — so cost surprises happen on screen, not on site.

**Primary users:** Homeowners (budget tracking), contractors (estimates, bids), lenders (draw validation).

## Core Capabilities

### Estimation
- Calculates labor, materials, equipment, permits, soft costs, professional fees, and contingency
- **Live Bill of Materials** and material takeoffs derived from the parametric design model
- Regional pricing (location-adjusted unit costs) and cost history tracking

### Budget management
- Budget tracking against the user's stated budget from the DesignBrief
- Change-order cost impact (with BuildSphere Pro)
- Cost history: every revision's estimate is retained for trend visibility

### Value engineering
When a design goes over budget, CostSphere:
- Suggests lower-cost alternatives (materials, spans, footprint, roof complexity) ranked by savings and design impact
- Updates project cost instantly when an alternative is accepted

## Primary Flow

1. Every `DesignRevision` triggers a takeoff → `Estimate` with line items by CSI-style category.
2. The estimate vs. budget delta is always visible in the project header.
3. Over budget → Value Engineer AI proposes alternatives; accepting one creates a new revision and re-estimates.
4. During construction, actuals (invoices, purchase orders from BuildSphere Pro) post against the same line-item structure.

## Key Data Entities

| Entity | Notes |
| --- | --- |
| `Estimate` | One per design revision; total + confidence range |
| `EstimateLineItem` | Category, quantity, unit, unit cost, source (takeoff vs. allowance) |
| `UnitCost` | Regional price book entry with effective dates |
| `ValueEngineeringSuggestion` | Proposed alternative, savings, status |
| `BudgetActual` | Posted actuals during construction (Phase 4) |

## Accuracy discipline

- Every estimate carries a **confidence range**, not a single false-precision number; the range narrows as design detail increases (concept → engineered → bid).
- "Average estimate accuracy versus final construction cost" is a platform KPI — estimate vs. actual deltas are stored and fed back into the price book.

## Depends on / feeds

- **Depends on:** DesignSphere quantities, regional price data, MaterialSelection.
- **Feeds:** DesignSphere (budget constraint on generation), BuildSphere Pro (budget baseline), lenders (draw schedules).

## Phase mapping

**Phase 1 core:** takeoff + estimate + budget delta + basic value engineering. Actuals tracking arrives with Phase 4 construction management.

## Open questions

- Price data sourcing (RSMeans-style licensed data vs. supplier feeds vs. contractor-contributed).
- How contingency defaults scale with design maturity and region.

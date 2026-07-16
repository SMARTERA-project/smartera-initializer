# Positional contract of the `dimensions` array — request for confirmation

This document summarizes **how, from reverse-engineering the frontend (`fe`) and the GraphQL resolver (`api/resolvers.js`), I inferred that the datapoints' `dimensions` arrays must be structured** for charts and queries to work, and **which transformations I therefore applied to the data**. With no documentation available, I reconstructed it by reading the code.

**What I'm asking:** please confirm whether this reading (table §3) and the transformations (§4) reflect what your code expects. Open questions are in §6.

---

## 1. Types of positional constraint found

The order of the labels inside `dimensions` is constrained by several places in the code. They come in two natures — **explicit** and **implicit**:

| # | Constraint | Where | Nature |
|---|---|---|---|
| A | **Fixed-index** read `dimensions[K]` / `dimensions.at(-1)` | Frontend (tabs/charts) | Explicit: that index must hold that category |
| B | **"First label matching a criterion"** — `find(dim => ...)` / regex / `includes` | Frontend | **Implicit**: if several labels match, it matters which comes **first** (see the "Mode" case, §4) |
| C | `filterBy: N` + `filter: [...]` → `$in: [ { $arrayElemAt: ["$dimensions", N] }, filter ]` | GraphQL resolver | Explicit: index `N` (0-based) must hold a value from `filter` |
| D | `sortBy: "year"` → `{ $toInt: { $arrayElemAt: ["$dimensions", -1] } }` | GraphQL resolver | Explicit: the **year** must be the **last** element (otherwise `$toInt` errors) |
| — | `dimensions: [...]` → `{ $all: [...] }` (+ `$nin` for `exclude`) | GraphQL resolver | **Not** positional (membership): order doesn't matter |

Constraint **B** is the trickiest: nowhere is it written "this label must be at position X", but since the code takes the *first* label matching a condition, the relative position becomes a de-facto constraint.

---

## 2. How labels are identified: the `obsHR` field

Each datapoint has an `obsHR` field (a **key → label** object in our DB that I mentioned some message above), e.g. `{ sex: 'Females', time_period: '2021', nst07: 'Products of agriculture', ... }`. The transformations place labels **by content** — i.e. they find the right label via its `obsHR` key, not by trusting its starting position. The relevant keys are in §5.

---

## 3. Required layout per survey

"pos. K → concept" = that 0-based index must hold that dimension. "Year last" = required by `sortBy:"year"`. "Cause": A/B/C/D as in §1.

| Survey | Required fixed positions | Year last? | filterBy | Cause |
|---|---|---|---|---|
| CENS_21COBHS_R3 | 1 → birth country, 2 → household type, 3 → **sex** | No | 3 = "Total" | A (1,2) + C (3) |
| CENS_21CTZ_R3 | 1 → citizenship, 3 → **sex** | No | 3 = "Total" | A (1) + C (3) |
| CENS_21M_R3 | 1 → marital status, 2 → **sex** | No | 2 = "Total" | A (1) + C (2) |
| DEMO_R_GIND3 | (indicator selected by membership) | **Yes** | — | D |
| NAMA_10R_3GVA | 1 → unit/currency, 4 → **year** | **No** (year at 4) | — | A |
| NAMA_10R_3GDP | — | **Yes** | — | D |
| BD_SALGE1_NACE_R | 1 → employment type (SBS indicator), 2 → NACE sector | No | — | A |
| BD_HGNACE_R | 2 → NACE activity | **Yes** | — | A + D |
| BD_SALGE1_SIZE_R | 2 → size class | **Yes** | — | A + D |
| ISOC_R_IUSE_I | 1 → internet-use activity | **Yes** | — | A + D |
| ISOC_R_CI_IT_EN2 | 1 → industry, 2 → enterprise size, 3 → speed, 4 → **unit**, 6 → year | **Yes** (year at 6 = last) | 4 = "Percentage of enterprises" | A + C (4) + D |
| EF_LUS_ALLCROPS | 3 → land-use category | **Yes** | — | A + D |
| NAMA_10R_3EMPERS | 5 → **year** | **Yes** (5 **and** last → needs len = 6) | — | A + D (in conflict, §6) |
| TRAN_R_RAPA | 2 → origin/loading region, 3 → destination region | **Yes** | 2 = pilot region | A (3) + C (2) + D |
| HLTH_CO_DISCH1T | 1 → **age group**, 5 → diagnosis | **Yes** | 1 = "Total"/age groups | A (5) + C (1) + D |
| PAT_EP_TOT | 3 → **region** (NUTS1) | **Yes** | 3 = pilot region | C (3) + D |
| ROAD_GO_NA_RL3G | 0 → **goods type** (nst07) | **Yes** | — | **B** (0) + D |

---

## 4. Transformations applied to the data (what was done and why)

All transformations operate **by content** (via `obsHR`), so they work regardless of the starting order and are safely repeatable.

1. **General reordering**: for each survey in the table, the listed labels are placed at the required indices; the remaining ones fill the free slots preserving their original order. Rationale: satisfy constraints A and C.

2. **Year last**: for each survey that sorts by year ("Year last = Yes"), the year is moved to the end (constraint D). **General rule**: even for surveys **not listed** in the table, wherever a 4-digit string (the year) exists, it is moved to the last position, because the resolver uses it as `dims[-1]`.

3. **Targeted moves to fix C/B constraints** where a label had ended up in the wrong place. Examples:
   - **PAT_EP_TOT**: the region was at position 0, but `filterBy: 3` expects it at index 3 → it was moved to 3.
   - **census (sex)**: the sex dimension was not at the index expected by `filterBy` → moved back to 3 (or 2 for CENS_21M_R3).
   - **ROAD_GO_NA_RL3G ("Mode" case, constraint B)**: the frontend derives the "Mode"/goods entry with `find(dim => !['Annual', year].includes(dim))`, i.e. it takes the **first** label that isn't `Annual` or the year. Since it **doesn't exclude the region**, if the geo came before the goods type the chart put the geo under "Mode" (e.g. "Lovech"). Fix: the goods type (`nst07`) is forced to **position 0**, so `find` picks it. This is a constraint that is **not explicit** in either frontend or backend, but emerges from the "take the first" behavior.

4. **Truncation (only where constraints are incompatible)**: for `NAMA_10R_3EMPERS` the frontend wants the year at fixed index **5** and the backend wants it **last**: reconcilable only if the survey has 6 dimensions. If it has more, I **removed the trailing dimensions** (after the year) so index 5 also becomes the last. **The labels removed from `dimensions` remain available in the `obsHR` field**, and the document is flagged with `truncated: true`. (Non-destructive alternative: have the frontend read the year via regex instead of `dimensions[5]` — see §6.)

---

## 5. Concepts (`obsHR` keys) used

- sex → `sex`; citizenship → `citizen`; birth country → `c_birth`; household type → `hhstatus`; marital status → `marsta`
- unit → `unit`; year → `time_period`; NACE sector / industry → `nace_r2`; SBS indicator → `indic_sbs`; enterprise size class → `sizeclas`; internet speed / ISOC indicator → `indic_is`; enterprise size (persons employed) → `size_emp`
- land-use category → `crops`; goods type → `nst07`; loading/unloading region → `c_load`/`c_unload`; age group → `age`; diagnosis → `icd10`

---

## 6. Open questions / conflicts to confirm

1. **NAMA_10R_3GVA**: the frontend reads the year at fixed index **4** and the backend sorts by `value` (not year) → here the year must **not** be last, but at 4. Confirm (and that the survey has 5 dimensions, so 4 = last)?

2. **NAMA_10R_3EMPERS**: the year is read at fixed index **5** (frontend) **and** required last (backend) → reconcilable only when the survey has exactly 6 dimensions. When it has more, satisfying both means truncating the tail — and with the current Data Dashboard version **any new dimension Eurostat adds in the future would be silently lost**. The proper fixes are either (a) have the frontend read the year via regex (position-independent), or (b) adopt the approach I proposed: a **key→value (object) structure** instead of an **index→value (array) structure**, so nothing depends on position at all. Until one of the two is chosen, we should monitor this dataset every time Eurostat update it , in order to catch up on time an eventual dimensions length change.
3. **ROAD_GO_NA_RL3G**: the goods type is currently derived by *exclusion* (`find(dim => !['Annual', year].includes(dim))`), which is fundamentally fragile — the first non-excluded label can be **anything** (region, unit, freq, …), not just the region, so no blacklist is ever safe. Options: (a) DB-side, guarantee the goods type at position 0 (actual); or (b) frontend, identify the goods type **by its `obsHR` key (`nst07`)** instead of by exclusion/position — the same key→value fix as point 2, which removes the fragility entirely. Is ok to put goods type at position 0 (a)?

4. **Surveys that sort by year but don't read it at a fixed index** (BD_HGNACE_R, BD_SALGE1_SIZE_R, ISOC_R_IUSE_I, EF_LUS_ALLCROPS, TRAN_R_RAPA, HLTH_CO_DISCH1T): the only constraint is "year last". Confirm the frontend always reads them via regex and never at a fixed index?

5. **`filterBy` indices**: confirm the indices in the table (sex at 3/3/2, unit at 4, region at 2/3, age at 1). If you change those indices on the query side, the data must be re-aligned.

6. **`DEMO_R_GIND3` / `NAMA_10R_3GDP`**: I inferred their "last element" is the **year** (because they sort by year = `dims[-1]`), while the frontend calls it generically "ageGroup". Confirm it's the year?

---

## 7. Note

All of the above is the result of reverse-engineering the frontend + resolver, with no shared documentation. If an official spec of the `dimensions` layout exists (expected concepts/positions per survey), please share it: it would spare having to infer these constraints — especially the **implicit** ones (like "Mode") — from the code.
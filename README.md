# Smartera Datapoints Processing Flow

This document describes the processing and normalization flow applied to the Smartera `datapoints` collection.

## Data Ingestion

* Imported **OSM** data using the OSM script.
* Imported **BIH** data using the BIH script.

  * **Note:** the Python (`.py`) implementation must be used instead of the JavaScript (`.js`) version.
* Imported **Analytics** data using [etl-nodejs](etl-nodejs/README.md):

  1. Save the data to the database.
  2. Export the data to a file.
  3. Import the exported data into the target collection.

  * **Note:** now there is a dedicated analytics section
* Added a `survey` field to all documents where it was missing, using `surveyName` as the value when available.
* Converted all `survey` values to uppercase.
* Imported the available datasets through **IDRA**, **Orion**, **Source connector** and **Data model mapper**.
* Manually integrated the only dataset not available through the IDRA/Orion flow: `NAMA_10R_3NLP`.

  * It appears to exist in IDRA but not in Orion. This should be verified.

## Region Normalization (deprecated)

All region values containing `NON_NUTS` or the equivalent placeholder value were replaced with the corresponding value from the `geo` field.

* **Note:** This was integrated directly in Data-model-mapper

## Dimension Reordering

The datapoint dimension reordering procedure is based on the following scripts:

* `reorder-dimensions.parallel` — main script.
* `reorder-dimensions` — dependency.
* `category-to-obshr` — dependency.
* `category-to-obshrV0` — obsolete/deprecated version.

Two `.md` documentation files describing the reordering procedure are available in the related GitHub issue [IP Whitelist collection for Data Platform access](https://github.com/SMARTERA-project/SMARTERA-Open-Call/issues/9#issuecomment-4845731247) and [IP Whitelist collection for Data Platform access](https://github.com/SMARTERA-project/SMARTERA-Open-Call/issues/9#issuecomment-4869060948) or in the attached documents [Reordering Documentation part 1](Dimensions-order-part-1.md) and [Reordering Documentation part 2](Dimensions-order-part-2.md)

The main entry point is:

```text
reorder-dimensions.parallel
```

## Year Dimension Reordering (deprecated)

The initial dimension reordering is not sufficient because year dimensions must always be placed at the end of the dimensions array.

The `yearToLast` script, originally named `year-to-last`, fixes this issue.

Surveys already handled by `reorder-dimensions.parallel` are not excluded from `yearToLast` so run `yearToLast` before.

* **Note:** now integrated in `reorder-dimensions.parallel`

### Execution Order

Running `yearToLast` after `reorder-dimensions.parallel` may break structures already fixed by the generic reordering procedure.

The correct order is therefore:

```text
yearToLast
        ↓
reorder-dimensions.parallel
```

`reorder-dimensions.parallel` should preferably be executed only once, after `yearToLast`.

### Avoiding `yearToLast` (done)

For specific surveys, `yearToLast` may be unnecessary if the year position is configured directly in `POSITION_CONFIG`:

```js
SURVEY_X: {
  last: ['year']
}
```

The corresponding mapping must also exist in `category-to-obshr`:

```json
{
  "year": "time_period"
}
```

Always verify that the actual ObsHR field is `time_period`.

* **Note:** It now can be avoided because it is integrated in `reorder-dimensions.parallel`

## `truncate-year-last`

The previous steps are still not sufficient.

The `truncate-year-last` script must be executed because dimensions must respect a fixed positional order and the year dimension must be the final dimension.

### Warning

If the script encounters a year dimension already present as the final element, it may remove it.

The script must therefore be verified to be safe before execution.

The scope is intentionally restricted through `TARGET_SURVEYS`.

> **Do not make `truncate-year-last` universal.**
>
> Doing so could delete legitimate final dimensions from unrelated surveys.

## `PAT_EP_TOT` (deprecated)

`PAT_EP_TOT` requires additional dimension reordering through:

```text
swap-pat-geo
```

* **Note:** It now can be avoided because it is integrated in `reorder-dimensions.parallel`

### Possible Configuration-Based Alternative (done)

The script may be avoided by adding the following configuration to `POSITION_CONFIG`:

```js
PAT_EP_TOT: {
  pins: {
    3: 'pat_region'
  },
  last: ['pat_year']
}
```

Position `3` is required by the GraphQL `filterBy` operation for NUTS1 data.

The corresponding `category-to-obshr` mappings are:

```json
{
  "pat_region": "geo",
  "pat_year": "time_period"
}
```

Before using this configuration, verify in the database that:

* `pat_region` maps to `geo` in `obsHR`.
* `pat_year` maps to `time_period` in `obsHR`.
* The stored values are correct.

* **Note:** It now can be avoided because it is integrated in `reorder-dimensions.parallel`

## `ROAD_GO_NA_RL3G` (deprecated)

`ROAD_GO_NA_RL3G` currently requires:

```text
reorder-road-goods
```

The script may be avoided by configuring the survey in `POSITION_CONFIG`:

```js
ROAD_GO_NA_RL3G: {
  pins: {
    0: 'rl3g_goods'
  },
  last: ['rl3g_year']
}
```

The corresponding `category-to-obshr` mappings are:

```json
{
  "rl3g_goods": "nst07",
  "rl3g_year": "time_period"
}
```

Verify the ObsHR mappings and stored database values before replacing `reorder-road-goods` with the generic reordering procedure.

* **Note:** It now can be avoided because it is integrated in `reorder-dimensions.parallel`

## `CENS_21CTZ_R3` (deprecated)

`CENS_21CTZ_R3` requires an additional positional fix.

The original implementation used:

```text
swap-positions
```

The preferred and safer implementation is:

```text
reorder-one-survey
```

However, this survey may potentially be handled directly by `reorder-dimensions.parallel`.

Verify the following `POSITION_CONFIG` configuration:

```js
CENS_21CTZ_R3: {
  pins: {
    1: 'citizenship',
    3: 'ctz_sex'
  }
}
```

The corresponding category-to-ObsHR mappings are:

```js
{
  citizenship: 'citizen',
  ctz_sex: 'sex'
}
```

If these positions and mappings are correct, `reorder-one-survey` may be unnecessary and `CENS_21CTZ_R3` can be handled by `reorder-dimensions.parallel`.

* **Note:** It now can be avoided because it is integrated in `reorder-dimensions.parallel`, although Data dashboard seems to be already adapted to an *age* position instead of *sex* so better to keep in mind for future reordering.

## Recommended Execution Order

```text
1. Import OSM data using osm
2. Import BIH data using bih
3. Import Analytics data through etl-nodejs (or using analytics)
4. Populate missing survey fields from surveyName using create-survey
5. Convert survey values to uppercase using normalize-survey-case
6. Import datasets through IDRA and Source connector
7. Manually import the missing NAMA_10R_3NLP dataset using NAMA_10R_3NLP.sh
8. Replace NON_NUTS regions with geo values [if required]
9. Run yearToLast                           [if required]
10. Run reorder-dimensions.parallel
11. Run truncate-year-last
12. Run swap-pat-geo                        [if required]
13. Run reorder-road-goods                  [if required]
14. Run reorder-one-survey                  [if required]
```

## Future Cleanup

The preferred long-term solution is to move survey-specific positional fixes into `POSITION_CONFIG` and `category-to-obshr` (**done**).

The following scripts could potentially become unnecessary (now **are**):

* `yearToLast`
* `swap-pat-geo`
* `reorder-road-goods`
* `reorder-one-survey`

Before removing any script, verify:

* Dimension positions.
* Category-to-ObsHR mappings.
* Actual `obsHR` fields stored in MongoDB.
* GraphQL `filterBy` positional requirements.
* GraphQL `sortBy` requirements for year/time dimensions.

It's better to use `reorder-dimensions.parallel` as the single generic dimension-reordering procedure wherever possible, but the final goal is use Data model mapper to a single passage instead of this two-phase passage (first phase: Eurostat - Orion - Source connector - Data model mapper - DB, second phase: DB - all these tools - DB)

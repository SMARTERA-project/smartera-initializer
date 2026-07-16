# Positional map of the `dimensions` array

Reference for all the assumptions the Data dashboard frontend makes about the position / content of the elements in the `data.datapoints[].dimensions` array returned by the GraphQL queries.

## Access-method legend

| Method | Example in code | Robustness |
|---|---|---|
| **Fixed index** | `it.dimensions[1]`, `dims[5]` |  Breaks if the backend reorders the labels |
| **Last / second-to-last position** | `dimensions.at(-1)`, `dimensions[length - 1]` | Depends on how many labels arrive |
| **Exact value match** | `dimensions.includes('Males')` |  Position-independent |
| **Substring match** | `dim.includes('age')`, `dim.toLowerCase().includes('education')` |  Position-independent |
| **Regex match** | `dimensions.find(d => /^\d{4}$/.test(d))` |  Position-independent |
| **Exclusion match** | `dimensions.find(d => d !== 'Annual' && !/^\d{4}$/.test(d))` |  Position-independent |

> Note: the **Fixed index** and **Last/second-to-last** entries are the ones that keep working *only* if a given label sits in a given position. They are the ones this document is meant to track.

---

## GeneralTab.tsx

| Query | Survey (code) | Extracted field | Position / method | Notes |
|---|---|---|---|---|
| `FetchPopulationBySexAge` | `demo_r_pjangrp3` | ageGroup | regex `/\d+ years/` | any position |
| | | gender | value match: `includes('Males')` → `includes('Females')` → otherwise `'Total'` | |
| `FetchPopulationBySexTotal` | `demo_r_pjangrp3` | gender | value match `Males` / `Females` / `Total` | |
| `FetchTotalPopulationChange` | `demo_r_gind3` | ageGroup (used as label) | **`dimensions.at(-1)` → last position** | |
| `FetchNetMigrations` | `demo_r_gind3` | ageGroup | **`dimensions.at(-1)` → last position** | |
| `FetchAllDemographicData` | `cens_21cobhs_r3` | birthCountry | **`dimensions[1]` → position 1** | |
| | | householdType | **`dimensions[2]` → position 2** | |
| | | ageGroup | regex `/\d+ years/` | |
| | | gender | value match `Males` / `Females` / `Total` | |
| `FetchPopulationByCitizenshipCountry` | `cens_21ctz_r3` | label (citizenship) | **`dimensions[1]` → position 1** | |
| `FetchPopulationByMaritalStatus` | `cens_21m_r3` | label (marital status) | **`dimensions[1]` → position 1**; also filters out rows where `dimensions[1] === 'Total'` | |
| `FetchPopulationDensity` | `demo_r_d3dens` | year (label) | regex `/\d{4}/` (also for sorting) | |

---

## EconomyTab.tsx

| Query | Survey (code) | Extracted field | Position / method | Notes |
|---|---|---|---|---|
| `FetchGrossValueAddedAtCurrentPrices` | `nama_10r_3gva` | ageGroup | **`dimensions[4]` → position 4** | |
| | | gender | **`dimensions[1]` → position 1** | |
| `FetchGdpPerInhabitant` | `nama_10r_3gdp` | ageGroup | **`dimensions[length - 1]` → last position** | |
| | | gender | value match `Males` / `Females` / `Total` | |
| `FetchEmployerStructure` | `bd_salge1_nace_r` | employmentType | **`dimensions[1]` → position 1** | |
| | | sector (NACE) | **`dimensions[2]` → position 2** | |
| `FetchTopEmploymentCategories` | `bd_hgnace_r` | label | **`dimensions[2]` → position 2** | |
| `FetchBusinessSizeClass` | `bd_salge1_size_r` | label | **`dimensions[2]` → position 2** | |
| `FetchPatentApplication` | `pat_ep_tot` | year | regex `/\d{4}/` | |
| `FetchHighGrowingEnterprises` | `bd_hgnace_r` | label | **`dimensions[2]` → position 2** | |
| `FetchEconomyActivitiesBIH` | `STS_05.xlsx` | label | **`dimensions[1]` → position 1** | |
| `FetchTotalNetEarningsBIH` | `LAB_01.xlsx` | label | **`dimensions[1]` → position 1** (also for the `localeCompare` sort) | |
| `FetchGrossPayBIH` | `LAB_01.xlsx` | label | **`dimensions[1]` → position 1** | |
| `FetchTransportedGoodsIndexBIH` | `STS_04.xlsx` | label (grouping) | **`dimensions[1]` → position 1** | used here in the `empBySector23` state |
| `FetchTouristNightsBIH` | `TUR_01.xlsx` | month | regex `/^\d{4}-(0[1-9]\|1[0-2])$/` (`YYYY-MM` format) | |
| `FetchCompaniesBIH` | `SBS_01.xlsx` | year/period (label) | regex `/^\d{4}(-\d{2})?$/`; **fallback `dimensions[length - 1]`** if the regex doesn't match | |
| `FetchEmploymentBIH` | `SBS_01.xlsx` | label (sector) | **`dimensions[1]` → position 1** | |

---

## EnablingFactorsTab.tsx

| Query | Survey (code) | Extracted field | Position / method | Notes |
|---|---|---|---|---|
| `FetchInternetUse` | `ISOC_R_IUSE_I` | label (activity) | **`dimensions[1]` → position 1** | |
| `FetchInternetFrequency` | `ISOC_R_IUSE_I` | label (frequency) | **`dimensions[1]` → position 1** | |
| `FetchInternetEnterprises` | `ISOC_R_CI_IT_EN2` | industry | **`dimensions[1]` → position 1** | |
| | | size (enterprise size) | **`dimensions[2]` → position 2** | |
| | | speed | **`dimensions[3]` → position 3** | |
| | | year | **`dimensions[6]` → position 6** | |

---

## EnvironmentTab.tsx

| Query | Survey (code) | Extracted field | Position / method | Notes |
|---|---|---|---|---|
| `FetchHeatingDays` | `NRG_CHDDR2_A` | year | regex `/^\d{4}$/` | |
| `FetchCoolingDays` | `NRG_CHDDR2_A` | year | regex `/^\d{4}$/` | |
| `FetchLandUse` | `EF_LUS_ALLCROPS` | category (label) | **`dimensions[3]` → position 3** | grouping key |
| `FetchRecyclingFacilities` | `ENV_WASFAC` | year (for sort only) | regex `/^\d{4}$/` | |
| `FetchRecyclingPlusFacilities` | `ENV_WASFAC` | year (for sort only) | regex `/^\d{4}$/` | |
| `FetchEnergyRecovery` | `ENV_WASFAC` | year (for sort only) | regex `/^\d{4}$/` | |
| `FetchMiningBIH` | `IND_01.xlsx` | month | regex `/^\d{4}-(0[1-9]\|1[0-2])$/` (`YYYY-MM`) | |

---

## GovernanceTab.tsx

| Query | Survey (code) | Extracted field | Position / method | Notes |
|---|---|---|---|---|
| `FetchEmployees` | `nama_10r_3empers` | year (label) | **`dimensions[5]` → position 5** | explicit code comment `// year as label` |
| `FetchEmployeesNr` | `nama_10r_3empers` | — | no positional access (sorts by `value`) | |
| `FetchPeopleNr` | `demo_r_pjanaggr3` | — | no positional access (sorts by `value`) | |
| `FetchRD` | `RD_E_GERDREG` | year (for sort only) | regex `/^\d{4}$/` | |

---

## MobilityTab.tsx

| Query | Survey (code) | Extracted field | Position / method | Notes |
|---|---|---|---|---|
| `FetchTransportedGoodsIndexBIH` | `STS_04.xlsx` | period | regex `/^\d{4}(?:-[1-4]Q)?$/` (`TIME_RE` constant, e.g. `2011-1Q`) | |
| `FetchTransportedGoods` | `road_go_na_rl3g` | year | regex `/^\d{4}$/` | |
| `FetchTransportedGoodsBIH` | `TRA_01 1.xls` | period | regex `/^\d{4}(-Q[1-4])?$/` | |
| `FetchTopTransported` | `road_go_na_rl3g` | label (goods) | exclusion match: `dim !== 'Annual' && !/^\d{4}$/.test(dim)` | |
| `FetchImportedGoods` | `ROAD_GO_NA_RU3G` | year | regex `/^\d{4}$/` | |
| `FetchElectricVehicles` | `TRAN_R_ELVEHST` | year | regex `/^\d{4}$/` | |
| `FetchTransportedDetails` | `road_go_na_rl3g` | year | regex `/^\d{4}$/` | |
| | | mode | exclusion match: `!['Annual', year].includes(dim)` | |
| `FetchRailwayPassengers` | `TRAN_R_RAPA` | label (destination region) | **`dimensions[3]` → position 3** | explicit comment `// destination region` |

---

## ServicesTab.tsx

| Query | Survey (code) | Extracted field | Position / method | Notes |
|---|---|---|---|---|
| `FetchAllHospitalisations` | `HLTH_CO_DISCH1T` | year | regex `/^\d{4}$/` | |
| `FetchTopDiagnoses` | `HLTH_CO_DISCH1T` | label (diagnosis) | **`dimensions[5]` → position 5** | |
| `FetchHospitalisationAges` | `HLTH_CO_DISCH1T` | ageGroup | **`dimensions[1]` → position 1** | grouping key |
| `FetchYouthNeet` | `EDAT_LFSE_22` | year | regex `/^\d{4}$/` | |
| | | gender | value match: `dim === 'Males' \|\| dim === 'Females'` | |
| | | ageGroup | substring match: `dim.includes('age')` | |
| `FetchEducationalLevel` | `EDUC_UOE_ENRA14` | year | regex `/^\d{4}$/` | |
| `FetchEnrollement` | `EDUC_UOE_ENRT06` | label | substring match: `dim.toLowerCase().includes('education')` | |
| `FetchDisposalCapacity` | `ENV_WASFAC` | row filter | value match: `dimensions.includes('Rest capacity - cubic metres')` | then year via regex `/^\d{4}$/` |

---

## Analysis.tsx (page, not a tab)

| Query | Extracted field | Position / method | Notes |
|---|---|---|---|
| `FetchSmartness` | "overall" node | value match: `dimensions.some(d => ['SmartnessIndex', 'smaertnessIndex'].includes(d))` | also handles the typo `smaertnessIndex` |

---

## Generic utility: `utils/mapDatapoints.ts`

A fully position-based generic transform, applied to generic datapoints:

| Field | Position / method |
|---|---|
| year | **`dimensions[len - 1]` → last position** |
| region | **`dimensions[len - 2]` → second-to-last position** |
| category | **`dimensions.slice(0, len - 2)`** → everything except the last two |

(Same logic duplicated in `utils/mapDatapoints.js`.)

---

## Summary: fixed-index accesses

These are the dependencies that require a specific label to sit at a specific position:

| Survey | Query | Position → field |
|---|---|---|
| `cens_21cobhs_r3` | FetchAllDemographicData | `[1]` → birthCountry, `[2]` → householdType |
| `cens_21ctz_r3` | FetchPopulationByCitizenshipCountry | `[1]` → citizenship |
| `cens_21m_r3` | FetchPopulationByMaritalStatus | `[1]` → marital status |
| `nama_10r_3gva` | FetchGrossValueAddedAtCurrentPrices | `[1]` → gender, `[4]` → ageGroup |
| `bd_salge1_nace_r` | FetchEmployerStructure | `[1]` → employmentType, `[2]` → sector |
| `bd_hgnace_r` | FetchTopEmploymentCategories / FetchHighGrowingEnterprises | `[2]` → label |
| `bd_salge1_size_r` | FetchBusinessSizeClass | `[2]` → size class |
| `STS_05.xlsx` | FetchEconomyActivitiesBIH | `[1]` → label |
| `LAB_01.xlsx` | FetchTotalNetEarningsBIH / FetchGrossPayBIH | `[1]` → label |
| `STS_04.xlsx` | FetchTransportedGoodsIndexBIH (Economy use) | `[1]` → label |
| `SBS_01.xlsx` | FetchEmploymentBIH | `[1]` → label |
| `ISOC_R_IUSE_I` | FetchInternetUse / FetchInternetFrequency | `[1]` → label |
| `ISOC_R_CI_IT_EN2` | FetchInternetEnterprises | `[1]` → industry, `[2]` → size, `[3]` → speed, `[6]` → year |
| `EF_LUS_ALLCROPS` | FetchLandUse | `[3]` → category |
| `nama_10r_3empers` | FetchEmployees | `[5]` → year |
| `TRAN_R_RAPA` | FetchRailwayPassengers | `[3]` → destination region |
| `HLTH_CO_DISCH1T` | FetchTopDiagnoses | `[5]` → diagnosis |
| `HLTH_CO_DISCH1T` | FetchHospitalisationAges | `[1]` → ageGroup |

## Summary: relative-position accesses (last / second-to-last)

| Survey | Query | Access |
|---|---|---|
| `demo_r_gind3` | FetchTotalPopulationChange / FetchNetMigrations | `at(-1)` → ageGroup/label |
| `nama_10r_3gdp` | FetchGdpPerInhabitant | `[length - 1]` → ageGroup |
| `SBS_01.xlsx` | FetchCompaniesBIH | fallback `[length - 1]` if the year regex doesn't match |
| generic (`mapDatapoints`) | — | `[len-1]` year, `[len-2]` region, `slice(0, len-2)` category |

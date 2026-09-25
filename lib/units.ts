/** Square feet in one square metre (exact international foot). Dubai sales and land prices are quoted per sq ft. */
export const SQFT_PER_M2 = 10.763910417;

export const m2ToSqft = (m2: number) => m2 * SQFT_PER_M2;

/** Convert a rate expressed per m² into the same rate per sq ft (e.g. AED/m² → AED/sq ft). */
export const perM2ToPerSqft = (v: number) => v / SQFT_PER_M2;

/** Convert a rate expressed per sq ft into the same rate per m² (e.g. AED/sq ft → AED/m²). */
export const perSqftToPerM2 = (v: number) => v * SQFT_PER_M2;

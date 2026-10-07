import { describe, expect, test } from "bun:test";
import { MESHY_MAX_IMAGES } from "../generation/meshy-client";
import { ingestionProfiles, penroseNursingChairStoolProfile } from "./profiles";
import { penroseNursingChairStool } from "./mocks/penrose";

describe("ingestion profiles", () => {
  test.each(Object.values(ingestionProfiles).map((p) => [p.slug, p] as const))("%s sends 1–4 distinct views from its source record", (slug, profile) => {
    expect(profile.slug).toBe(slug);
    expect(profile.benchmarkImages.length).toBeGreaterThanOrEqual(1);
    expect(profile.benchmarkImages.length).toBeLessThanOrEqual(MESHY_MAX_IMAGES);
    expect(new Set(profile.benchmarkImages).size).toBe(profile.benchmarkImages.length);
    for (const url of profile.benchmarkImages) expect(profile.source.images).toContain(url);
  });

  test("slugs and product ids are unique", () => {
    const profiles = Object.values(ingestionProfiles);
    expect(new Set(profiles.map((p) => p.source.productId)).size).toBe(profiles.length);
    expect(Object.keys(ingestionProfiles)).toEqual(profiles.map((p) => p.slug));
  });

  test("Penrose sends only the set packshot: the one clean shot with both chair and stool", () => {
    expect(penroseNursingChairStoolProfile.benchmarkImages).toEqual([penroseNursingChairStool.images[1]!]);
  });
});

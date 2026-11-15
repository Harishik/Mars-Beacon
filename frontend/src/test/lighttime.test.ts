import { describe, expect, it } from "vitest";
import { earthMarsLightTime } from "../engine/lighttime";

describe("Earth-Mars light time", () => {
  it("matches known geometry: opposition 2020-10-13 (0.415 AU) and conjunction 2021-10-08 (2.62 AU)", () => {
    const opp = earthMarsLightTime(Date.UTC(2020, 9, 13));
    const con = earthMarsLightTime(Date.UTC(2021, 9, 8));
    expect(opp.distanceAU).toBeGreaterThan(0.40); expect(opp.distanceAU).toBeLessThan(0.43);
    expect(con.distanceAU).toBeGreaterThan(2.55); expect(con.distanceAU).toBeLessThan(2.68);
    expect(con.oneWayS / 60).toBeGreaterThan(21); // about 22 minutes near conjunction
  });
});

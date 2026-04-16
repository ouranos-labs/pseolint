import { describe, expect, it } from "vitest";
import { loadDataSource, matchPageToData } from "../src/data-source-loader.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), "pseolint-test-datasource");

async function writeTmpJson(name: string, data: unknown): Promise<string> {
  await mkdir(TMP, { recursive: true });
  const path = join(TMP, name);
  await writeFile(path, JSON.stringify(data), "utf-8");
  return path;
}

describe("loadDataSource", () => {
  it("loads an array of records", async () => {
    const path = await writeTmpJson("array.json", [
      { url: "/templates/california-llc", data: { state: "California", fee: "$70" } },
      { url: "/templates/texas-llc", data: { state: "Texas", fee: "$300" } },
    ]);
    const records = await loadDataSource(path);
    expect(records).toHaveLength(2);
    expect(records[0].url).toBe("/templates/california-llc");
    expect(records[0].data.state).toBe("California");
  });

  it("loads an object with pages array", async () => {
    const path = await writeTmpJson("object.json", {
      pages: [
        { url: "/templates/california-llc", data: { state: "California" } },
      ],
    });
    const records = await loadDataSource(path);
    expect(records).toHaveLength(1);
  });

  it("throws on invalid JSON", async () => {
    const path = join(TMP, "bad.json");
    await writeFile(path, "not json{", "utf-8");
    await expect(loadDataSource(path)).rejects.toThrow("not valid JSON");
  });

  it("throws on missing url field", async () => {
    const path = await writeTmpJson("no-url.json", [
      { data: { state: "California" } },
    ]);
    await expect(loadDataSource(path)).rejects.toThrow('missing a "url"');
  });

  it("throws on missing data field", async () => {
    const path = await writeTmpJson("no-data.json", [
      { url: "/templates/california-llc" },
    ]);
    await expect(loadDataSource(path)).rejects.toThrow('missing a "data"');
  });
});

describe("matchPageToData", () => {
  const records = [
    { url: "/templates/california-llc", data: { state: "California" } },
    { url: "/templates/texas-llc", data: { state: "Texas" } },
  ];

  it("matches exact URL", () => {
    const match = matchPageToData("/templates/california-llc", records);
    expect(match?.data.state).toBe("California");
  });

  it("matches full URL to path", () => {
    const match = matchPageToData("https://example.com/templates/texas-llc", records);
    expect(match?.data.state).toBe("Texas");
  });

  it("returns undefined for no match", () => {
    const match = matchPageToData("/templates/florida-llc", records);
    expect(match).toBeUndefined();
  });

  it("handles trailing slash difference", () => {
    const match = matchPageToData("https://example.com/templates/california-llc/", records);
    expect(match?.data.state).toBe("California");
  });
});

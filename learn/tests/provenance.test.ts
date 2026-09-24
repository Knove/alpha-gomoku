import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface Manifest {
  schema_version: number;
  source_run: string;
  source_run_required_for_regeneration: boolean;
  artifacts: { path: string; sha256: string }[];
  declared_adaptations: string[];
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifestPath = fileURLToPath(new URL("../src/data/provenance.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

const digest = (path: string) =>
  createHash("sha256").update(readFileSync(root + path)).digest("hex");

test("checked-in learn artifacts match the provenance manifest", () => {
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.source_run, "data/runs/demo");
  assert.equal(manifest.source_run_required_for_regeneration, true);
  assert.ok(manifest.declared_adaptations.length >= 3);
  assert.ok(manifest.artifacts.length >= 5);
  for (const artifact of manifest.artifacts) {
    assert.match(artifact.sha256, /^[0-9a-f]{64}$/);
    assert.equal(digest(artifact.path), artifact.sha256, artifact.path);
  }
});

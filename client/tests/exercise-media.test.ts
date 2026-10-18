import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  mediaFor,
  demonstratedIds,
  exerciseMedia,
  muscleRegions,
} from "../src/features/gym/media";
import { createDemoPlaybackGroup } from "../src/features/gym/mediaPlayback";
import approved from "../../scripts/exercise-media-approved.json";
import catalogue from "../../server/src/gym/catalog.json";
import videoSizes from '../../cloudflare/src/media-sizes.json';

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
test("all released demonstrations are reviewed exact IDs with local immutable and verified bytes", () => {
  assert.equal(demonstratedIds.length, approved.stills.length);
  assert.ok(
    demonstratedIds.length <= 500,
    "Existing API ids filter has a 500-ID limit; change batching before expanding",
  );
  const ids = new Set<string>();
  for (const row of approved.stills) {
    assert.ok(!ids.has(row.exerciseId));
    ids.add(row.exerciseId);
    const original = catalogue.find((e) => e.id === row.exerciseId);
    assert.equal(
      original?.name || row.exerciseId.split(":")[1],
      row.expectedName,
    );
    const m = mediaFor(row.exerciseId)!;
    assert.ok(m.images.length >= 2);
    assert.ok(m.sources.length);
    for (const f of [...m.images, ...(m.video ? [m.video] : [])]) {
      assert.match(
        f.src,
        /^\/exercise-media\/[a-z0-9_-]+\.[0-9a-f]{12}\.(webp|mp4)$/,
      );
      const bytes = fs.readFileSync(publicDir + f.src);
      assert.equal(bytes.length,f.bytes);
      assert.ok(bytes.length > 1000 && bytes.length < 25 * 1024 * 1024);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256);
      assert.ok(f.src.includes(f.sha256.slice(0, 12)));
    }
    if (m.video) assert.equal(createHash('sha256').update(fs.readFileSync(publicDir+m.video.poster)).digest('hex'),m.video.posterSha256);
    for (const s of m.sources) {
      assert.ok(
        s.author && s.url && s.version && s.changes && s.sourceSha256?.length,
      );
      assert.ok(["Unlicense", "CC BY-SA 4.0"].includes(s.license));
      assert.ok(!s.url.includes("openGym"));
    }
  }
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(publicDir + "/exercise-media/attribution.json", "utf8"),
    ).entries,
    exerciseMedia,
  );
  assert.deepEqual(videoSizes,Object.fromEntries(Object.values(exerciseMedia).filter(m=>m.video).map(m=>[m.video!.src,m.video!.bytes])));
});
test("misleading variants and custom movements never inherit demonstration media", () => {
  for (const id of [
    "user:0334",
    "exdb:0333",
    "movemate:reverse_lunge",
    "exdb:1373",
    "motion:high_knees",
    "motion:jumping_jack",
  ])
    assert.equal(mediaFor(id), undefined);
  assert.equal(mediaFor(undefined), undefined);
  assert.equal(
    mediaFor("exdb:0085")?.video,
    undefined,
    "Dumbbell RDL video cannot represent barbell RDL",
  );
  assert.equal(
    mediaFor("exdb:0294")?.video,
    undefined,
    "Rotating-grip curl is not fixed supinated curl",
  );
  for (const row of approved.videos)
    for (const id of row.exerciseIds) assert.ok(mediaFor(id)?.video);
});
test("muscle shapes are exact known mappings, not invented secondary muscle claims", () => {
  assert.deepEqual(muscleRegions("pectorals"), [
    "upperChest",
    "lowerChest",
    "chest",
  ]);
  assert.deepEqual(muscleRegions("calves"), ["calves"]);
  assert.deepEqual(muscleRegions("unknown"), []);
});
test("playing one demonstration pauses others; released player cannot pause a camera stream", () => {
  const group = createDemoPlaybackGroup(),
    calls: number[] = [];
  const a = { pause: () => calls.push(1) },
    b = { pause: () => calls.push(2) },
    camera = { pause: () => calls.push(3) };
  const release = group.register(a);
  group.register(b);
  group.play(a);
  assert.deepEqual(calls, [2]);
  release();
  calls.length = 0;
  group.play(b);
  assert.deepEqual(calls, []);
  assert.ok(camera); // Unregistered streams are outside this group.
});
test("service worker never caches video/range replies and does cache viewed demonstration images", () => {
  const sw = fs.readFileSync(publicDir + "/sw.js", "utf8");
  assert.ok(sw.includes("req.headers.has('range')"));
  assert.ok(sw.includes("response.status===200"));
  const expression = sw.match(/const MEDIA_IMAGE=(.+);/)![1];
  const pattern = new RegExp(expression.slice(1, expression.lastIndexOf("/")));
  assert.ok(pattern.test("/exercise-media/test.0123456789ab.webp"));
  assert.ok(!pattern.test("/exercise-media/test.0123456789ab.mp4"));
});

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
  mediaIds,
} from "../src/features/gym/media";
import { createDemoPlaybackGroup } from "../src/features/gym/mediaPlayback";
import approved from "../../scripts/exercise-media-approved.json";
import catalogue from "../../server/src/gym/catalog.json";
import videoSizes from '../../cloudflare/src/media-sizes.json';
import { verifyExerciseMedia } from '../../scripts/exercise-media-assets.mjs';

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
// Public CI has no rights to redistribute site-only binaries. Production builds
// and the default npm test remain strict; this explicit test mode checks their
// metadata and every repository-distributed file, never fabricates media bytes.
const repositoryScope = process.env.MOVEMATE_MEDIA_TEST_SCOPE === 'repository';
const verificationEntries = Object.fromEntries(Object.entries(exerciseMedia).map(([id, m]) => [id, {
  ...m,
  images: repositoryScope ? m.images.filter(f => f.distribution !== 'site-only') : m.images,
  video: repositoryScope && m.video?.distribution === 'site-only' ? undefined : m.video,
}]));
test(repositoryScope
  ? "public CI verifies all demonstration metadata and repository media bytes (site-only binaries excluded)"
  : "all released demonstrations are reviewed exact IDs with local immutable and verified bytes", () => {
  const reviewed = [...approved.stills, ...approved.siteVideos.flatMap(row => row.exerciseIds.map(exerciseId => ({exerciseId, expectedName: row.expectedNames[exerciseId as keyof typeof row.expectedNames]})))];
  assert.equal(demonstratedIds.length, reviewed.length);
  const verified = new Map(verifyExerciseMedia({manifest: {entries: verificationEntries}}).map(f => [f.src, f]));
  assert.ok(
    demonstratedIds.length <= 500,
    "Existing API ids filter has a 500-ID limit; change batching before expanding",
  );
  const ids = new Set<string>();
  for (const row of reviewed) {
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
      assert.match(f.sha256, /^[a-f0-9]{64}$/);
      assert.ok(f.bytes > 1000 && f.bytes < 25 * 1024 * 1024);
      assert.ok(f.src.includes(f.sha256.slice(0, 12)));
      if (!repositoryScope || f.distribution !== 'site-only') {
        const bytes = verified.get(f.src)!.bytes;
        assert.equal(bytes.length, f.bytes);
        assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256);
      }
      if ('phase' in f && f.sourceIndex != null) {
        assert.ok(m.sources[f.sourceIndex], 'Every frame references its actual source');
        if (f.sourceTime != null) assert.ok(f.sourceTime >= 0);
      }
    }
    if (m.video && (!repositoryScope || m.video.distribution !== 'site-only')) assert.equal(createHash('sha256').update(verified.get(m.video.poster)!.bytes).digest('hex'),m.video.posterSha256);
    for (const s of m.sources) {
      assert.ok(
        s.author && s.url && s.version && s.changes && s.sourceSha256?.length,
      );
      assert.ok(["Unlicense", "CC BY-SA 4.0", "Pexels License"].includes(s.license));
      if (s.license === 'Pexels License') {
        assert.equal(s.distribution, 'site-only');
        assert.equal(m.video?.distribution, 'site-only');
        assert.ok(m.images.every(f => f.distribution === 'site-only'));
      }
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
test("image and video filters send exact ID sets before server pagination", () => {
  assert.equal(mediaIds('all'), undefined);
  assert.deepEqual(mediaIds('images'), demonstratedIds.filter(id=>mediaFor(id)!.images.length>0));
  assert.deepEqual(mediaIds('video'), demonstratedIds.filter(id=>!!mediaFor(id)!.video));
  assert.ok(mediaIds('images')!.includes('motion:squat'));
  assert.ok(!mediaIds('video')!.includes('motion:squat'));
  assert.ok(mediaIds('video')!.includes('exdb:0025'));
});
test("reviewed video breakdowns preserve chronological phases and provenance", () => {
  for (const row of [...approved.videos, ...approved.siteVideos]) {
    for (const id of row.exerciseIds) {
      const m=mediaFor(id)!;
      assert.equal(m.images.length,row.frames.length);
      assert.deepEqual(m.images.map(f=>f.sourceTime),row.frames.map(f=>f.time));
      assert.deepEqual(m.images.map(f=>f.phase),row.frames.map(f=>f.phase));
      m.images.forEach((f,i)=>{
        assert.ok(f.sourceTime!>=row.start && f.sourceTime!<row.end);
        if(i) assert.ok(f.sourceTime!>m.images[i-1].sourceTime!);
        assert.equal(m.sources[f.sourceIndex!].sourceSha256![0],Array.isArray(row.source.sourceSha256) ? row.source.sourceSha256[0] : row.source.sourceSha256);
      });
    }
  }
});
test("misleading variants and custom movements never inherit demonstration media", () => {
  for (const id of [
    "user:0334",
    "exdb:0333",
    "exdb:1373",
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

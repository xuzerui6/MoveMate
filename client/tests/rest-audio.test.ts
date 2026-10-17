import { test } from "node:test";
import assert from "node:assert/strict";
import { activateRestAudio } from "../src/features/gym/restAudio";
test("missing or rejected audio leaves an explicit visual-only fallback", async () => {
  assert.equal((await activateRestAudio(null)).ready, false);
  class Denied {
    state = "suspended";
    async resume() {
      throw Error("denied");
    }
  }
  const result = await activateRestAudio(null, Denied as any);
  assert.equal(result.ready, false);
  assert.match(result.message, /倒计时/);
});
test("activation reuses an open context and does not claim success while suspended", async () => {
  let created = 0;
  class Audio {
    state = "suspended";
    constructor() {
      created++;
    }
    async resume() {
      this.state = "running";
    }
  }
  const first = await activateRestAudio(null, Audio as any),
    second = await activateRestAudio(first.context, Audio as any);
  assert.equal(first.ready, true);
  assert.equal(second.ready, true);
  assert.equal(created, 1);
  class Suspended {
    state = "suspended";
    async resume() {}
  }
  assert.equal((await activateRestAudio(null, Suspended as any)).ready, false);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CDN_ASSET_BASE, CDN_WASM_BASE, cdnAssetUrl, isCdnRoutable, wasmBaseCandidates} from '../src/features/motion/lib/cdnAssets';

test('CDN routing maps origin-relative asset paths onto the CDN host, same path', () => {
  assert.equal(CDN_ASSET_BASE, 'https://pose.xzrcloud.xyz');
  assert.equal(cdnAssetUrl('/pose/pose_landmarker_full.task'), 'https://pose.xzrcloud.xyz/pose/pose_landmarker_full.task');
  assert.equal(cdnAssetUrl('/pose/wasm/vision_wasm_internal.wasm'), 'https://pose.xzrcloud.xyz/pose/wasm/vision_wasm_internal.wasm');
  assert.equal(cdnAssetUrl('/exercise-media/example.abc123.webp'), 'https://pose.xzrcloud.xyz/exercise-media/example.abc123.webp');
});

test('non-routable values pass through untouched', () => {
  assert.equal(cdnAssetUrl('https://storage.googleapis.com/model.task'), 'https://storage.googleapis.com/model.task');
  assert.equal(cdnAssetUrl('//cdn.example.com/x.webp'), '//cdn.example.com/x.webp');
  assert.equal(cdnAssetUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(cdnAssetUrl('relative/path.webp'), 'relative/path.webp');
  assert.equal(isCdnRoutable('/pose/x'), true);
  assert.equal(isCdnRoutable('//x'), false);
  assert.equal(isCdnRoutable(''), false);
});

test('WASM candidates are CDN first, origin last, in the caller-provided origin form', () => {
  assert.equal(CDN_WASM_BASE, 'https://pose.xzrcloud.xyz/pose/wasm');
  assert.deepEqual(wasmBaseCandidates('http://localhost/pose/wasm'), ['https://pose.xzrcloud.xyz/pose/wasm', 'http://localhost/pose/wasm']);
  assert.deepEqual(wasmBaseCandidates('/pose/wasm'), ['https://pose.xzrcloud.xyz/pose/wasm', '/pose/wasm']);
});

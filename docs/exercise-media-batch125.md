# Exercise media batch 125 — fill wave 6 (24 AI-generated still pairs)

Fill line (owner order 2026-11-14: 「把剩下的图都补充了」), wave 6 of the
uncovered-entry fill: 24 entries from the census of 214 (entries 121–144),
approved after per-entry visual gating
(`movemate-media-staging/chatgpt-batchF6/GATE-NOTES.md`). 24 shipped, no
exclusions, no failed drafts — every pair passed the gate on its first
draft.

Gate disclosures: 0458's fly cannot be performed with a single straight
bar — depicted per the catalog text's own motion (bar lowered to the upper
chest with elbows bending and flaring wide); 3315 depicted per its text
(standing cross hold, then leaning forward at the hips keeping the
horizontal hold — not the rings maltese); 3327's generator followed the
catalog text literally (push-up position, lower while lifting the feet
until the body hovers parallel), superseding the draft defs' reverse-plank
reading — frames verified directly against the text; 3239 depicted
kneeling per its NAME (its text's second step describes a full plank);
3195 depicted per its NAME (prone lying leg curl; the text's "seated"
wording is boilerplate); 2736 depicted with the UNDERHAND (reverse) grip
per its NAME (the text says overhand); 0492's peak is the explosive
push-off instant, hands just off the bench edge, feet still on the floor;
0543's framing is wider than most entries but both frames are consistent
with the whole body and the kettlebell clearly legible.

Run notes: the wave probe (0469) confirmed the Codex quota is healthy
(exit 0, no usage-limit wording in any of the 24 run logs). One service
restart killed the in-flight 0591 generation; it was re-run once via the
wave runner (skip-existing) and passed — no images lost. Generation ran
one shared runner over the wave defs with per-entry exit checks; every
frame was then gated individually by the coordinator.

Integration note: this wave integrated onto tip `e8307a3` of
feat/step5-heavy-testpage (the hammer return-gate fix line), so the
client repository suite reads 762 tests there (744 at the previous tip;
the +18 belongs to that line's own commits, not to media).

Result: images 1182 → 1206 (AI 833 → 857), illustrations 0, videos 18.
Report missing 147 → 123; effective uncovered entries 96 → 72 of the
original 214 (51 archived entries are excluded from the fill scope, and
exdb:0347 is excluded by the editorial no-media guard).

Media only: no entry text changed, no reviewStatus upgraded.

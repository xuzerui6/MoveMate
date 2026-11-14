# Exercise media batch 124 — fill wave 5 (24 AI-generated still pairs)

Fill line (owner order 2026-11-14: 「把剩下的图都补充了」), wave 5 of the
uncovered-entry fill: 24 entries from the census of 214 (entries 97–120),
approved after per-entry visual gating
(`movemate-media-staging/chatgpt-batchF5/GATE-NOTES.md`). 24 shipped, no
exclusions.

Gate disclosures: 2805's name says step-box support while its text also says
the rear leg lifts — depicted in the supported form (rear foot on the step
box); 2803's name says supported but its text describes no prop — depicted as
a plain dumbbell squat per the text; 1332/1339's equipment fields say ball
only but their texts specify dumbbells — depicted with dumbbells per the
text; 1338's text says both "sit on the ball" and "hug the ball" — depicted
as seated on the ball leaning back with arms crossed in a self-hug; 1343
depicted per the text's literal setup (prone on the mat, ball under the
lower legs/toes); 1559's and 1343's peak differences are modest but the
stretch/lift is visible (recorded in GATE-NOTES).

2812 (dumbbell step-up split squat): peak passed at once; start frame draft 1
FAILED (mid-step lunge reading, not the ready position — archived in the
stage FAILED/ dir) and was regenerated anchored on the peak frame per the
1712 precedent — draft 2 PASS (right foot planted flat and fully on the
bench, left foot on the floor, upright facing the bench, dumbbells at sides).

Run notes: Codex image quota had recovered by the first real generation
(1772, exit 0, no usage-limit error). The runtime restarted three times
during the wave (23:24, 23:26, 00:06 UTC), killing in-flight generations
twice (3292 twice, 1560 once); each was retried single-entry and passed —
no images were lost and no quota was burned by the restarts. The
run_wave.sh rate-limit grep does not match the real limit wording ("You've
hit your usage limit"), so generation was driven one entry at a time with a
per-log usage-limit check instead.

Result: images 1158 → 1182 (AI 809 → 833), illustrations 0, videos 18.
Report missing 171 → 147; effective uncovered entries 120 → 96 of the
original 214 (51 archived entries are excluded from the fill scope, and
exdb:0347 is excluded by the editorial no-media guard).

Media only: no entry text changed, no reviewStatus upgraded.

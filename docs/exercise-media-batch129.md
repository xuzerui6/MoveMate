# Exercise media batch 129 — fill wave 9, part 2 + 1370 closing retry (13 AI-generated still pairs)

Fill line (owner order 2026-11-14: 「把剩下的图都补充了」), wave 9 of the
uncovered-entry fill — THE FILL LINE CLOSES HERE. This batch ships the
exact resume point recorded in REPLACE-STATUS.md after the batch-128
provider usage limit: the remaining 12 wave-9 entries (1310, 0866, 3641,
3286, 3290, 0844, 0847, 0854, 3313, 3642, 3637, 1604) plus the 1370
barbell calf raise closing retry.

Generation: quota recovered (1310 probe generation exit 0, no limit
wording); the remaining 11 wave-9 pairs then generated serially, all
exit 0, zero limit wording in any run log. 12/12 wave-9 pairs passed the
gate first draft, zero regens.

1370 closing retry — geometry correction (coordinator record):
`fill-214/regen/p1370-both.txt` states the INVERTED geometry (heels on
top of the barbell plate, forefeet on the floor), contradicting the
catalog text 「站立，脚掌放在杠铃边缘，脚跟悬垂」. The two earlier
drafts (archived in `chatgpt-batchF1/FAILED/`) failed on that geometry
(heels never got onto the plate). This round used a corrected close-up
foot-composition prompt (`fill-214/regen/p1370-r3.txt`, file
`p1370-both.txt` left untouched): balls of the feet on the plate's round
edge, heels below the plate surface. Third-draft peak PASSED (balls on
the plate rim, heels high, calves contracted); third-draft start FAILED
(feet flat on the floor beside the plate, archived
`chatgpt-batchF9/FAILED/exdb-1370-start-r3.png`) and was regenerated
single-frame anchored on the passed peak
(`fill-214/regen/p1370-start-r4.txt`); fourth-draft start PASSED (balls
on the rim, heels down on the floor below plate level, calves stretched).

Gate disclosures: 3641 is depicted as the kneeling dumbbell swing per
its text (the name's 'step' is not in the text); 3290 as the one-hand
pull-up per its name (its text describes a two-hand pull-up); 3286's
peak is the chest-to-bar endpoint per its text (no dip-out transition);
1604 follows the text's step order (deep lunge, then the rotated open
pose, right side); 1370 follows the catalog geometry above.

Result: images 1264 → 1277 (AI 915 → 928), illustrations 0, videos 18.
Report missing 65 → 52; the 52 decompose exactly as 51 soft-archived +
exdb:0347, permanently imageless by the editorial no-media guard. The
fill line's 214 entries are therefore complete: 213 shipped, 1 (0347)
imageless by design.

Media only: no entry text changed, no reviewStatus upgraded.

Tests (preview lineage, serial): client repository 782/782 + tsc, server
193/193 + build + tsc, cloudflare 50/50 + typecheck. One transient
server long-poll timeout on the first server run; isolated serial re-run
193/193.

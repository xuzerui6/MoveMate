/*
 * 正式 App 锤式弯举计数器的独立打包（Thunder 设备门测试页专用）
 * 由 client/src/features/motion/lib/adaptiveRecognition.ts（AdaptiveRecognition）
 * 经 esbuild 从 client/test-assets/thunder-tracker-entry.ts 打包，未做任何改动：
 * 与正式 App 相同的计数/判定代码路径，仅供本页的计数完整性检查调用。
 * 构建基线：origin/main 0dd052c（含计数机制修复与步行测试修复）＋ step5 分支合并 aef949b。
 * 暴露：globalThis.MoveMateTracker.create(runId) -> { update(frame), reps, ready }
 */
"use strict";
(() => {
  // ../server/src/gym/new-recognition.json
  var new_recognition_default = {
    hammer_curl: { name: "\u54D1\u94C3\u9524\u5F0F\u5F2F\u4E3E", english: "HAMMER CURL", unit: "\u6B21", placement: "\u6B63\u9762\u7565\u4FA7\u8EAB\uFF0C\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u548C\u9ACB\u5B8C\u6574\u5165\u955C\u3002", instruction: "\u7AD9\u7A33\u4E24\u79D2\uFF0C\u638C\u5FC3\u76F8\u5BF9\uFF0C\u53CC\u81C2\u540C\u65F6\u6216\u4EA4\u66FF\u5F2F\u4E3E\uFF0C\u518D\u653E\u56DE\u4F38\u81C2\u4F4D\u7F6E\u3002", breathing: "\u4E0A\u4E3E\u65F6\u547C\u6C14\uFF0C\u653E\u56DE\u65F6\u5438\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB", axes: ["\u5C48\u8098\u5E45\u5EA6", "\u4E0A\u81C2\u63A7\u5236", "\u8EAF\u5E72\u7A33\u5B9A", "\u53CC\u81C2\u534F\u8C03"], stages: ["\u4F38\u81C2\u5C31\u7EEA", "\u5F2F\u4E3E\u4E2D", "\u6F02\u4EAE\uFF0C\u5C31\u662F\u8FD9\u4E2A\u9AD8\u5EA6\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0313"] },
    front_raise: { name: "\u54D1\u94C3\u524D\u5E73\u4E3E", english: "FRONT RAISE", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u62CD\u6444\uFF0C\u5934\u3001\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u548C\u9ACB\u53EF\u89C1\uFF1B\u5411\u524D\u4E3E\u8D77\u7684\u624B\u4E0D\u80FD\u51FA\u753B\u3002", instruction: "\u5782\u81C2\u7AD9\u7A33\u4E24\u79D2\uFF0C\u5355\u81C2\u3001\u4EA4\u66FF\u6216\u53CC\u81C2\u5411\u8EAB\u4F53\u524D\u65B9\u62AC\u81F3\u63A5\u8FD1\u80A9\u9AD8\uFF0C\u518D\u7F13\u6162\u653E\u56DE\u3002", breathing: "\u524D\u4E3E\u65F6\u547C\u6C14\uFF0C\u653E\u56DE\u65F6\u5438\u6C14\u3002", joints: "\u9F3B\u90E8\u3001\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB", axes: ["\u524D\u4E3E\u5E45\u5EA6", "\u624B\u81C2\u63A7\u5236", "\u8EAF\u5E72\u7A33\u5B9A", "\u53CC\u81C2\u534F\u8C03"], stages: ["\u5782\u81C2\u5C31\u7EEA", "\u524D\u4E3E\u4E2D", "\u6F02\u4EAE\uFF0C\u5C31\u662F\u8FD9\u4E2A\u9AD8\u5EA6\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0310", "exdb:0834"] },
    triceps_kickback: { name: "\u54D1\u94C3\u4FEF\u8EAB\u81C2\u5C48\u4F38", english: "TRICEPS KICKBACK", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u62CD\u6444\uFF0C\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u9ACB\u548C\u819D\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u5C48\u9ACB\u4FEF\u8EAB\uFF0C\u4E0A\u81C2\u9760\u8FD1\u8EAF\u5E72\uFF0C\u5C48\u8098\u4FDD\u6301\u4E24\u79D2\uFF1B\u53CC\u81C2\u5411\u540E\u4F38\u8098\uFF0C\u518D\u653E\u56DE\u3002", breathing: "\u4F38\u8098\u65F6\u547C\u6C14\uFF0C\u653E\u56DE\u65F6\u5438\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D", axes: ["\u4F38\u8098\u5E45\u5EA6", "\u4E0A\u81C2\u63A7\u5236", "\u4FEF\u8EAB\u7A33\u5B9A", "\u53CC\u81C2\u534F\u8C03"], stages: ["\u4FEF\u8EAB\u5C48\u8098\u5C31\u7EEA", "\u53CC\u81C2\u5411\u540E\u4F38\u8098\u4E2D", "\u4F38\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE\u6765", "\u597D\uFF0C\u56DE\u4F4D\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0333", "exdb:1741", "exdb:0420"] },
    romanian_deadlift: { name: "\u54D1\u94C3\u7F57\u9A6C\u5C3C\u4E9A\u786C\u62C9", english: "ROMANIAN DEADLIFT", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u695A\uFF0C\u53CC\u811A\u59CB\u7EC8\u5728\u753B\u9762\u5185\u3002", instruction: "\u7AD9\u7A33\u4E24\u79D2\uFF0C\u819D\u81EA\u7136\u5FAE\u5C48\uFF0C\u9ACB\u5411\u540E\u79FB\u5E76\u4FEF\u8EAB\uFF0C\u518D\u4F38\u9ACB\u7AD9\u8D77\uFF1B\u4E0D\u8981\u6C42\u54D1\u94C3\u89E6\u5730\u3002", breathing: "\u4E0B\u653E\u65F6\u5438\u6C14\uFF0C\u7AD9\u8D77\u65F6\u547C\u6C14\u3002", joints: "\u80A9\u3001\u9ACB\u3001\u819D\u3001\u811A\u8E1D\uFF08\u81F3\u5C11\u4E00\u4FA7\u8FDE\u7EED\u6E05\u6670\uFF09", axes: ["\u5C48\u9ACB\u5E45\u5EA6", "\u8D77\u843D\u63A7\u5236", "\u8EAF\u5E72\u63A7\u5236", "\u652F\u6491\u7A33\u5B9A"], stages: ["\u7AD9\u7ACB\u5C31\u7EEA", "\u9ACB\u540E\u79FB\u4FEF\u8EAB\u4E2D", "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u8D77\u6765", "\u597D\uFF0C\u7AD9\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:1459"] },
    glute_bridge: { name: "\u5F92\u624B\u5730\u9762\u81C0\u6865", english: "GLUTE BRIDGE", unit: "\u6B21", placement: "\u964D\u4F4E\u6444\u50CF\u5934\uFF0C\u4ECE\u4FA7\u9762\u62CD\u6444\uFF1B\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u695A\uFF0C\u80A9\u90E8\u4E0E\u53CC\u811A\u4FDD\u6301\u652F\u6491\u3002", instruction: "\u4EF0\u5367\u5C48\u819D\uFF0C\u53CC\u811A\u8E29\u5730\uFF0C\u4F4E\u4F4D\u4FDD\u6301\u4E24\u79D2\uFF1B\u62AC\u9ACB\u81F3\u80A9\u9ACB\u819D\u63A5\u8FD1\u4E00\u7EBF\uFF0C\u518D\u63A7\u5236\u843D\u56DE\u3002", breathing: "\u62AC\u9ACB\u65F6\u547C\u6C14\uFF0C\u843D\u56DE\u65F6\u5438\u6C14\u3002", joints: "\u80A9\u3001\u9ACB\u3001\u819D\u3001\u811A\u8E1D\uFF08\u81F3\u5C11\u4E00\u4FA7\u8FDE\u7EED\u6E05\u6670\uFF09", axes: ["\u62AC\u9ACB\u5E45\u5EA6", "\u56DE\u843D\u63A7\u5236", "\u9ACB\u90E8\u63A7\u5236", "\u652F\u6491\u7A33\u5B9A"], stages: ["\u4EF0\u5367\u4F4E\u4F4D\u5C31\u7EEA", "\u62AC\u9ACB\u4E2D", "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u843D\u56DE\u6765", "\u597D\uFF0C\u843D\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:3013"] },
    standing_leg_curl: { name: "\u7AD9\u59FF\u540E\u5C48\u817F", english: "STANDING LEG CURL", unit: "\u6B21", placement: "\u4FA7\u9762\u6216\u659C\u4FA7\u9762\u5168\u8EAB\u5165\u955C\uFF0C\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u548C\u53CC\u811A\u8E1D\u6E05\u695A\u3002", instruction: "\u53CC\u811A\u7AD9\u7A33\u4E24\u79D2\uFF0C\u4E00\u4FA7\u811A\u8DDF\u5411\u540E\u62AC\u8D77\uFF0C\u518D\u653E\u56DE\uFF1B\u6BCF\u4FA7\u5B8C\u6210\u7B97\u4E00\u6B21\uFF0C\u5DE6\u53F3\u5408\u8BA120\u6B21\uFF0C\u53EF\u8FDE\u7EED\u7EC3\u4E00\u4FA7\u3002", breathing: "\u4FDD\u6301\u81EA\u7136\u547C\u5438\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D", axes: ["\u5C48\u819D\u5E45\u5EA6", "\u56DE\u843D\u63A7\u5236", "\u7AD9\u59FF\u7A33\u5B9A", "\u652F\u6491\u63A7\u5236"], stages: ["\u53CC\u811A\u7AD9\u7ACB\u5C31\u7EEA", "\u5355\u4FA7\u540E\u5C48\u817F\u4E2D", "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE\u53BB", "\u597D\uFF0C\u653E\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0795"] },
    dumbbell_standing_press: { name: "\u7AD9\u59FF\u53CC\u54D1\u94C3\u80A9\u63A8", english: "DUMBBELL STANDING OVERHEAD PRESS", unit: "\u6B21", placement: "\u6B63\u9762\u7565\u4FA7\u8EAB\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u548C\u9ACB\u5165\u955C\uFF0C\u4E3E\u8FC7\u5934\u9876\u7684\u53CC\u624B\u4E0D\u80FD\u51FA\u753B\u3002", instruction: "\u7AD9\u7A33\uFF0C\u53CC\u624B\u5728\u80A9\u90E8\u9AD8\u5EA6\u4FDD\u6301\u4E24\u79D2\uFF1B\u540C\u65F6\u63A8\u8D77\uFF0C\u518D\u653E\u56DE\u3002", breathing: "\u63A8\u8D77\u65F6\u547C\u6C14\uFF0C\u653E\u56DE\u65F6\u5438\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB", axes: ["\u63A8\u4E3E\u5E45\u5EA6", "\u63A8\u4E3E\u63A7\u5236", "\u8EAF\u5E72\u63A7\u5236", "\u53CC\u81C2\u534F\u8C03"], stages: ["\u80A9\u90E8\u8D77\u59CB\u4F4D\u5C31\u7EEA", "\u63A8\u4E3E\u4E2D", "\u63A8\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0426"], recognitionVersion: 6 },
    barbell_military_press: { name: "\u6760\u94C3\u7AD9\u59FF\u519B\u4E8B\u63A8\u4E3E", english: "BARBELL STANDING MILITARY PRESS", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u62CD\u6444\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u548C\u9ACB\u5165\u955C\uFF0C\u4E3E\u8FC7\u5934\u9876\u7684\u53CC\u624B\u4E0D\u80FD\u51FA\u753B\u3002", instruction: "\u7AD9\u7A33\uFF0C\u6760\u5728\u80A9\u90E8\u9AD8\u5EA6\u4FDD\u6301\u4E24\u79D2\uFF1B\u63A8\u8D77\u81F3\u53CC\u81C2\u4F38\u76F4\uFF0C\u518D\u653E\u56DE\u3002\u5BBD\u7A84\u63E1\u5747\u53EF\uFF0C\u6444\u50CF\u5934\u4E0D\u9A8C\u8BC1\u63E1\u6CD5\u3002", breathing: "\u63A8\u8D77\u65F6\u547C\u6C14\uFF0C\u653E\u56DE\u65F6\u5438\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB", axes: ["\u63A8\u4E3E\u5E45\u5EA6", "\u63A8\u4E3E\u63A7\u5236", "\u8EAF\u5E72\u63A7\u5236", "\u53CC\u81C2\u534F\u8C03"], stages: ["\u80A9\u90E8\u8D77\u59CB\u4F4D\u5C31\u7EEA", "\u63A8\u4E3E\u4E2D", "\u63A8\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:1456", "exdb:1457"], recognitionVersion: 6 },
    dumbbell_reverse_lunge: { name: "\u54D1\u94C3\u540E\u64A4\u5F13\u6B65", english: "DUMBBELL REAR LUNGE", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u53CC\u811A\u540E\u64A4\u4ECD\u5728\u753B\u9762\u5185\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u7AD9\u7A33\u4E24\u79D2\uFF1B\u4E00\u4FA7\u5411\u540E\u64A4\u5E76\u4E0B\u6C89\uFF0C\u518D\u56DE\u5230\u5E76\u811A\u7AD9\u7ACB\uFF1B\u6BCF\u4FA7\u5B8C\u6210\u8BA1\u4E00\u6B21\u3002", breathing: "\u4E0B\u6C89\u65F6\u5438\u6C14\uFF0C\u7AD9\u8D77\u65F6\u547C\u6C14\uFF0C\u4E0D\u8981\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D", axes: ["\u5F13\u6B65\u5E45\u5EA6", "\u652F\u6491\u63A7\u5236", "\u8EAF\u5E72\u63A7\u5236", "\u5DE6\u53F3\u534F\u8C03"], stages: ["\u5E76\u811A\u7AD9\u7ACB\u5C31\u7EEA", "\u540E\u64A4\u4E0B\u6C89\u4E2D", "\u5230\u4F4D\u5566\u2014\u2014\u56DE\u5230\u7AD9\u7ACB", "\u597D\uFF0C\u7AD9\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0381"], recognitionVersion: 6 },
    dumbbell_deadlift: { name: "\u54D1\u94C3\u4F20\u7EDF\u786C\u62C9", english: "DUMBBELL DEADLIFT", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u5168\u8EAB\uFF0C\u81F3\u5C11\u4E00\u4FA7\u80A9\u3001\u8098\u3001\u8155\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u8FDE\u7EED\u6E05\u6670\uFF0C\u54D1\u94C3\u4E0D\u53EF\u906E\u6321\u5173\u8282\u3002", instruction: "\u53CC\u624B\u6301\u94C3\u4E8E\u4F53\u4FA7\uFF0C\u5148\u5728\u5C48\u9ACB\u5C48\u819D\u3001\u53CC\u81C2\u4F38\u76F4\u4E14\u624B\u63A5\u8FD1\u5C0F\u817F\u7684\u8D77\u59CB\u4F4D\u4FDD\u6301\u4E24\u79D2\uFF1B\u4F38\u9ACB\u4F38\u819D\u7AD9\u76F4\uFF0C\u518D\u63A7\u5236\u8FD4\u56DE\u8D77\u59CB\u4F4D\uFF0C\u5B8C\u6574\u5F80\u8FD4\u8BA1\u4E00\u6B21\u3002", breathing: "\u62C9\u8D77\u65F6\u547C\u6C14\uFF0C\u4E0B\u653E\u65F6\u5438\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u80A9\u3001\u8098\u3001\u8155\u3001\u9ACB\u3001\u819D\u3001\u811A\u8E1D", axes: ["\u52A8\u4F5C\u5E45\u5EA6", "\u7A33\u5B9A\u63A7\u5236", "\u8EAB\u4F53\u59FF\u6001", "\u52A8\u4F5C\u534F\u8C03"], stages: ["\u4F4E\u4F4D\u8D77\u59CB\u5C31\u7EEA", "\u4F38\u9ACB\u4F38\u819D\u62C9\u8D77\u4E2D", "\u7AD9\u76F4\u5566\u2014\u2014\u63A7\u5236\u7740\u6162\u6162\u653E\u56DE", "\u597D\uFF0C\u653E\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0300"], recognitionVersion: 6 },
    one_arm_row: { name: "\u54D1\u94C3\u5355\u81C2\u4FEF\u8EAB\u5212\u8239", english: "DUMBBELL ONE ARM BENT-OVER ROW", unit: "\u6B21", placement: "\u4ECE\u659C\u4FA7\u9762\u671D\u5411\u5DE5\u4F5C\u4FA7\u62CD\u6444\uFF0C\u5DE5\u4F5C\u4FA7\u80A9\u3001\u8098\u3001\u624B\u8155\u548C\u53CC\u9ACB\u3001\u53CC\u819D\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u4FDD\u6301\u4FEF\u8EAB\uFF0C\u5DE5\u4F5C\u4FA7\u624B\u81C2\u5782\u4E0B\u4E24\u79D2\uFF1B\u8098\u5411\u540E\u62C9\u8D77\uFF0C\u518D\u653E\u56DE\uFF1B\u652F\u6491\u4FA7\u4FDD\u6301\u4E0D\u52A8\uFF0C\u6362\u4FA7\u5148\u5B8C\u6210\u672C\u4FA7\u518D\u5F00\u59CB\u3002", breathing: "\u62C9\u8D77\u65F6\u547C\u6C14\uFF0C\u653E\u56DE\u65F6\u5438\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D", axes: ["\u5212\u8239\u5E45\u5EA6", "\u624B\u81C2\u63A7\u5236", "\u4FEF\u8EAB\u7A33\u5B9A", "\u652F\u6491\u7A33\u5B9A"], stages: ["\u4FEF\u8EAB\u5782\u81C2\u5C31\u7EEA", "\u5355\u81C2\u62C9\u8D77\u4E2D", "\u62C9\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0292"], recognitionVersion: 6 },
    lying_leg_raise: { name: "\u5E73\u51F3\u4EF0\u5367\u4E3E\u817F", english: "LYING LEG RAISE FLAT BENCH", unit: "\u6B21", placement: "\u4FA7\u9762\u62CD\u6444\u5E76\u964D\u4F4E\u673A\u4F4D\uFF0C\u5168\u8EAB\u5165\u955C\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u4EF0\u5367\u3001\u53CC\u817F\u4F38\u76F4\u8D34\u4F4F\u51F3\u9762\uFF0C\u505C\u7A33\u4E24\u79D2\uFF1B\u53CC\u817F\u4E00\u8D77\u4E3E\u81F3\u63A5\u8FD1\u5782\u76F4\uFF0C\u518D\u7F13\u6162\u653E\u56DE\u3002\u5C48\u819D\u4E3E\u817F\u6309\u540C\u4E00\u6761\u76EE\u8BA1\uFF0C\u4E0D\u505A\u533A\u5206\uFF1B\u8D77\u5750\u4E0D\u8BA1\u5165\u3002", breathing: "\u4E3E\u817F\u65F6\u547C\u6C14\uFF0C\u653E\u56DE\u65F6\u5438\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D", axes: ["\u4E3E\u817F\u5E45\u5EA6", "\u817F\u90E8\u63A7\u5236", "\u8EAF\u5E72\u7A33\u5B9A", "\u53CC\u817F\u534F\u8C03"], stages: ["\u5E73\u8EBA\u4F38\u817F\u5C31\u7EEA", "\u4E3E\u817F\u4E2D", "\u4E3E\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0620"], recognitionVersion: 6 },
    upright_row: { name: "\u54D1\u94C3\u76F4\u7ACB\u5212\u8239", english: "DUMBBELL UPRIGHT ROW", unit: "\u6B21", placement: "\u6B63\u9762\u7565\u4FA7\u8EAB\uFF0C\u4E0A\u534A\u8EAB\u5165\u955C\uFF0C\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u548C\u9ACB\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u53CC\u81C2\u5782\u4E0B\u7AD9\u7A33\u4E24\u79D2\uFF1B\u6CBF\u8EAB\u4F53\u524D\u63D0\u81F3\u80F8\u53E3\u4EE5\u4E0A\u3001\u53CC\u8098\u5411\u5916\u6253\u5F00\uFF0C\u518D\u7F13\u6162\u653E\u56DE\u3002\u53EA\u8038\u80A9\u4E0D\u8BA1\u5165\u3002", breathing: "\u63D0\u62C9\u65F6\u547C\u6C14\uFF0C\u653E\u56DE\u65F6\u5438\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB", axes: ["\u63D0\u62C9\u5E45\u5EA6", "\u624B\u81C2\u63A7\u5236", "\u8EAF\u5E72\u7A33\u5B9A", "\u53CC\u81C2\u534F\u8C03"], stages: ["\u5782\u81C2\u5C31\u7EEA", "\u63D0\u62C9\u4E2D", "\u62C9\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0437"], recognitionVersion: 6 },
    mountain_climber: { name: "\u767B\u5C71\u8DD1", english: "MOUNTAIN CLIMBER", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u53CC\u624B\u6491\u5730\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u4FEF\u6491\u4F38\u817F\u505C\u7A33\u4E24\u79D2\uFF1B\u5DE6\u53F3\u817F\u4EA4\u66FF\u5411\u80F8\u53E3\u56DE\u6536\u518D\u8E6C\u56DE\u3002\u6162\u901F\u4E5F\u80FD\u8BA1\uFF0C\u5148\u628A\u4EA4\u66FF\u8282\u594F\u505A\u7A33\uFF1B\u53CC\u817F\u540C\u65F6\u56DE\u6536\u4E0D\u8BA1\u5165\u3002", breathing: "\u968F\u7740\u5DE6\u53F3\u4EA4\u66FF\u56DE\u6536\u81EA\u7136\u547C\u5438\uFF0C\u4E0D\u8981\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D", axes: ["\u56DE\u6536\u5E45\u5EA6", "\u817F\u90E8\u63A7\u5236", "\u4FEF\u6491\u7A33\u5B9A", "\u5DE6\u53F3\u534F\u8C03"], stages: ["\u4FEF\u6491\u5C31\u7EEA", "\u4EA4\u66FF\u56DE\u6536\u4E2D", "\u56DE\u6536\u5230\u4F4D\u2014\u2014\u8E6C\u56DE\u53BB", "\u597D\uFF0C\u56DE\u5230\u4FEF\u6491\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0630"], recognitionVersion: 6 },
    split_squat: { name: "\u54D1\u94C3\u5355\u817F\u5206\u817F\u8E72", english: "DUMBBELL SINGLE LEG SPLIT SQUAT", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u524D\u817F\u4E00\u4FA7\u671D\u5411\u955C\u5934\uFF0C\u524D\u811A\u843D\u5730\u3001\u540E\u811A\u62AC\u9AD8\u653E\u5728\u51F3\u4E0A\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u5206\u817F\u7AD9\u7A33\u4E24\u79D2\uFF1B\u5782\u76F4\u4E0B\u6C89\u81F3\u524D\u817F\u5230\u4F4D\uFF0C\u518D\u7AD9\u8D77\u3002\u6362\u4FA7\u65F6\u5148\u7AD9\u7A33\uFF0C\u518D\u5F00\u59CB\u4E0B\u4E00\u4FA7\u3002", breathing: "\u4E0B\u6C89\u65F6\u5438\u6C14\uFF0C\u7AD9\u8D77\u65F6\u547C\u6C14\uFF0C\u4E0D\u8981\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D\u3001\u53CC\u811A\u8DDF\u3001\u53CC\u811A\u5C16", axes: ["\u4E0B\u6C89\u5E45\u5EA6", "\u652F\u6491\u63A7\u5236", "\u8EAF\u5E72\u7A33\u5B9A", "\u540E\u811A\u7A33\u5B9A"], stages: ["\u5206\u817F\u7AD9\u7ACB\u5C31\u7EEA", "\u4E0B\u6C89\u4E2D", "\u6C89\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u8D77", "\u597D\uFF0C\u7AD9\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0410"], recognitionVersion: 6 },
    seated_calf_raise: { name: "\u5750\u59FF\u54D1\u94C3\u63D0\u8E35", english: "DUMBBELL SEATED CALF RAISE", unit: "\u6B21", placement: "\u4ECE\u659C\u4FA7\u9762\u62CD\u6444\u5C0F\u817F\u548C\u53CC\u811A\uFF0C\u9ACB\u3001\u819D\u3001\u811A\u8E1D\u3001\u811A\u8DDF\u548C\u524D\u811A\u638C\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u5750\u7A33\u3001\u53CC\u819D\u5F2F\u66F2\u3001\u53CC\u811A\u5E73\u653E\uFF0C\u811A\u8DDF\u843D\u5730\u505C\u7A33\u4E24\u79D2\uFF1B\u53CC\u811A\u540C\u65F6\u63D0\u8E35\uFF0C\u518D\u7F13\u6162\u843D\u56DE\u3002", breathing: "\u63D0\u8E35\u65F6\u547C\u6C14\uFF0C\u843D\u8DDF\u65F6\u5438\u6C14\uFF0C\u4E0D\u8981\u618B\u6C14\u3002", joints: "\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D\u3001\u53CC\u811A\u8DDF\u3001\u53CC\u524D\u811A\u638C", axes: ["\u63D0\u8E35\u5E45\u5EA6", "\u843D\u8DDF\u63A7\u5236", "\u5750\u59FF\u7A33\u5B9A", "\u53CC\u811A\u534F\u8C03"], stages: ["\u811A\u8DDF\u843D\u5730\u5C31\u7EEA", "\u63D0\u8E35\u4E2D", "\u63D0\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u843D\u8DDF", "\u597D\uFF0C\u843D\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:1379"], recognitionVersion: 6 },
    barbell_good_morning: { name: "\u6760\u94C3\u65E9\u5B89\u5F0F", english: "BARBELL GOOD MORNING", unit: "\u6B21", placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u6760\u94C3\u4F4D\u4E8E\u4E0A\u80CC\uFF0C\u4E0D\u53EF\u906E\u6321\u80A9\u3001\u9ACB\u3001\u819D\u4E0E\u811A\u8E1D\u3002", instruction: "\u6760\u94C3\u4F4D\u4E8E\u4E0A\u80CC\uFF0C\u7AD9\u76F4\u505C\u7A33\u4E24\u79D2\uFF1B\u819D\u76D6\u4FDD\u6301\u5FAE\u5C48\u3001\u9ACB\u5411\u540E\u6298\u53E0\u4FEF\u8EAB\uFF0C\u518D\u56DE\u5230\u7AD9\u76F4\u3002\u8BF7\u81EA\u884C\u786E\u8BA4\u4FDD\u62A4\u6761\u4EF6\u3002\u4E0E\u7F57\u9A6C\u5C3C\u4E9A\u786C\u62C9\u7684\u533A\u522B\u5728\u94C3\u4F4D\uFF08\u80CC\u4E0A vs \u624B\u6301\u4E0B\u5782\uFF09\uFF0C\u8BC6\u522B\u4E0D\u505A\u4E92\u65A5\u5224\u522B\u3002", breathing: "\u4FEF\u8EAB\u65F6\u5438\u6C14\uFF0C\u7AD9\u76F4\u65F6\u547C\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D", axes: ["\u4FEF\u8EAB\u5E45\u5EA6", "\u52A8\u4F5C\u63A7\u5236", "\u8EAF\u5E72\u59FF\u6001", "\u5DE6\u53F3\u534F\u8C03"], stages: ["\u7AD9\u76F4\u5C31\u7EEA", "\u4FEF\u8EAB\u4E2D", "\u4FEF\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u76F4", "\u597D\uFF0C\u7AD9\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0044"], recognitionVersion: 6 },
    bench_dip: { name: "\u5C48\u819D\u51F3\u4E0A\u81C2\u5C48\u4F38", english: "BENCH DIP (KNEES BENT)", unit: "\u6B21", placement: "\u4FA7\u9762\u62CD\u6444\uFF0C\u4E0A\u534A\u8EAB\u548C\u51F3\u9762\u5165\u955C\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u548C\u9ACB\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u53CC\u624B\u5728\u8EAB\u540E\u6491\u4F4F\u51F3\u6CBF\u3001\u4F38\u76F4\u624B\u81C2\u505C\u7A33\u4E24\u79D2\uFF1B\u5C48\u8098\u4E0B\u6C89\u8EAB\u4F53\uFF0C\u518D\u63A8\u56DE\u4F38\u76F4\u3002\u53EA\u5750\u4E0B\u4E0D\u5C48\u8098\u4E0D\u8BA1\u5165\u3002", breathing: "\u63A8\u8D77\u65F6\u547C\u6C14\uFF0C\u4E0B\u6C89\u65F6\u5438\u6C14\uFF0C\u4E0D\u618B\u6C14\u3002", joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB", axes: ["\u4E0B\u6C89\u5E45\u5EA6", "\u624B\u81C2\u63A7\u5236", "\u8EAF\u5E72\u7A33\u5B9A", "\u53CC\u81C2\u534F\u8C03"], stages: ["\u4F38\u81C2\u652F\u6491\u5C31\u7EEA", "\u4E0B\u6C89\u4E2D", "\u6C89\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u63A8\u8D77", "\u597D\uFF0C\u63A8\u56DE\u6765\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"], exerciseIds: ["exdb:0129"], recognitionVersion: 6 }
  };

  // src/features/motion/lib/newExercises.ts
  var NEW_EXERCISES = new_recognition_default;
  var isNewExercise = (value) => Object.prototype.hasOwnProperty.call(new_recognition_default, value);

  // src/features/motion/lib/exercises.ts
  var BASE_CAMERA_EXERCISES = {
    squat: { name: "\u6DF1\u8E72", english: "SQUAT", unit: "\u6B21", placement: "\u5168\u8EAB\u5165\u955C\uFF0C\u7565\u4FA7\u8EAB\uFF1B\u8BA9\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u90FD\u6E05\u6670\u53EF\u89C1\u3002", instruction: "\u7AD9\u7A33\u540E\u4E0B\u8E72\uFF0C\u518D\u56DE\u5230\u7AD9\u7ACB\uFF0C\u5B8C\u6210\u4E00\u6B21\u3002", breathing: "\u4E0B\u8E72\u65F6\u5438\u6C14\uFF0C\u8D77\u8EAB\u65F6\u547C\u6C14\uFF0C\u4E0D\u8981\u618B\u6C14\u3002", axes: ["\u4E0B\u8E72\u6DF1\u5EA6", "\u819D\u76D6\u7A33\u5B9A", "\u8EAF\u5E72\u63A7\u5236", "\u5DE6\u53F3\u5BF9\u79F0"] },
    jumping_jack: { name: "\u5F00\u5408\u8DF3", english: "JUMPING JACK", unit: "\u6B21", placement: "\u6B63\u9762\u5BF9\u7740\u6444\u50CF\u5934\uFF0C\u53CC\u811A\u548C\u4E3E\u8FC7\u5934\u9876\u7684\u53CC\u624B\u90FD\u8981\u5165\u955C\u3002", instruction: "\u624B\u811A\u4E00\u8D77\u5C55\u5F00\uFF0C\u518D\u4E00\u8D77\u56DE\u5230\u5408\u62E2\u4F4D\u7F6E\uFF0C\u5B8C\u6210\u4E00\u6B21\u3002", breathing: "\u4FDD\u6301\u81EA\u7136\u547C\u5438\uFF0C\u843D\u5730\u8F7B\u4E00\u4E9B\u3002", axes: ["\u5C55\u5F00\u5E45\u5EA6", "\u843D\u5730\u63A7\u5236", "\u8EAF\u5E72\u59FF\u6001", "\u624B\u811A\u534F\u8C03"] },
    high_knees: { name: "\u9AD8\u62AC\u817F", english: "HIGH KNEES", unit: "\u7EC4", placement: "\u6B63\u9762\u5BF9\u7740\u6444\u50CF\u5934\uFF0C\u5168\u8EAB\u5165\u955C\uFF1B\u4FDD\u6301\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u3002", instruction: "\u5DE6\u53F3\u5404\u62AC\u817F\u5E76\u843D\u4E0B\u7B97\u4E00\u7EC4\uFF1B\u91CD\u590D\u540C\u4E00\u4FA7\u4E0D\u4F1A\u589E\u52A0\u7EC4\u6570\u3002", breathing: "\u968F\u7740\u5DE6\u53F3\u62AC\u817F\u81EA\u7136\u547C\u5438\uFF0C\u8EAB\u4F53\u4FDD\u6301\u76F4\u7ACB\u3002", axes: ["\u62AC\u817F\u5E45\u5EA6", "\u652F\u6491\u7A33\u5B9A", "\u8EAF\u5E72\u59FF\u6001", "\u5DE6\u53F3\u534F\u8C03"] },
    push_up: { name: "\u4FEF\u5367\u6491", english: "PUSH UP", unit: "\u6B21", placement: "\u6444\u50CF\u5934\u4ECE\u4FA7\u9762\u62CD\u6444\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u3001\u9ACB\u548C\u811A\u8E1D\u90FD\u8981\u5165\u955C\u3002", instruction: "\u4ECE\u4F38\u81C2\u652F\u6491\u5F00\u59CB\uFF0C\u5C48\u8098\u4E0B\u964D\uFF0C\u518D\u63A8\u8D77\uFF0C\u5B8C\u6210\u4E00\u6B21\u3002", breathing: "\u4E0B\u964D\u65F6\u5438\u6C14\uFF0C\u63A8\u8D77\u65F6\u547C\u6C14\uFF0C\u4E0D\u8981\u618B\u6C14\u3002", axes: ["\u5C48\u4F38\u5E45\u5EA6", "\u652F\u6491\u63A7\u5236", "\u8EAB\u4F53\u8FDE\u7EBF", "\u5C48\u4F38\u534F\u8C03"] }
  };
  var CAMERA_EXERCISES = { ...BASE_CAMERA_EXERCISES, ...NEW_EXERCISES };
  var isCameraExercise = (value) => Object.prototype.hasOwnProperty.call(CAMERA_EXERCISES, value);
  var unknownExercise = { name: "\u672A\u77E5\u52A8\u4F5C\uFF0C\u8BF7\u5237\u65B0\u9875\u9762", english: "UNSUPPORTED", unit: "\u6B21", placement: "\u5F53\u524D\u5BA2\u6237\u7AEF\u4E0D\u652F\u6301\u6B64\u52A8\u4F5C\uFF0C\u8BF7\u5237\u65B0\u540E\u6062\u590D\u6216\u5207\u6362\u624B\u52A8\u8BB0\u5F55\u3002", instruction: "\u8BF7\u5237\u65B0\u9875\u9762\u6838\u5BF9\u52A8\u4F5C\uFF0C\u4E0D\u80FD\u7528\u5176\u4ED6\u8BC6\u522B\u5668\u4EE3\u66FF\u3002", breathing: "\u4FDD\u6301\u81EA\u7136\u547C\u5438\u3002", axes: ["\u5E45\u5EA6", "\u63A7\u5236", "\u59FF\u6001", "\u534F\u8C03"] };
  var exerciseInfo = (value) => isCameraExercise(value) ? CAMERA_EXERCISES[value] : unknownExercise;

  // src/features/motion/lib/squatMetrics.ts
  var squatJoints = { left: [11, 23, 25, 27], right: [12, 24, 26, 28] };
  function squatSideVisible(points, side, confidence = 0.55) {
    return squatJoints[side].every((i) => {
      const p = points[i];
      return p && (p.visibility ?? 0) >= confidence && p.x >= 0.035 && p.x <= 0.965 && p.y >= 0.025 && p.y <= 0.985;
    });
  }
  var clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  var angle = (a, b, c) => {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let degrees = Math.abs(radians * 180 / Math.PI);
    if (degrees > 180) degrees = 360 - degrees;
    return degrees;
  };
  var distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  var midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2, visibility: Math.min(a.visibility || 1, b.visibility || 1) });
  function analyzeSquatFrame(points, aspectRatio = 1, world, side) {
    if (points.length < 29) return null;
    const required = side ? squatJoints[side] : [11, 12, 23, 24, 25, 26, 27, 28];
    const confidence = Math.min(...required.map((index) => points[index].visibility ?? 0));
    if (confidence < 0.55) return null;
    if (required.some((index) => points[index].x < 0.035 || points[index].x > 0.965 || points[index].y < 0.025 || points[index].y > 0.985)) return null;
    points = points.map((p) => ({ ...p, x: p.x * aspectRatio }));
    const worldAngle = (a, b, c) => {
      const u = [a.x - b.x, a.y - b.y, a.z - b.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
      const denominator = Math.hypot(...u) * Math.hypot(...v);
      return denominator > 1e-6 ? Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, n, i) => sum + n * v[i], 0) / denominator))) * 180 / Math.PI : NaN;
    };
    const validWorld = !!world && (side ? squatJoints[side].slice(1) : [23, 24, 25, 26, 27, 28]).every((i) => world[i] && [world[i].x, world[i].y, world[i].z].every(Number.isFinite));
    const leftWorld = validWorld && side !== "right" ? worldAngle(world[23], world[25], world[27]) : NaN;
    const rightWorld = validWorld && side !== "left" ? worldAngle(world[24], world[26], world[28]) : NaN;
    const useWorld = (side === "right" || Number.isFinite(leftWorld)) && (side === "left" || Number.isFinite(rightWorld));
    const leftKnee = useWorld ? leftWorld : angle(points[23], points[25], points[27]);
    const rightKnee = useWorld ? rightWorld : angle(points[24], points[26], points[28]);
    const kneeAngle = side === "left" ? leftKnee : side === "right" ? rightKnee : (leftKnee + rightKnee) / 2;
    if (side) {
      return { kneeAngle, depthScore: 0, stabilityScore: 0, trunkScore: 0, symmetryScore: 0, formScore: 0, confidence, angleSource: useWorld ? "world" : "image" };
    }
    const depthScore = clamp((125 - kneeAngle) / 35 * 100);
    const symmetryScore = clamp(100 - Math.abs(leftKnee - rightKnee) * 2.5);
    const shoulderWidth = Math.max(0.05, distance(points[11], points[12]));
    const kneeDrift = (Math.abs(points[25].x - points[27].x) + Math.abs(points[26].x - points[28].x)) / (2 * shoulderWidth);
    const stabilityScore = clamp(100 - Math.max(0, kneeDrift - 0.3) * 130);
    const shoulderMid = midpoint(points[11], points[12]), hipMid = midpoint(points[23], points[24]);
    const trunkTilt = Math.abs(Math.atan2(shoulderMid.x - hipMid.x, hipMid.y - shoulderMid.y) * 180 / Math.PI);
    const trunkScore = clamp(100 - Math.max(0, trunkTilt - 10) * 3.5);
    const formScore = Math.round(depthScore * 0.35 + stabilityScore * 0.25 + trunkScore * 0.2 + symmetryScore * 0.2);
    return { kneeAngle, depthScore, stabilityScore, trunkScore, symmetryScore, formScore, confidence, angleSource: useWorld ? "world" : "image" };
  }

  // src/features/motion/lib/companionCopy.ts
  var COPY_FRAMING = "\u5F80\u540E\u9000\u4E00\u70B9\u70B9\uFF0C\u8BA9\u6211\u4ECE\u5934\u770B\u5230\u811A";
  var COPY_WAIT_START = "\u7AD9\u597D\uFF0C\u80F3\u818A\u81EA\u7136\u653E\u4E0B\uFF0C\u966A\u6211\u505C\u4E24\u79D2";
  var COPY_WAIT_START_PLANK = "\u4FDD\u6301\u4F38\u81C2\u652F\u6491\uFF0C\u966A\u6211\u505C\u4E24\u79D2";
  var COPY_CALIBRATED = "\u627E\u5230\u4F60\u5566\uFF0C\u6211\u4EEC\u5F00\u59CB";
  var COPY_OUT_OF_FRAME = "\u54A6\uFF0C\u4F60\u53BB\u54EA\u5566\uFF1F\u56DE\u5230\u753B\u9762\u91CC\uFF0C\u6211\u63A5\u7740\u966A\u4F60";
  var COPY_SUBJECT_SWITCH = "\u753B\u9762\u91CC\u597D\u50CF\u4E0D\u6B62\u4E00\u4E2A\u4EBA\uFF0C\u6211\u8DDF\u4E22\u5566\u2014\u2014\u7AD9\u56DE\u753B\u9762\u4E2D\u95F4\uFF0C\u8BA9\u6211\u91CD\u65B0\u627E\u5230\u4F60";
  var COPY_UNCLEAR = "\u6211\u6709\u70B9\u770B\u4E0D\u6E05\u2014\u2014\u522B\u62C5\u5FC3\uFF0C\u6570\u5230\u7684\u90FD\u5728\uFF0C\u5148\u505C\u4E00\u4E0B";
  var COPY_HALF_REP = "\u8FD9\u4E2A\u4E0D\u7B97\uFF0C\u4E5F\u4E0D\u6263\u5206\uFF0C\u8C03\u6574\u4E00\u4E0B\u518D\u6765";
  var COPY_BASIS_UNSTABLE = "\u5149\u7EBF\u6709\u70B9\u6B3A\u8D1F\u4EBA\uFF0C\u6211\u4EEC\u7B49\u5B83\u7A33\u4E00\u7A33";
  var COPY_NOT_SEEN = "\u6211\u8FD8\u6CA1\u770B\u5230\u4F60\u2014\u2014\u7AD9\u5230\u753B\u9762\u91CC\uFF0C\u8BA9\u6211\u4ECE\u5934\u770B\u5230\u811A";
  var COPY_FRAMING_UPPER = "\u5F80\u540E\u9000\u4E00\u70B9\u70B9\uFF0C\u8BA9\u6211\u770B\u5230\u4F60\u7684\u5934\u548C\u4E0A\u534A\u8EAB";
  var COPY_NOT_SEEN_UPPER = "\u6211\u8FD8\u6CA1\u770B\u5230\u4F60\u2014\u2014\u7AD9\u5230\u753B\u9762\u91CC\uFF0C\u8BA9\u6211\u770B\u5230\u4F60\u7684\u5934\u548C\u4E0A\u534A\u8EAB";
  var UPPER_BODY_EXERCISE_TYPES = /* @__PURE__ */ new Set([
    "biceps_curl",
    "hammer_curl",
    "barbell_curl",
    "reverse_barbell_curl",
    "seated_curl",
    "front_raise",
    "seated_lateral_raise",
    "lateral_raise",
    "shoulder_press",
    "neutral_seated_press",
    "bent_over_row",
    "barbell_row",
    "bench_press",
    "incline_bench_press",
    "triceps_kickback",
    "seated_triceps_extension",
    "lying_triceps_extension",
    "reverse_fly"
  ]);
  var isUpperBodyExercise = (type) => UPPER_BODY_EXERCISE_TYPES.has(type);
  var framingCopyFor = (type) => isUpperBodyExercise(type) ? COPY_FRAMING_UPPER : COPY_FRAMING;
  var notSeenCopyFor = (type) => isUpperBodyExercise(type) ? COPY_NOT_SEEN_UPPER : COPY_NOT_SEEN;
  var COPY_AXIS_UNASSESSABLE = "\u8FD9\u4E2A\u89D2\u5EA6\u8BC4\u4E0D\u4E86";
  var cannotAssessCopyFor = (type) => `${COPY_AXIS_UNASSESSABLE}\u2014\u2014${framingCopyFor(type)}`;

  // src/features/motion/lib/poseFeedback.ts
  var POSE_ISSUE_COPY = {
    insufficient_range: { label: "\u52A8\u4F5C\u5E45\u5EA6\u504F\u5C0F", action: "\u518D\u5F80\u4E0A\u5E26\u4E00\u70B9\u70B9\uFF0C\u4F60\u53EF\u4EE5\u7684", joints: [13, 14, 15, 16, 25, 26] },
    unstable_movement: { label: "\u652F\u6491\u6216\u843D\u5730\u4E0D\u7A33", action: "\u4E0D\u8D76\u65F6\u95F4\uFF0C\u6162\u4E00\u70B9\uFF0C\u7AD9\u7A33\u4E86\u518D\u6765", joints: [23, 24, 27, 28] },
    body_alignment: { label: "\u8EAB\u4F53\u59FF\u6001\u9700\u8C03\u6574", action: "\u6838\u5FC3\u6536\u4E00\u70B9\uFF0C\u7A33\u4F4F\u5C31\u597D", joints: [11, 12, 23, 24] },
    poor_coordination: { label: "\u52A8\u4F5C\u914D\u5408\u9700\u8C03\u6574", action: "\u6162\u4E00\u70B9\uFF0C\u8BA9\u624B\u811A\u4E00\u8D77\u52A8", joints: [13, 14, 25, 26] },
    out_of_frame: { label: "\u8EAB\u4F53\u672A\u5B8C\u6574\u5165\u955C", action: "\u5F80\u540E\u9000\u4E00\u70B9\u70B9\uFF0C\u8BA9\u6211\u4ECE\u5934\u770B\u5230\u811A", joints: [11, 12, 23, 24, 25, 26, 27, 28] },
    insufficient_depth: { label: "\u4E0B\u8E72\u6DF1\u5EA6\u4E0D\u8DB3", action: "\u518D\u4F4E\u4E00\u70B9\u70B9\u5C31\u597D\uFF0C\u4EE5\u8212\u670D\u4E3A\u51C6", joints: [23, 24, 25, 26] },
    knee_instability: { label: "\u819D\u76D6\u8F68\u8FF9\u4E0D\u7A33", action: "\u819D\u76D6\u8DDF\u7740\u811A\u5C16\u8D70\uFF0C\u811A\u638C\u8E29\u7A33", joints: [25, 26, 27, 28] },
    excessive_trunk_lean: { label: "\u8EAF\u5E72\u524D\u503E\u504F\u591A", action: "\u80F8\u53E3\u62AC\u4E00\u70B9\u70B9\uFF0C\u6838\u5FC3\u6536\u4F4F\u518D\u8D77\u8EAB", joints: [11, 12, 23, 24] },
    asymmetry: { label: "\u5DE6\u53F3\u53D1\u529B\u4E0D\u5747", action: "\u91CD\u5FC3\u56DE\u5230\u4E24\u811A\u4E2D\u95F4\uFF0C\u5DE6\u53F3\u4E00\u8D77\u4F7F\u52B2", joints: [23, 24, 25, 26, 27, 28] }
  };
  var UPPER_BODY_ISSUE_COPY = {
    unstable_movement: { label: "\u624B\u81C2\u6446\u52A8\u504F\u5927", action: "\u6162\u4E00\u70B9\uFF0C\u8098\u8D34\u7D27\u8EAB\u4F53\uFF0C\u628A\u8FD9\u4E00\u4E0B\u505A\u7A33", joints: [11, 12, 13, 14] },
    poor_coordination: { label: "\u4E24\u8FB9\u8282\u594F\u6CA1\u5BF9\u9F50", action: "\u6162\u4E00\u70B9\uFF0C\u8BA9\u4E24\u53EA\u624B\u4E00\u8D77\u8D77\u3001\u4E00\u8D77\u843D", joints: [15, 16] }
  };
  function poseIssueCopy(issue, type) {
    if (type && isUpperBodyExercise(type)) {
      const upper = UPPER_BODY_ISSUE_COPY[issue];
      if (upper) return upper;
    }
    return POSE_ISSUE_COPY[issue];
  }
  var median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] || 0;
  };
  function medianLandmarks(frames) {
    if (!frames.length) return null;
    const count = Math.min(...frames.map((frame) => frame.length));
    if (count < 29) return null;
    return Array.from({ length: count }, (_, index) => ({
      x: median(frames.map((frame) => frame[index].x)),
      y: median(frames.map((frame) => frame[index].y)),
      z: median(frames.map((frame) => frame[index].z || 0)),
      visibility: median(frames.map((frame) => frame[index].visibility ?? 0))
    }));
  }
  function detectPoseIssues(frame, phase, calibrated) {
    if (!frame) return {
      status: "uncertain",
      confidence: 0,
      issues: ["out_of_frame"],
      primaryIssue: "out_of_frame",
      message: calibrated ? POSE_ISSUE_COPY.out_of_frame.action : "\u5148\u7AD9\u5230\u753B\u9762\u91CC\uFF0C\u8BA9\u6211\u770B\u5230\u4F60",
      affectedJoints: POSE_ISSUE_COPY.out_of_frame.joints,
      calibrated
    };
    if (!calibrated) return {
      status: "uncertain",
      confidence: frame.confidence,
      issues: [],
      primaryIssue: null,
      message: "\u7AD9\u597D\uFF0C\u80F3\u818A\u81EA\u7136\u653E\u4E0B\uFF0C\u966A\u6211\u505C\u4E24\u79D2",
      affectedJoints: [],
      calibrated: false
    };
    const issues = [];
    if ((phase === "bottom" || phase === "ascending") && frame.depthScore < 72) issues.push("insufficient_depth");
    if (frame.stabilityScore < 72) issues.push("knee_instability");
    if (frame.trunkScore < 70) issues.push("excessive_trunk_lean");
    if (frame.symmetryScore < 70) issues.push("asymmetry");
    const primaryIssue = issues[0] || null;
    return {
      status: primaryIssue ? "adjust" : "stable",
      confidence: frame.confidence,
      issues,
      primaryIssue,
      message: primaryIssue ? POSE_ISSUE_COPY[primaryIssue].action : "\u59FF\u52BF\u7A33\u5B9A\uFF0C\u4FDD\u6301\u8FD9\u4E2A\u8282\u594F",
      affectedJoints: primaryIssue ? POSE_ISSUE_COPY[primaryIssue].joints : [],
      calibrated: true
    };
  }

  // src/features/motion/lib/sessionMigration.ts
  var emptyFormBreakdown = () => ({ depth: 0, stability: 0, trunk: 0, symmetry: 0 });
  var medianOf = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid2 = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid2] : (sorted[mid2 - 1] + sorted[mid2]) / 2;
  };
  var emptyCorrectionCounts = () => ({
    out_of_frame: 0,
    insufficient_depth: 0,
    knee_instability: 0,
    excessive_trunk_lean: 0,
    asymmetry: 0,
    insufficient_range: 0,
    unstable_movement: 0,
    body_alignment: 0,
    poor_coordination: 0
  });

  // src/features/motion/lib/exerciseMetrics.ts
  var leftSide = [11, 13, 15, 23, 27];
  var rightSide = [12, 14, 16, 24, 28];
  var jointNames = { 11: "\u5DE6\u80A9", 12: "\u53F3\u80A9", 13: "\u5DE6\u8098", 14: "\u53F3\u8098", 15: "\u5DE6\u624B\u8155", 16: "\u53F3\u624B\u8155", 23: "\u5DE6\u9ACB", 24: "\u53F3\u9ACB", 25: "\u5DE6\u819D", 26: "\u53F3\u819D", 27: "\u5DE6\u811A\u8E1D", 28: "\u53F3\u811A\u8E1D" };
  var sideConfidence = (points, indices) => Math.min(...indices.map((i) => points[i]?.visibility ?? 0));
  function requiredJoints(type, points, side) {
    if (type === "push_up") {
      const chosen = side || (visible(points, leftSide) && (!visible(points, rightSide) || sideConfidence(points, leftSide) >= sideConfidence(points, rightSide)) ? "left" : "right");
      return chosen === "left" ? leftSide : rightSide;
    }
    return type === "jumping_jack" ? [11, 12, 23, 24, 27, 28, visible(points, [15]) ? 15 : visible(points, [13]) ? 13 : 15, visible(points, [16]) ? 16 : visible(points, [14]) ? 14 : 16] : [11, 12, 23, 24, 25, 26, 27, 28];
  }
  function rejectedFrameReason(type, points, side) {
    const required = requiredJoints(type, points, side);
    const edge = required.find((i) => points[i].x < 0.035 || points[i].x > 0.965 || points[i].y < 0.025 || points[i].y > 0.985);
    if (edge !== void 0) return `${jointNames[edge]}\u9760\u8FD1\u753B\u9762\u8FB9\u7F18\u5566\uFF0C\u5F80\u540E\u9000\u4E00\u70B9\u70B9`;
    const hidden = required.find((i) => (points[i].visibility ?? 0) < 0.55);
    if (hidden !== void 0) return `${jointNames[hidden]}\u6709\u70B9\u770B\u4E0D\u6E05\uFF0C\u6362\u4E2A\u89D2\u5EA6\u6216\u8BA9\u5149\u7EBF\u4EAE\u4E00\u70B9`;
    return "\u4ECE\u4FA7\u9762\u62CD\uFF0C\u8BA9\u6211\u770B\u6E05\u4F60\u80A9\u5230\u811A\u8E1D\u7684\u8FDE\u7EBF";
  }
  var clamp2 = (n) => Math.min(100, Math.max(0, n));
  var RETURN_WINDOW_MS = 500;
  var RETURN_FRAME_CAP_MS = 100;
  var MIN_EXCURSION_MS = 250;
  var mean = (a, b) => (a + b) / 2;
  var angle2 = (a, b, c) => {
    let n = Math.abs((Math.atan2(a.y - b.y, a.x - b.x) - Math.atan2(c.y - b.y, c.x - b.x)) * 180 / Math.PI);
    if (n > 180) n = 360 - n;
    return n;
  };
  var distance2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  var weights = (s) => Math.round(s.depth * 0.35 + s.stability * 0.25 + s.trunk * 0.2 + s.symmetry * 0.2);
  var axes = ["depth", "stability", "trunk", "symmetry"];
  var visible = (points, indices) => indices.every((i) => {
    const p = points[i];
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= 0.55 && p.x >= 0.035 && p.x <= 0.965 && p.y >= 0.025 && p.y <= 0.985;
  });
  function analyzeExerciseFrame(type, raw, aspect = 1, trackingSide, world, squatSide) {
    if (raw.length < 29 || !Number.isFinite(aspect) || aspect <= 0) return null;
    const required = squatSide ? [...squatJoints[squatSide]] : requiredJoints(type, raw, trackingSide);
    if (!visible(raw, required)) return null;
    if (type === "squat") {
      const both = !squatSide || squatSideVisible(raw, "left") && squatSideVisible(raw, "right");
      const s = analyzeSquatFrame(raw, aspect, world, both ? void 0 : squatSide);
      if (!s) return null;
      const p2 = raw.map((v) => ({ ...v, x: v.x * aspect }));
      const offset = squatSide === "right" ? 1 : 0;
      const joint = (i) => squatSide ? p2[i + offset] : { x: mean(p2[i].x, p2[i + 1].x), y: mean(p2[i].y, p2[i + 1].y) };
      const shoulder2 = joint(11), hip2 = joint(23), foot = joint(27);
      const leg = (i) => distance2(p2[23 + i], p2[25 + i]) + distance2(p2[25 + i], p2[27 + i]);
      const motion = { hipHeight: foot.y - hip2.y, shoulderHeight: foot.y - shoulder2.y, legLength: squatSide ? leg(offset) : mean(leg(0), leg(1)), torso: distance2(shoulder2, hip2), footX: foot.x, footY: foot.y };
      const primary = squatSide ? analyzeSquatFrame(raw, aspect, world, squatSide) : s;
      if (!primary) return null;
      const phase = s.kneeAngle <= 125 ? "bottom" : s.kneeAngle >= 150 ? "standing" : "descending";
      return {
        start: s.kneeAngle >= 150 && primary.kneeAngle >= 150,
        peak: s.kneeAngle <= 125 && primary.kneeAngle <= 125,
        angle: s.kneeAngle,
        angleSource: primary.angleSource,
        squatMotion: motion,
        confidence: s.confidence,
        squatScorable: both && s.confidence >= 0.7,
        scores: { depth: s.depthScore, stability: s.stabilityScore, trunk: s.trunkScore, symmetry: s.symmetryScore },
        score: s.formScore,
        issues: both ? detectPoseIssues(s, phase, true).issues : []
      };
    }
    const p = raw.map((v) => ({ ...v, x: v.x * aspect }));
    const confidence = Math.min(...required.map((i) => raw[i].visibility));
    const hip = { ...p[23], x: mean(p[23].x, p[24].x), y: mean(p[23].y, p[24].y) };
    const shoulder = { ...p[11], x: mean(p[11].x, p[12].x), y: mean(p[11].y, p[12].y) };
    const width = Math.max(0.04, distance2(p[11], p[12]));
    const torso = Math.max(0.05, distance2(hip, shoulder));
    const upright = clamp2(100 - Math.max(0, Math.abs(shoulder.x - hip.x) / torso - 0.12) * 150);
    let start = false, peak = false, side, measuredAngle, jack, scores = emptyFormBreakdown();
    if (type === "jumping_jack") {
      const spread = Math.abs(p[27].x - p[28].x) / width;
      const [l, r] = required.slice(-2), armRise = (shoulder.y - mean(p[l].y, p[r].y)) / torso;
      const raised = p[l].y < p[11].y - torso * 0.12 && p[r].y < p[12].y - torso * 0.12;
      const lowered = p[l].y > p[11].y + torso * 0.2 && p[r].y > p[12].y + torso * 0.2;
      jack = { spread, raised, lowered };
      start = spread <= 1.65 && lowered;
      peak = spread >= 1.4 && raised;
      scores = { depth: clamp2(Math.min(spread / 2.5, Math.max(0, armRise) / 0.65) * 100), stability: clamp2(100 - Math.abs(p[27].y - p[28].y) / torso * 150), trunk: upright, symmetry: clamp2(100 - (Math.abs(p[l].y - p[r].y) + Math.abs(Math.abs(p[27].x - hip.x) - Math.abs(p[28].x - hip.x))) / torso * 120) };
    } else if (type === "high_knees") {
      const leg = Math.max(0.08, mean(distance2(p[23], p[27]), distance2(p[24], p[28])));
      const left = (p[23].y - p[25].y) / leg, right = (p[24].y - p[26].y) / leg;
      start = left < -0.25 && right < -0.25;
      peak = Math.max(left, right) >= -0.08 && Math.min(left, right) < -0.25;
      side = left > right ? "left" : "right";
      const support = side === "left" ? 28 : 27, supportHip = side === "left" ? 24 : 23;
      scores = { depth: clamp2((Math.max(left, right) + 0.15) / 0.3 * 100), stability: clamp2(100 - Math.max(0, Math.abs(p[support].x - p[supportHip].x) / torso - 0.15) * 150), trunk: upright, symmetry: clamp2(100 - Math.abs(p[11].y - p[12].y) / torso * 200) };
    } else {
      const [s, e, w, h, a] = required;
      const elbow = angle2(p[s], p[e], p[w]), line = angle2(p[s], p[h], p[a]);
      measuredAngle = elbow;
      if (Math.abs(p[s].x - p[a].x) < Math.abs(p[s].y - p[a].y) * 1.2) return null;
      start = elbow >= 158;
      peak = elbow <= 102;
      scores = { depth: clamp2((125 - elbow) / 35 * 100), stability: clamp2(100 - Math.max(0, Math.abs(p[s].x - p[w].x) / Math.max(0.08, distance2(p[s], p[w])) - 0.35) * 100), trunk: clamp2(100 - Math.max(0, 180 - line - 8) * 3), symmetry: clamp2(100 - Math.max(0, Math.abs(p[e].y - mean(p[s].y, p[w].y)) / Math.max(0.08, distance2(p[s], p[w])) - 0.3) * 100) };
    }
    const issues = [];
    if (peak && scores.depth < 72) issues.push("insufficient_range");
    if (scores.stability < 72) issues.push("unstable_movement");
    if (scores.trunk < 70) issues.push("body_alignment");
    if (scores.symmetry < 70) issues.push("poor_coordination");
    return { start, peak, side, jack, angle: measuredAngle, trackingSide: type === "push_up" ? required === leftSide ? "left" : "right" : void 0, confidence, scores, score: weights(scores), issues };
  }
  var ExerciseTracker = class {
    constructor(type, targetReps = 20, restored = {}, prefiltered = false, armOnStart = false, adaptiveSquat = type === "squat" && armOnStart) {
      this.type = type;
      this.prefiltered = prefiltered;
      this.armOnStart = armOnStart;
      this.adaptiveSquat = adaptiveSquat;
      const reps = Math.max(0, restored.reps || 0), breakdown = { ...emptyFormBreakdown(), ...restored.formBreakdown };
      const acc = restored.scoreAccumulator || { count: reps, total: (restored.formScore || 0) * reps, ...Object.fromEntries(axes.map((k) => [k, breakdown[k] * reps])) };
      this.metrics = { ...restored, reps, targetReps, formScore: acc.count ? Math.round(acc.total / acc.count) : 0, perfectReps: restored.perfectReps || 0, feedback: exerciseInfo(type).placement, phase: "standing", scoreAccumulator: { ...acc }, formBreakdown: breakdown, correctionCounts: { ...emptyCorrectionCounts(), ...restored.correctionCounts }, lastRepIssues: [], repeatedIssue: null, poseFeedback: this.feedback(null, false) };
    }
    metrics;
    diagnostics = { fps: 0, confidence: 0, side: null, angle: null, stage: "calibrating", calibrationProgress: 0, pairedSides: [], lastResetReason: null };
    frames = [];
    calibrationAt = null;
    calibrated = false;
    armed = false;
    peakAt = null;
    peak = null;
    returnAt = null;
    movingAt = null;
    retAnchor = null;
    retAccum = 0;
    retPrevAt = null;
    pair = /* @__PURE__ */ new Map();
    issues = /* @__PURE__ */ new Set();
    consecutive = {};
    trackingSide;
    lastFrameAt = null;
    frameTimes = [];
    freezeBridged = false;
    worldFrames = [];
    squatBaseline = null;
    jackBaseline = null;
    armsAt = null;
    legsAt = null;
    motionAt = null;
    squatSide;
    squatCycle = null;
    chooseSquatSide(raw) {
      if (this.squatSide) return this.squatSide;
      const left = squatSideVisible(raw, "left"), right = squatSideVisible(raw, "right");
      if (!left && right) return "right";
      if (left && right && sideConfidence(raw, [...squatJoints.right]) > sideConfidence(raw, [...squatJoints.left])) return "right";
      return "left";
    }
    requiredIndices(raw) {
      return this.adaptiveSquat ? [...squatJoints[this.chooseSquatSide(raw)]] : requiredJoints(this.type, raw, this.trackingSide);
    }
    feedback(frame, calibrated) {
      const issues = frame?.issues || ["out_of_frame"], primaryIssue = issues[0] || null;
      return { status: !frame || !calibrated ? "uncertain" : primaryIssue ? "adjust" : "stable", confidence: frame?.confidence || 0, issues, primaryIssue, affectedJoints: primaryIssue ? poseIssueCopy(primaryIssue, this.type).joints : [], calibrated, message: !frame ? exerciseInfo(this.type).placement : !calibrated ? this.type === "push_up" ? COPY_WAIT_START_PLANK : COPY_WAIT_START : primaryIssue ? poseIssueCopy(primaryIssue, this.type).action : "\u59FF\u52BF\u7A33\u5B9A\uFF0C\u4FDD\u6301\u8FD9\u4E2A\u8282\u594F" };
    }
    interrupt(reason = "\u5148\u505C\u4E00\u4E0B\uFF0C\u7EE7\u7EED\u65F6\u5148\u56DE\u5230\u8D77\u59CB\u59FF\u52BF", feedback = reason) {
      this.frames = [];
      this.calibrationAt = null;
      this.calibrated = false;
      this.armed = false;
      this.peakAt = null;
      this.peak = null;
      this.returnAt = null;
      this.movingAt = null;
      this.retAnchor = null;
      this.retAccum = 0;
      this.retPrevAt = null;
      this.pair.clear();
      this.issues.clear();
      this.consecutive = {};
      this.trackingSide = void 0;
      this.lastFrameAt = null;
      this.frameTimes = [];
      this.freezeBridged = false;
      this.worldFrames = [];
      this.squatSide = void 0;
      this.squatCycle = null;
      this.squatBaseline = null;
      this.jackBaseline = null;
      this.armsAt = null;
      this.legsAt = null;
      this.motionAt = null;
      this.diagnostics = { ...this.diagnostics, fps: 0, confidence: 0, side: null, angle: null, stage: "tracking_lost", calibrationProgress: 0, pairedSides: [], lastResetReason: reason };
      this.metrics = { ...this.metrics, phase: "standing", poseFeedback: { ...this.feedback(null, false), message: feedback }, feedback };
      return this.metrics;
    }
    /** The adaptive wrapper deliberately held frames back (a ladder step-down
     * swapping the pose model — see AdaptiveRecognition.carryToRun); the next
     * frame gap is therefore known-benign and must not be read as a tracking
     * loss. Only arms when the pending gap actually exceeds the guard. Mirrors
     * ExtendedExerciseTracker.bridgeFreezeGap. */
    bridgeFreezeGap(now) {
      if (this.lastFrameAt !== null && now - this.lastFrameAt > 750) this.freezeBridged = true;
    }
    update(raw, now, aspect = 1, world = null) {
      if (!raw) return this.interrupt("\u672A\u68C0\u6D4B\u5230\u5B8C\u6574\u4EBA\u4F53\u5173\u952E\u70B9", notSeenCopyFor(this.type));
      if (raw.length < 29 || raw.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.visibility !== void 0 && !Number.isFinite(p.visibility)) || !Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(now)) return this.interrupt("\u5173\u952E\u70B9\u6570\u636E\u4E0D\u5B8C\u6574", COPY_UNCLEAR);
      if (this.lastFrameAt !== null && now <= this.lastFrameAt) return this.metrics;
      if (this.lastFrameAt !== null && now - this.lastFrameAt > 750) {
        if (this.freezeBridged) this.freezeBridged = false;
        else this.interrupt("\u753B\u9762\u66F4\u65B0\u4E2D\u65AD", COPY_HALF_REP);
      }
      this.lastFrameAt = now;
      this.frameTimes = [...this.frameTimes, now].filter((time) => now - time <= 2e3).slice(-120);
      const elapsed = now - this.frameTimes[0];
      this.diagnostics = { ...this.diagnostics, fps: elapsed > 0 ? Math.round((this.frameTimes.length - 1) * 1e3 / elapsed) : 0 };
      const required = this.requiredIndices(raw);
      if (required.some((i) => (raw[i].visibility ?? 0) < 0.25 || raw[i].x < 0 || raw[i].x > 1 || raw[i].y < 0 || raw[i].y > 1)) return this.interrupt(rejectedFrameReason(this.type, raw, this.trackingSide));
      this.frames = [...this.frames, raw].slice(-(this.prefiltered ? 1 : 5));
      this.worldFrames = world && world.length >= 29 && world.every((p) => p && [p.x, p.y, p.z].every(Number.isFinite)) ? [...this.worldFrames, world].slice(-(this.prefiltered ? 1 : 5)) : [];
      const smoothedWorld = this.worldFrames.length ? medianLandmarks(this.worldFrames) : null;
      const points = medianLandmarks(this.frames), frame = points ? analyzeExerciseFrame(this.type, points, aspect, this.trackingSide, smoothedWorld, this.adaptiveSquat ? this.chooseSquatSide(raw) : void 0) : null;
      if (!frame) return this.interrupt(points ? rejectedFrameReason(this.type, points, this.trackingSide) : "\u6211\u8FD8\u5728\u627E\u4F60\uFF0C\u7AD9\u5230\u753B\u9762\u91CC\u6765");
      if (this.adaptiveSquat && !this.squatSide && frame.start) this.squatSide = this.chooseSquatSide(raw);
      if (this.type === "push_up" && !this.trackingSide && frame.start) this.trackingSide = frame.trackingSide;
      this.diagnostics = { ...this.diagnostics, confidence: frame.confidence, side: this.squatSide || this.trackingSide || frame.trackingSide || null, angle: frame.angle ?? null };
      if (this.type === "squat" && frame.squatMotion) {
        const m = frame.squatMotion;
        if (!this.calibrated && frame.start) {
          this.squatBaseline = this.squatBaseline ? Object.fromEntries(Object.keys(m).map((k) => [k, 0.9 * this.squatBaseline[k] + 0.1 * m[k]])) : { ...m };
        }
        const b = this.squatBaseline, drop = b ? (b.hipHeight - m.hipHeight) / Math.max(0.08, b.legLength) : 0;
        this.diagnostics = { ...this.diagnostics, basis: frame.angleSource === "world" ? "\u4E09\u7EF4\u819D\u89D2" : "\u4E8C\u7EF4\u819D\u89D2\uFF0B\u9ACB\u90E8\u4F4D\u79FB", motion: frame.angleSource === "world" ? `\u819D\u89D2 ${Math.round(frame.angle ?? 0)}\xB0\uFF0C\u4E0B\u8E72 \u2264125\xB0\uFF0F\u7AD9\u8D77 \u2265150\xB0` : `\u9ACB\u90E8\u4E0B\u964D ${Math.round(drop * 100)}% \u817F\u957F\uFF0C\u6B63\u9762\u4E0B\u964D\u76EE\u6807 \u226523%` };
        if (this.calibrated && b) {
          const scale = m.torso / Math.max(0.04, b.torso), feetStable = Math.abs(m.footY - b.footY) < b.legLength * 0.15 && Math.abs(m.footX - b.footX) < b.legLength * 0.2;
          if (frame.angleSource !== "world") {
            const shoulderDrop = (b.shoulderHeight - m.shoulderHeight) / Math.max(0.08, b.legLength);
            const bodyPeak = drop >= 0.23 && shoulderDrop >= 0.12 && scale >= 0.72 && scale <= 1.28 && feetStable;
            frame.peak = frame.peak || bodyPeak;
            frame.start = frame.start && drop <= 0.1;
            if (bodyPeak && (frame.angle ?? 180) > 125) {
              frame.scores = { ...frame.scores, depth: clamp2((drop - 0.12) / 0.25 * 100) };
              frame.score = weights(frame.scores);
            }
          } else frame.peak = frame.peak && feetStable;
        }
      }
      if (this.type === "jumping_jack" && frame.jack) {
        const j = frame.jack;
        if (!this.calibrated && frame.start) this.jackBaseline = this.jackBaseline === null ? j.spread : 0.9 * this.jackBaseline + 0.1 * j.spread;
        const closed = this.jackBaseline ?? 1, open = Math.max(1.4, closed + 0.4);
        this.diagnostics = { ...this.diagnostics, basis: "\u624B\u81C2\u62AC\u8D77\uFF0B\u53CC\u811A\u5F00\u5408", motion: `\u811A\u8DDD ${j.spread.toFixed(2)} \u500D\u80A9\u5BBD\uFF0C\u5C55\u5F00\u76EE\u6807 ${open.toFixed(2)}` };
        if (this.calibrated) {
          frame.start = j.lowered && j.spread <= closed + 0.2;
          if (!frame.start) {
            if (this.motionAt === null) this.motionAt = now;
            if (j.raised) this.armsAt = now;
            if (j.spread >= open) this.legsAt = now;
          }
          frame.peak = !frame.start && this.armsAt !== null && this.legsAt !== null && now - this.armsAt <= 700 && now - this.legsAt <= 700;
          if (frame.start && !this.peak) {
            this.armsAt = null;
            this.legsAt = null;
            this.motionAt = null;
          }
          if (frame.start && this.peak && this.motionAt !== null && now - this.motionAt < 250) {
            this.peak = null;
            this.peakAt = null;
            this.returnAt = null;
            this.armsAt = null;
            this.legsAt = null;
            this.motionAt = null;
          }
        }
      }
      if (!this.calibrated) {
        if (!frame.start) this.calibrationAt = null;
        else {
          this.calibrationAt ??= now;
          if (this.armOnStart || now - this.calibrationAt >= 2e3) {
            this.calibrated = true;
            this.armed = true;
          }
        }
        const feedback2 = this.feedback(frame, this.calibrated);
        const progress = this.calibrated ? 1 : this.calibrationAt === null ? 0 : Math.min(1, (now - this.calibrationAt) / 2e3);
        this.diagnostics = { ...this.diagnostics, stage: this.calibrated ? "ready" : "calibrating", calibrationProgress: progress };
        const message2 = this.calibrated ? COPY_CALIBRATED : frame.start ? `${feedback2.message}\uFF08${Math.round(progress * 100)}%\uFF09` : this.type === "push_up" ? "\u5148\u6446\u597D\u4F38\u81C2\u652F\u6491\uFF0C\u6211\u5728\u7B49\u4F60" : "\u5148\u7AD9\u56DE\u81EA\u7136\u7AD9\u59FF\uFF0C\u966A\u6211\u505C\u4E24\u79D2";
        this.metrics = { ...this.metrics, poseFeedback: feedback2, feedback: message2 };
        return this.metrics;
      }
      const feedback = this.feedback(frame, true);
      let phase = frame.start ? "standing" : this.peak ? "ascending" : "descending";
      if (!frame.start) {
        if (this.movingAt === null) this.movingAt = now;
      } else if (!this.peak) this.movingAt = null;
      if (this.armed && frame.peak) {
        phase = "bottom";
        if (this.peakAt === null) this.peakAt = now;
        if (!this.peak || frame.score >= this.peak.score) this.peak = frame;
      } else this.peakAt = null;
      if (this.armed && !frame.start) frame.issues.forEach((i) => this.issues.add(i));
      if (this.adaptiveSquat && (!frame.start || this.peak)) {
        const cycle = this.squatCycle ??= { samples: 0, invalid: false, totals: emptyFormBreakdown(), depth: 0 };
        if (!frame.squatScorable) cycle.invalid = true;
        else {
          cycle.samples++;
          for (const key of axes) cycle.totals[key] += frame.scores[key];
          if (this.peak && frame.peak) cycle.depth = Math.max(cycle.depth, frame.scores.depth);
        }
      } else if (this.adaptiveSquat) this.squatCycle = null;
      let completedRep = false;
      let unscored = false;
      if (this.peak && frame.start) {
        if (this.returnAt === null) this.returnAt = now;
        if (this.retAnchor === null || now - this.retAnchor > RETURN_WINDOW_MS) {
          this.retAnchor = now;
          this.retAccum = this.retPrevAt !== null ? Math.min(RETURN_FRAME_CAP_MS, now - this.retPrevAt) / 2 : 0;
        } else if (this.retPrevAt !== null) this.retAccum += Math.min(RETURN_FRAME_CAP_MS, now - this.retPrevAt);
        this.retPrevAt = now;
        if (this.retAccum >= (this.type === "jumping_jack" ? 60 : 150)) {
          if (this.returnAt - (this.movingAt ?? this.returnAt) >= MIN_EXCURSION_MS) {
            let completed = this.peak;
            if (this.type === "high_knees") {
              this.pair.set(this.peak.side, this.peak);
              if (this.pair.size === 2) {
                const [l, r] = [this.pair.get("left"), this.pair.get("right")];
                const scores = { ...l.scores };
                axes.forEach((k) => scores[k] = mean(l.scores[k], r.scores[k]));
                scores.symmetry = clamp2(scores.symmetry - Math.abs(l.scores.depth - r.scores.depth) * 0.5);
                completed = { ...l, scores, score: weights(scores) };
                this.pair.clear();
              } else completed = null;
            }
            if (completed && this.adaptiveSquat && this.metrics.reps < this.metrics.targetReps) {
              const cycle = this.squatCycle;
              if (!cycle || cycle.invalid || !cycle.samples) {
                this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, lastRepScore: null, lastRepIssues: [], repeatedIssue: null };
                completed = null;
                completedRep = true;
                unscored = true;
                this.issues.clear();
              } else {
                const scores = { ...cycle.totals };
                for (const key of axes) scores[key] /= cycle.samples;
                scores.depth = cycle.depth;
                completed = { ...completed, scores, score: weights(scores) };
              }
              this.squatCycle = null;
            }
            if (completed && this.metrics.reps < this.metrics.targetReps) {
              const acc = { ...this.metrics.scoreAccumulator, count: this.metrics.scoreAccumulator.count + 1, total: this.metrics.scoreAccumulator.total + completed.score };
              axes.forEach((k) => acc[k] += completed.scores[k]);
              const breakdown = { ...emptyFormBreakdown() };
              axes.forEach((k) => breakdown[k] = Math.round(acc[k] / acc.count));
              const repIssues = [.../* @__PURE__ */ new Set([...this.issues, ...completed.issues])], counts = { ...this.metrics.correctionCounts };
              let repeated = null;
              for (const i of Object.keys(counts)) {
                if (repIssues.includes(i)) counts[i]++;
                this.consecutive[i] = repIssues.includes(i) ? (this.consecutive[i] || 0) + 1 : 0;
                if ((this.consecutive[i] || 0) >= 2) repeated = i;
              }
              this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, formScore: Math.round(acc.total / acc.count), perfectReps: this.metrics.perfectReps + (completed.score >= 90 ? 1 : 0), scoreAccumulator: acc, formBreakdown: breakdown, ...this.adaptiveSquat ? { lastRepScore: completed.score } : {}, correctionCounts: counts, lastRepIssues: repIssues, repeatedIssue: repeated };
              completedRep = true;
              this.issues.clear();
            }
          }
          this.peak = null;
          this.peakAt = null;
          this.returnAt = null;
          this.retAnchor = null;
          this.retAccum = 0;
          this.retPrevAt = null;
          this.trackingSide = void 0;
          this.armsAt = null;
          this.legsAt = null;
          this.motionAt = null;
        }
      } else {
        this.returnAt = null;
        if (this.peak) this.retPrevAt = now;
      }
      const stage = this.metrics.reps >= this.metrics.targetReps ? "complete" : this.peak ? frame.start ? "returning" : "peak" : frame.peak ? "peak" : frame.start ? "ready" : "moving";
      this.diagnostics = { ...this.diagnostics, stage, pairedSides: [...this.pair.keys()], calibrationProgress: 1 };
      const instructions = {
        squat: { ready: "\u7AD9\u597D\u5566\uFF0C\u5F00\u59CB\u4E0B\u8E72", moving: "\u518D\u5F80\u4E0B\u4E00\u70B9\u70B9\uFF0C\u4F60\u53EF\u4EE5\u7684", peak: "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u8D77\u6765", returning: "\u597D\uFF0C\u7AD9\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B" },
        jumping_jack: { ready: "\u5408\u62E2\u7AD9\u597D\uFF0C\u6211\u4EEC\u5F00\u59CB", moving: "\u4E00\u8D77\u5C55\u5F00\uFF0C\u53CC\u624B\u62AC\u8FC7\u80A9", peak: "\u5C55\u5F00\u5230\u4F4D\u2014\u2014\u5408\u62E2\u56DE\u6765", returning: "\u597D\uFF0C\u5408\u62E2\u7AD9\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B" },
        high_knees: { ready: "\u7AD9\u597D\u5566\uFF0C\u4EA4\u66FF\u62AC\u817F", moving: "\u518D\u62AC\u9AD8\u4E00\u70B9\u70B9\uFF0C\u4F60\u53EF\u4EE5\u7684", peak: "\u5230\u4F4D\u2014\u2014\u843D\u4E0B\uFF0C\u6362\u53E6\u4E00\u4FA7", returning: "\u597D\uFF0C\u843D\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B" },
        push_up: { ready: "\u652F\u6491\u597D\u5566\uFF0C\u5F00\u59CB\u4E0B\u964D", moving: "\u518D\u5F80\u4E0B\u4E00\u70B9\u70B9\uFF0C\u4F60\u53EF\u4EE5\u7684", peak: "\u5230\u4F4D\u5566\u2014\u2014\u63A8\u8D77\u6765\uFF0C\u56DE\u5230\u652F\u6491", returning: "\u597D\uFF0C\u6491\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B" }
      }[this.type];
      const pairMessage = this.type === "high_knees" && frame.start && this.pair.size === 1 ? `\u5DF2\u5B8C\u6210${this.pair.has("left") ? "\u5DE6" : "\u53F3"}\u4FA7\uFF0C\u518D\u6765${this.pair.has("left") ? "\u53F3" : "\u5DE6"}\u4FA7\uFF0C\u51D1\u6210\u4E00\u7EC4` : null;
      const message = stage === "complete" ? "\u76EE\u6807\u5B8C\u6210\u5566\uFF0C\u6F02\u4EAE" : unscored ? "\u8BB0\u4E0B\u5566 \xB7 \u4E24\u4FA7\u6CA1\u770B\u5168\uFF0C\u8FD9\u6B21\u4E0D\u8BC4\u5206" : completedRep ? `\u597D\uFF0C\u7B2C ${this.metrics.reps} ${exerciseInfo(this.type).unit}\uFF0C\u8BB0\u4E0B\u5566` : frame.peak && !this.peak ? this.type === "jumping_jack" ? "\u8282\u594F\u5C31\u8FD9\u6837\uFF0C\u4FDD\u6301\u4F4F" : "\u5230\u4F4D\u5566\uFF0C\u7A33\u4F4F\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B" : pairMessage || instructions[stage];
      this.metrics = { ...this.metrics, phase, poseFeedback: feedback, feedback: message };
      return this.metrics;
    }
  };

  // src/features/motion/lib/axisAssessment.ts
  var AXIS_KEYS = ["depth", "stability", "trunk", "symmetry"];
  var SYNC_MAX_MS = 150;
  var SLIGHT_MAX_MS = 800;
  var syncCategoryForOffset = (offsetMs) => offsetMs <= SYNC_MAX_MS ? "sync" : offsetMs <= SLIGHT_MAX_MS ? "slight" : "alternating";
  var frontRaiseBandFor = (raisedDeg) => raisedDeg < 80 ? "below" : raisedDeg <= 115 ? "shoulder" : "over";
  var allNumericAssessments = () => ({
    depth: { kind: "numeric" },
    stability: { kind: "numeric" },
    trunk: { kind: "numeric" },
    symmetry: { kind: "numeric" }
  });
  var BY_DESIGN_UNASSESSABLE_REASONS = ["view", "single-side"];
  var totalWithheld = (a) => {
    if (!a) return false;
    return AXIS_KEYS.some((k) => {
      const ax = a[k];
      return ax.kind === "unassessable" && !BY_DESIGN_UNASSESSABLE_REASONS.includes(ax.reason);
    });
  };

  // ../server/src/gym/library-recognition.json
  var library_recognition_default = {
    goblet_squat: {
      name: "\u9AD8\u811A\u676F\u6DF1\u8E72",
      english: "GOBLET SQUAT",
      exerciseIds: [
        "exdb:1760"
      ],
      placement: "\u5168\u8EAB\u7565\u4FA7\u9762\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u53EF\u89C1\u3002",
      instruction: "\u53CC\u624B\u5728\u80F8\u524D\u6301\u94C3\uFF0C\u7AD9\u7A33\u4E24\u79D2\uFF1B\u4E0B\u8E72\u540E\u56DE\u5230\u7AD9\u7ACB\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u7AD9\u7ACB\u5C31\u7EEA",
        "\u4E0B\u8E72\u4E2D",
        "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u8D77\u6765",
        "\u597D\uFF0C\u7AD9\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ]
    },
    barbell_back_squat: {
      name: "\u6760\u94C3\u80CC\u8E72",
      english: "BARBELL BACK SQUAT",
      exerciseIds: [
        "exdb:0043",
        "exdb:1436"
      ],
      placement: "\u5168\u8EAB\u7565\u4FA7\u9762\uFF0C\u6760\u94C3\u548C\u8EAB\u4F53\u4E0D\u53EF\u906E\u6321\u80A9\u3001\u9ACB\u3001\u819D\u4E0E\u811A\u8E1D\u3002",
      instruction: "\u6760\u94C3\u4F4D\u4E8E\u4E0A\u80CC\uFF0C\u7AD9\u7A33\u4E24\u79D2\uFF1B\u5B8C\u6210\u4E0B\u8E72\u5E76\u56DE\u5230\u7AD9\u7ACB\u3002\u8BF7\u81EA\u884C\u786E\u8BA4\u4FDD\u62A4\u6761\u4EF6\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u7AD9\u7ACB\u5C31\u7EEA",
        "\u4E0B\u8E72\u4E2D",
        "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u8D77\u6765",
        "\u597D\uFF0C\u7AD9\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ]
    },
    barbell_curl: {
      name: "\u7AD9\u59FF\u6760\u94C3\u5F2F\u4E3E",
      english: "BARBELL CURL",
      exerciseIds: [
        "exdb:0031"
      ],
      placement: "\u6B63\u9762\u7565\u4FA7\u8EAB\uFF0C\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u548C\u9ACB\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u4E0A\u81C2\u9760\u8FD1\u8EAB\u4F53\uFF0C\u53CC\u8098\u4F38\u5C55\u7AD9\u7A33\u4E24\u79D2\uFF1B\u540C\u65F6\u5F2F\u4E3E\uFF0C\u518D\u63A7\u5236\u653E\u56DE\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u4F38\u81C2\u5C31\u7EEA",
        "\u5F2F\u4E3E\u4E2D",
        "\u6F02\u4EAE\uFF0C\u5C31\u662F\u8FD9\u4E2A\u9AD8\u5EA6\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ]
    },
    bench_press: {
      name: "\u5E73\u677F\u5367\u63A8",
      english: "BENCH PRESS",
      exerciseIds: [
        "exdb:0025",
        "exdb:0289"
      ],
      placement: "\u659C\u4FA7\u9762\u62CD\u6444\u5E73\u51F3\u4E0A\u7684\u5168\u8EAB\uFF0C\u53CC\u80A9\u3001\u8098\u3001\u8155\u3001\u9ACB\u548C\u811A\u8E1D\u6E05\u6670\uFF1B\u5668\u68B0\u4E0D\u5F97\u6321\u4F4F\u5173\u8282\u3002",
      instruction: "\u5E73\u8EBA\u51F3\u4E0A\u3001\u53CC\u811A\u652F\u6491\uFF0C\u53CC\u81C2\u5728\u80F8\u4E0A\u65B9\u4F38\u5C55\u6821\u51C6\u4E24\u79D2\uFF1B\u5C48\u8098\u4E0B\u653E\uFF0C\u518D\u63A8\u56DE\u3002\u81EA\u884C\u786E\u8BA4\u5668\u68B0\u3001\u4FDD\u62A4\u4E0E\u63E1\u6CD5\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u4F38\u81C2\u5C31\u7EEA",
        "\u5C48\u8098\u4E0B\u653E\u4E2D",
        "\u5230\u4F4D\u5566\u2014\u2014\u63A8\u8D77\u6765\uFF0C\u56DE\u5230\u4F38\u81C2",
        "\u597D\uFF0C\u63A8\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ]
    },
    reverse_fly: {
      name: "\u7AD9\u59FF\u54D1\u94C3\u4FEF\u8EAB\u53CD\u5411\u98DE\u9E1F",
      english: "REVERSE FLY",
      exerciseIds: [
        "exdb:0378",
        "exdb:0383",
        "exdb:2292"
      ],
      placement: "\u6B63\u9762\u659C\u4FA7\u7EA645\u5EA6\uFF0C\u5168\u8EAB\u4E0E\u53CC\u81C2\u5C55\u5F00\u5165\u955C\uFF1B\u9700\u8981\u6E05\u6670\u7684\u4E09\u7EF4\u80A9\u3001\u8098\u3001\u8155\u65B9\u5411\u3002",
      instruction: "\u5C48\u9ACB\u4FEF\u8EAB\u3001\u53CC\u81C2\u5782\u4E0B\u4FDD\u6301\u4E24\u79D2\uFF1B\u53CC\u81C2\u5411\u8EAB\u4F53\u4E24\u4FA7\u6253\u5F00\uFF0C\u518D\u7F13\u6162\u653E\u56DE\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u4FEF\u8EAB\u5782\u81C2\u5C31\u7EEA",
        "\u53CC\u81C2\u5411\u4E24\u4FA7\u6253\u5F00",
        "\u5C55\u5F00\u5230\u4F4D\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ]
    },
    seated_triceps_extension: {
      name: "\u5750\u59FF\u53CC\u624B\u54D1\u94C3\u5934\u4E0A\u81C2\u5C48\u4F38",
      english: "SEATED TRICEPS EXTENSION",
      exerciseIds: [
        "exdb:2188"
      ],
      placement: "\u6B63\u9762\u7565\u4FA7\u8EAB\uFF0C\u5750\u7A33\uFF1B\u53CC\u80A9\u8098\u8155\u9ACB\u53EF\u89C1\uFF0C\u5934\u9876\u53CC\u624B\u4E0D\u51FA\u753B\u3002",
      instruction: "\u53CC\u624B\u63E1\u4E00\u94C3\uFF0C\u53CC\u81C2\u4F38\u76F4\u4E3E\u8FC7\u5934\u9876\u6821\u51C6\u4E24\u79D2\uFF1B\u4E0A\u81C2\u9760\u8FD1\u8033\u4FA7\uFF0C\u5C48\u8098\u4E0B\u653E\uFF0C\u518D\u4F38\u8098\u56DE\u4F4D\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u5934\u4E0A\u4F38\u81C2\u5C31\u7EEA",
        "\u5C48\u8098\u4E0B\u653E\u4E2D",
        "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u4F38\u76F4\u624B\u81C2",
        "\u597D\uFF0C\u4F38\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ]
    },
    barbell_deadlift: {
      name: "\u4F20\u7EDF\u6760\u94C3\u786C\u62C9",
      english: "BARBELL DEADLIFT",
      exerciseIds: [
        "exdb:0032"
      ],
      placement: "\u659C\u4FA7\u9762\u5168\u8EAB\uFF0C\u81F3\u5C11\u4E00\u4FA7\u80A9\u3001\u8098\u3001\u8155\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u8FDE\u7EED\u6E05\u6670\uFF0C\u6760\u94C3\u4E0D\u53EF\u906E\u6321\u5173\u8282\u3002",
      instruction: "\u5148\u5728\u5C48\u9ACB\u5C48\u819D\u3001\u53CC\u81C2\u4F38\u76F4\u4E14\u624B\u63A5\u8FD1\u5C0F\u817F\u7684\u8D77\u59CB\u4F4D\u4FDD\u6301\u4E24\u79D2\uFF1B\u4F38\u9ACB\u4F38\u819D\u7AD9\u76F4\uFF0C\u518D\u63A7\u5236\u8FD4\u56DE\u8D77\u59CB\u4F4D\uFF0C\u5B8C\u6574\u5F80\u8FD4\u8BA1\u4E00\u6B21\u3002",
      joints: "\u80A9\u3001\u8098\u3001\u8155\u3001\u9ACB\u3001\u819D\u3001\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u4F4E\u4F4D\u8D77\u59CB\u5C31\u7EEA",
        "\u4F38\u9ACB\u4F38\u819D\u62C9\u8D77\u4E2D",
        "\u7AD9\u76F4\u5566\u2014\u2014\u63A7\u5236\u7740\u6162\u6162\u653E\u56DE",
        "\u597D\uFF0C\u653E\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 4
    },
    barbell_row: {
      name: "\u6760\u94C3\u4FEF\u8EAB\u5212\u8239",
      english: "BARBELL ROW",
      exerciseIds: [
        "exdb:0027"
      ],
      placement: "\u659C\u4FA7\u9762\uFF0C\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u9ACB\u548C\u819D\u53EF\u89C1\u3002",
      instruction: "\u4FDD\u6301\u4FEF\u8EAB\u3001\u53CC\u81C2\u4E0B\u5782\u4E24\u79D2\uFF1B\u5C06\u6760\u94C3\u62C9\u5411\u8EAF\u5E72\uFF0C\u518D\u63A7\u5236\u653E\u56DE\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u4FEF\u8EAB\u5782\u81C2\u5C31\u7EEA",
        "\u53CC\u8098\u5411\u540E\u62C9\u8D77",
        "\u62C9\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 4
    },
    barbell_front_squat: {
      name: "\u6760\u94C3\u524D\u8E72",
      english: "BARBELL FRONT SQUAT",
      exerciseIds: [
        "exdb:0029",
        "exdb:0039",
        "exdb:0042"
      ],
      placement: "\u5168\u8EAB\u7565\u4FA7\u9762\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u695A\uFF0C\u524D\u67B6\u6760\u94C3\u4E0D\u80FD\u906E\u6321\u5173\u8282\u3002",
      instruction: "\u6760\u94C3\u5728\u80A9\u524D\uFF0C\u62AC\u8098\u7AD9\u7A33\u4E24\u79D2\uFF1B\u5B8C\u6210\u4E0B\u8E72\u5E76\u56DE\u5230\u7AD9\u7ACB\u3002\u81EA\u884C\u786E\u8BA4\u524D\u67B6\u548C\u4FDD\u62A4\u6761\u4EF6\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u7AD9\u7ACB\u5C31\u7EEA",
        "\u4E0B\u8E72\u4E2D",
        "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u8D77\u6765",
        "\u597D\uFF0C\u7AD9\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 4
    },
    incline_bench_press: {
      name: "\u4E0A\u659C\u5367\u63A8",
      english: "INCLINE BENCH PRESS",
      exerciseIds: [
        "exdb:0047",
        "exdb:0314"
      ],
      placement: "\u4FA7\u9762\u6216\u659C\u4FA7\u9762\uFF0C\u5168\u8EAB\u548C\u53CC\u624B\u5165\u955C\uFF0C\u80A9\u80CC\u8D34\u4E0A\u659C\u51F3\u3001\u53CC\u811A\u652F\u6491\uFF1B\u753B\u9762\u9700\u80FD\u770B\u6E05\u659C\u8EBA\u59FF\u6001\u3002",
      instruction: "\u80A9\u80CC\u8D34\u51F3\uFF0C\u53CC\u81C2\u5728\u4E0A\u80F8\u4E0A\u65B9\u4F38\u5C55\u6821\u51C6\u4E24\u79D2\uFF1B\u5C48\u8098\u4E0B\u653E\uFF0C\u518D\u63A8\u56DE\u3002\u4E0D\u80FD\u9A8C\u8BC1\u51F3\u5B50\u89D2\u5EA6\u3001\u91CD\u91CF\u6216\u4FDD\u62A4\u88C5\u7F6E\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u659C\u8EBA\u4F38\u81C2\u5C31\u7EEA",
        "\u5C48\u8098\u4E0B\u653E\u4E2D",
        "\u5230\u4F4D\u5566\u2014\u2014\u63A8\u8D77\u6765\uFF0C\u56DE\u5230\u4F38\u81C2",
        "\u597D\uFF0C\u63A8\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 4
    },
    seated_curl: {
      name: "\u5750\u59FF\u53CC\u81C2\u54D1\u94C3\u5F2F\u4E3E",
      english: "SEATED CURL",
      exerciseIds: [
        "exdb:0391"
      ],
      placement: "\u6B63\u9762\u7565\u4FA7\uFF0C\u5750\u59FF\u3001\u53CC\u80A9\u8098\u8155\u9ACB\u819D\u811A\u8E1D\u6E05\u6670\u3002",
      instruction: "\u5750\u7A33\u3001\u53CC\u811A\u8E29\u5730\uFF0C\u53CC\u81C2\u4F38\u5C55\u4FDD\u6301\u4E24\u79D2\uFF1B\u53CC\u81C2\u540C\u65F6\u5F2F\u4E3E\uFF0C\u518D\u63A7\u5236\u653E\u56DE\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u5750\u59FF\u4F38\u81C2\u5C31\u7EEA",
        "\u53CC\u81C2\u5F2F\u4E3E\u4E2D",
        "\u6F02\u4EAE\uFF0C\u5C31\u662F\u8FD9\u4E2A\u9AD8\u5EA6\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 5
    },
    seated_lateral_raise: {
      name: "\u5750\u59FF\u53CC\u81C2\u54D1\u94C3\u4FA7\u5E73\u4E3E",
      english: "SEATED LATERAL RAISE",
      exerciseIds: [
        "exdb:0396"
      ],
      placement: "\u6B63\u9762\u7565\u4FA7\uFF0C\u5750\u59FF\u53CA\u53CC\u81C2\u4FA7\u4E3E\u540E\u4ECD\u5728\u753B\u9762\u5185\uFF0C\u9700\u8981\u53EF\u9760\u4E09\u7EF4\u80A9\u8098\u8155\u65B9\u5411\u3002",
      instruction: "\u5750\u7A33\u3001\u53CC\u811A\u8E29\u5730\uFF0C\u53CC\u81C2\u5728\u4F53\u4FA7\u4E0B\u5782\u4FDD\u6301\u4E24\u79D2\uFF1B\u5411\u4E24\u4FA7\u62AC\u81F3\u8FD1\u80A9\u9AD8\uFF0C\u518D\u63A7\u5236\u653E\u56DE\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u5750\u59FF\u5782\u81C2\u5C31\u7EEA",
        "\u53CC\u81C2\u5411\u4E24\u4FA7\u62AC\u8D77",
        "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 5
    },
    lying_triceps_extension: {
      name: "\u5E73\u51F3\u53CC\u54D1\u94C3\u4EF0\u5367\u81C2\u5C48\u4F38",
      english: "LYING TRICEPS EXTENSION",
      exerciseIds: [
        "exdb:0351"
      ],
      placement: "\u659C\u4FA7\u9762\u62CD\u6444\uFF0C\u5E73\u8EBA\u51F3\u4E0A\uFF0C\u53CC\u80A9\u8098\u8155\u9ACB\u811A\u8E1D\u5165\u955C\uFF0C\u53CC\u624B\u9760\u8FD1\u5934\u90E8\u65F6\u4E0D\u51FA\u753B\u3002",
      instruction: "\u5E73\u8EBA\u3001\u53CC\u811A\u652F\u6491\uFF0C\u53CC\u81C2\u5728\u80F8\u4E0A\u65B9\u4F38\u76F4\u6821\u51C6\u4E24\u79D2\uFF1B\u4FDD\u6301\u4E0A\u81C2\u4F4D\u7F6E\uFF0C\u5C48\u8098\u5411\u5934\u90E8\u4E0B\u653E\uFF0C\u518D\u4F38\u8098\u56DE\u4F4D\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u4EF0\u5367\u4F38\u81C2\u5C31\u7EEA",
        "\u5C48\u8098\u5411\u5934\u90E8\u4E0B\u653E",
        "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u4F38\u76F4\u624B\u81C2",
        "\u597D\uFF0C\u4F38\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 5
    },
    reverse_barbell_curl: {
      name: "\u7AD9\u59FF\u6760\u94C3\u53CD\u63E1\u5F2F\u4E3E",
      english: "REVERSE BARBELL CURL",
      exerciseIds: [
        "exdb:0080"
      ],
      placement: "\u6B63\u9762\u7565\u4FA7\uFF0C\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u548C\u9ACB\u6E05\u6670\u3002",
      instruction: "\u672C\u4EBA\u4FDD\u6301\u6B63\u624B\u53CD\u63E1\u3001\u638C\u5FC3\u671D\u4E0B\uFF1B\u4F38\u81C2\u7AD9\u7A33\u4E24\u79D2\uFF0C\u53CC\u81C2\u540C\u65F6\u5F2F\u4E3E\u5E76\u653E\u56DE\u3002\u6444\u50CF\u5934\u4E0D\u9A8C\u8BC1\u63E1\u6CD5\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u4F38\u81C2\u5C31\u7EEA",
        "\u53CD\u63E1\u5F2F\u4E3E\u4E2D",
        "\u6F02\u4EAE\uFF0C\u5C31\u662F\u8FD9\u4E2A\u9AD8\u5EA6\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 5
    },
    neutral_seated_press: {
      name: "\u4E2D\u7ACB\u63E1\u5750\u59FF\u53CC\u54D1\u94C3\u80A9\u63A8",
      english: "NEUTRAL SEATED PRESS",
      exerciseIds: [
        "exdb:0404"
      ],
      placement: "\u6B63\u9762\u7565\u4FA7\uFF0C\u53CC\u80A9\u8098\u8155\u9ACB\u53EF\u89C1\uFF0C\u4E3E\u8FC7\u5934\u9876\u7684\u53CC\u624B\u4E0D\u80FD\u51FA\u753B\u3002",
      instruction: "\u5750\u7A33\uFF0C\u53CC\u624B\u5728\u80A9\u9AD8\u4FDD\u6301\u4E24\u79D2\uFF1B\u672C\u4EBA\u4FDD\u6301\u638C\u5FC3\u76F8\u5BF9\uFF0C\u540C\u65F6\u63A8\u8D77\u518D\u653E\u56DE\u3002\u6444\u50CF\u5934\u4E0D\u9A8C\u8BC1\u63E1\u6CD5\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u80A9\u9AD8\u5C31\u7EEA",
        "\u53CC\u81C2\u63A8\u8D77\u4E2D",
        "\u63A8\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE",
        "\u597D\uFF0C\u653E\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 5
    },
    dumbbell_calf_raise: {
      name: "\u5E73\u5730\u53CC\u811A\u54D1\u94C3\u63D0\u8E35",
      english: "DUMBBELL CALF RAISE",
      exerciseIds: [
        "exdb:0417"
      ],
      placement: "\u659C\u4FA7\u5168\u8EAB\uFF0C\u53CC\u811A\u8DDF\u3001\u811A\u8E1D\u548C\u524D\u811A\u638C\u6E05\u6670\u3002\u4EC5\u5E73\u5730\u3001\u53CC\u811A\u540C\u65F6\uFF0C\u4E0D\u4F7F\u7528\u53F0\u9636\u3002",
      instruction: "\u624B\u6301\u54D1\u94C3\u3001\u53CC\u811A\u7AD9\u7A33\uFF0C\u811A\u8DDF\u843D\u5730\u4FDD\u6301\u4E24\u79D2\uFF1B\u540C\u65F6\u63D0\u8E35\uFF0C\u518D\u7F13\u6162\u843D\u8DDF\u3002\u91CD\u91CF\u7531\u672C\u4EBA\u586B\u5199\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D\u3001\u53CC\u811A\u8DDF\u3001\u53CC\u524D\u811A\u638C",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u53CC\u811A\u843D\u8DDF\u5C31\u7EEA",
        "\u53CC\u811A\u63D0\u8E35\u4E2D",
        "\u63D0\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u843D\u8DDF",
        "\u597D\uFF0C\u843D\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 5
    },
    dumbbell_standing_press: {
      name: "\u7AD9\u59FF\u53CC\u54D1\u94C3\u80A9\u63A8",
      english: "DUMBBELL STANDING OVERHEAD PRESS",
      exerciseIds: [
        "exdb:0426"
      ],
      placement: "\u6B63\u9762\u7565\u4FA7\u8EAB\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u548C\u9ACB\u5165\u955C\uFF0C\u4E3E\u8FC7\u5934\u9876\u7684\u53CC\u624B\u4E0D\u80FD\u51FA\u753B\u3002",
      instruction: "\u7AD9\u7A33\uFF0C\u53CC\u624B\u5728\u80A9\u90E8\u9AD8\u5EA6\u4FDD\u6301\u4E24\u79D2\uFF1B\u540C\u65F6\u63A8\u8D77\uFF0C\u518D\u653E\u56DE\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB",
      unit: "\u6B21",
      axes: [
        "\u63A8\u4E3E\u5E45\u5EA6",
        "\u63A8\u4E3E\u63A7\u5236",
        "\u8EAF\u5E72\u63A7\u5236",
        "\u53CC\u81C2\u534F\u8C03"
      ],
      stages: [
        "\u80A9\u90E8\u8D77\u59CB\u4F4D\u5C31\u7EEA",
        "\u63A8\u4E3E\u4E2D",
        "\u63A8\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    barbell_military_press: {
      name: "\u6760\u94C3\u7AD9\u59FF\u519B\u4E8B\u63A8\u4E3E",
      english: "BARBELL STANDING MILITARY PRESS",
      exerciseIds: [
        "exdb:1456",
        "exdb:1457"
      ],
      placement: "\u659C\u4FA7\u9762\u62CD\u6444\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u548C\u9ACB\u5165\u955C\uFF0C\u4E3E\u8FC7\u5934\u9876\u7684\u53CC\u624B\u4E0D\u80FD\u51FA\u753B\u3002",
      instruction: "\u7AD9\u7A33\uFF0C\u6760\u5728\u80A9\u90E8\u9AD8\u5EA6\u4FDD\u6301\u4E24\u79D2\uFF1B\u63A8\u8D77\u81F3\u53CC\u81C2\u4F38\u76F4\uFF0C\u518D\u653E\u56DE\u3002\u5BBD\u7A84\u63E1\u5747\u53EF\uFF0C\u6444\u50CF\u5934\u4E0D\u9A8C\u8BC1\u63E1\u6CD5\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB",
      unit: "\u6B21",
      axes: [
        "\u63A8\u4E3E\u5E45\u5EA6",
        "\u63A8\u4E3E\u63A7\u5236",
        "\u8EAF\u5E72\u63A7\u5236",
        "\u53CC\u81C2\u534F\u8C03"
      ],
      stages: [
        "\u80A9\u90E8\u8D77\u59CB\u4F4D\u5C31\u7EEA",
        "\u63A8\u4E3E\u4E2D",
        "\u63A8\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    dumbbell_reverse_lunge: {
      name: "\u54D1\u94C3\u540E\u64A4\u5F13\u6B65",
      english: "DUMBBELL REAR LUNGE",
      exerciseIds: [
        "exdb:0381"
      ],
      placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u53CC\u811A\u540E\u64A4\u4ECD\u5728\u753B\u9762\u5185\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u7AD9\u7A33\u4E24\u79D2\uFF1B\u4E00\u4FA7\u5411\u540E\u64A4\u5E76\u4E0B\u6C89\uFF0C\u518D\u56DE\u5230\u5E76\u811A\u7AD9\u7ACB\uFF1B\u6BCF\u4FA7\u5B8C\u6210\u8BA1\u4E00\u6B21\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u5F13\u6B65\u5E45\u5EA6",
        "\u652F\u6491\u63A7\u5236",
        "\u8EAF\u5E72\u63A7\u5236",
        "\u5DE6\u53F3\u534F\u8C03"
      ],
      stages: [
        "\u5E76\u811A\u7AD9\u7ACB\u5C31\u7EEA",
        "\u540E\u64A4\u4E0B\u6C89\u4E2D",
        "\u5230\u4F4D\u5566\u2014\u2014\u56DE\u5230\u7AD9\u7ACB",
        "\u597D\uFF0C\u7AD9\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    dumbbell_deadlift: {
      name: "\u54D1\u94C3\u4F20\u7EDF\u786C\u62C9",
      english: "DUMBBELL DEADLIFT",
      exerciseIds: [
        "exdb:0300"
      ],
      placement: "\u659C\u4FA7\u9762\u5168\u8EAB\uFF0C\u81F3\u5C11\u4E00\u4FA7\u80A9\u3001\u8098\u3001\u8155\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u8FDE\u7EED\u6E05\u6670\uFF0C\u54D1\u94C3\u4E0D\u53EF\u906E\u6321\u5173\u8282\u3002",
      instruction: "\u53CC\u624B\u6301\u94C3\u4E8E\u4F53\u4FA7\uFF0C\u5148\u5728\u5C48\u9ACB\u5C48\u819D\u3001\u53CC\u81C2\u4F38\u76F4\u4E14\u624B\u63A5\u8FD1\u5C0F\u817F\u7684\u8D77\u59CB\u4F4D\u4FDD\u6301\u4E24\u79D2\uFF1B\u4F38\u9ACB\u4F38\u819D\u7AD9\u76F4\uFF0C\u518D\u63A7\u5236\u8FD4\u56DE\u8D77\u59CB\u4F4D\uFF0C\u5B8C\u6574\u5F80\u8FD4\u8BA1\u4E00\u6B21\u3002",
      joints: "\u80A9\u3001\u8098\u3001\u8155\u3001\u9ACB\u3001\u819D\u3001\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u52A8\u4F5C\u5E45\u5EA6",
        "\u7A33\u5B9A\u63A7\u5236",
        "\u8EAB\u4F53\u59FF\u6001",
        "\u52A8\u4F5C\u534F\u8C03"
      ],
      stages: [
        "\u4F4E\u4F4D\u8D77\u59CB\u5C31\u7EEA",
        "\u4F38\u9ACB\u4F38\u819D\u62C9\u8D77\u4E2D",
        "\u7AD9\u76F4\u5566\u2014\u2014\u63A7\u5236\u7740\u6162\u6162\u653E\u56DE",
        "\u597D\uFF0C\u653E\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    one_arm_row: {
      name: "\u54D1\u94C3\u5355\u81C2\u4FEF\u8EAB\u5212\u8239",
      english: "DUMBBELL ONE ARM BENT-OVER ROW",
      exerciseIds: [
        "exdb:0292"
      ],
      placement: "\u4ECE\u659C\u4FA7\u9762\u671D\u5411\u5DE5\u4F5C\u4FA7\u62CD\u6444\uFF0C\u5DE5\u4F5C\u4FA7\u80A9\u3001\u8098\u3001\u624B\u8155\u548C\u53CC\u9ACB\u3001\u53CC\u819D\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u4FDD\u6301\u4FEF\u8EAB\uFF0C\u5DE5\u4F5C\u4FA7\u624B\u81C2\u5782\u4E0B\u4E24\u79D2\uFF1B\u8098\u5411\u540E\u62C9\u8D77\uFF0C\u518D\u653E\u56DE\uFF1B\u652F\u6491\u4FA7\u4FDD\u6301\u4E0D\u52A8\uFF0C\u6362\u4FA7\u5148\u5B8C\u6210\u672C\u4FA7\u518D\u5F00\u59CB\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D",
      unit: "\u6B21",
      axes: [
        "\u5212\u8239\u5E45\u5EA6",
        "\u624B\u81C2\u63A7\u5236",
        "\u4FEF\u8EAB\u7A33\u5B9A",
        "\u652F\u6491\u7A33\u5B9A"
      ],
      stages: [
        "\u4FEF\u8EAB\u5782\u81C2\u5C31\u7EEA",
        "\u5355\u81C2\u62C9\u8D77\u4E2D",
        "\u62C9\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    lying_leg_raise: {
      name: "\u5E73\u51F3\u4EF0\u5367\u4E3E\u817F",
      english: "LYING LEG RAISE FLAT BENCH",
      exerciseIds: [
        "exdb:0620"
      ],
      placement: "\u4FA7\u9762\u62CD\u6444\u5E76\u964D\u4F4E\u673A\u4F4D\uFF0C\u5168\u8EAB\u5165\u955C\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u4EF0\u5367\u3001\u53CC\u817F\u4F38\u76F4\u8D34\u4F4F\u51F3\u9762\uFF0C\u505C\u7A33\u4E24\u79D2\uFF1B\u53CC\u817F\u4E00\u8D77\u4E3E\u81F3\u63A5\u8FD1\u5782\u76F4\uFF0C\u518D\u7F13\u6162\u653E\u56DE\u3002\u5C48\u819D\u4E3E\u817F\u6309\u540C\u4E00\u6761\u76EE\u8BA1\uFF0C\u4E0D\u505A\u533A\u5206\uFF1B\u8D77\u5750\u4E0D\u8BA1\u5165\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u4E3E\u817F\u5E45\u5EA6",
        "\u817F\u90E8\u63A7\u5236",
        "\u8EAF\u5E72\u7A33\u5B9A",
        "\u53CC\u817F\u534F\u8C03"
      ],
      stages: [
        "\u5E73\u8EBA\u4F38\u817F\u5C31\u7EEA",
        "\u4E3E\u817F\u4E2D",
        "\u4E3E\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    upright_row: {
      name: "\u54D1\u94C3\u76F4\u7ACB\u5212\u8239",
      english: "DUMBBELL UPRIGHT ROW",
      exerciseIds: [
        "exdb:0437"
      ],
      placement: "\u6B63\u9762\u7565\u4FA7\u8EAB\uFF0C\u4E0A\u534A\u8EAB\u5165\u955C\uFF0C\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u548C\u9ACB\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u53CC\u81C2\u5782\u4E0B\u7AD9\u7A33\u4E24\u79D2\uFF1B\u6CBF\u8EAB\u4F53\u524D\u63D0\u81F3\u80F8\u53E3\u4EE5\u4E0A\u3001\u53CC\u8098\u5411\u5916\u6253\u5F00\uFF0C\u518D\u7F13\u6162\u653E\u56DE\u3002\u53EA\u8038\u80A9\u4E0D\u8BA1\u5165\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB",
      unit: "\u6B21",
      axes: [
        "\u63D0\u62C9\u5E45\u5EA6",
        "\u624B\u81C2\u63A7\u5236",
        "\u8EAF\u5E72\u7A33\u5B9A",
        "\u53CC\u81C2\u534F\u8C03"
      ],
      stages: [
        "\u5782\u81C2\u5C31\u7EEA",
        "\u63D0\u62C9\u4E2D",
        "\u62C9\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765",
        "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    mountain_climber: {
      name: "\u767B\u5C71\u8DD1",
      english: "MOUNTAIN CLIMBER",
      exerciseIds: [
        "exdb:0630"
      ],
      placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u53CC\u624B\u6491\u5730\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u4FEF\u6491\u4F38\u817F\u505C\u7A33\u4E24\u79D2\uFF1B\u5DE6\u53F3\u817F\u4EA4\u66FF\u5411\u80F8\u53E3\u56DE\u6536\u518D\u8E6C\u56DE\u3002\u6162\u901F\u4E5F\u80FD\u8BA1\uFF0C\u5148\u628A\u4EA4\u66FF\u8282\u594F\u505A\u7A33\uFF1B\u53CC\u817F\u540C\u65F6\u56DE\u6536\u4E0D\u8BA1\u5165\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u56DE\u6536\u5E45\u5EA6",
        "\u817F\u90E8\u63A7\u5236",
        "\u4FEF\u6491\u7A33\u5B9A",
        "\u5DE6\u53F3\u534F\u8C03"
      ],
      stages: [
        "\u4FEF\u6491\u5C31\u7EEA",
        "\u4EA4\u66FF\u56DE\u6536\u4E2D",
        "\u56DE\u6536\u5230\u4F4D\u2014\u2014\u8E6C\u56DE\u53BB",
        "\u597D\uFF0C\u56DE\u5230\u4FEF\u6491\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    split_squat: {
      name: "\u54D1\u94C3\u5355\u817F\u5206\u817F\u8E72",
      english: "DUMBBELL SINGLE LEG SPLIT SQUAT",
      exerciseIds: [
        "exdb:0410"
      ],
      placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u524D\u817F\u4E00\u4FA7\u671D\u5411\u955C\u5934\uFF0C\u524D\u811A\u843D\u5730\u3001\u540E\u811A\u62AC\u9AD8\u653E\u5728\u51F3\u4E0A\uFF0C\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u5206\u817F\u7AD9\u7A33\u4E24\u79D2\uFF1B\u5782\u76F4\u4E0B\u6C89\u81F3\u524D\u817F\u5230\u4F4D\uFF0C\u518D\u7AD9\u8D77\u3002\u6362\u4FA7\u65F6\u5148\u7AD9\u7A33\uFF0C\u518D\u5F00\u59CB\u4E0B\u4E00\u4FA7\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D\u3001\u53CC\u811A\u8DDF\u3001\u53CC\u811A\u5C16",
      unit: "\u6B21",
      axes: [
        "\u4E0B\u6C89\u5E45\u5EA6",
        "\u652F\u6491\u63A7\u5236",
        "\u8EAF\u5E72\u7A33\u5B9A",
        "\u540E\u811A\u7A33\u5B9A"
      ],
      stages: [
        "\u5206\u817F\u7AD9\u7ACB\u5C31\u7EEA",
        "\u4E0B\u6C89\u4E2D",
        "\u6C89\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u8D77",
        "\u597D\uFF0C\u7AD9\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    seated_calf_raise: {
      name: "\u5750\u59FF\u54D1\u94C3\u63D0\u8E35",
      english: "DUMBBELL SEATED CALF RAISE",
      exerciseIds: [
        "exdb:1379"
      ],
      placement: "\u4ECE\u659C\u4FA7\u9762\u62CD\u6444\u5C0F\u817F\u548C\u53CC\u811A\uFF0C\u9ACB\u3001\u819D\u3001\u811A\u8E1D\u3001\u811A\u8DDF\u548C\u524D\u811A\u638C\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u5750\u7A33\u3001\u53CC\u819D\u5F2F\u66F2\u3001\u53CC\u811A\u5E73\u653E\uFF0C\u811A\u8DDF\u843D\u5730\u505C\u7A33\u4E24\u79D2\uFF1B\u53CC\u811A\u540C\u65F6\u63D0\u8E35\uFF0C\u518D\u7F13\u6162\u843D\u56DE\u3002",
      joints: "\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D\u3001\u53CC\u811A\u8DDF\u3001\u53CC\u524D\u811A\u638C",
      unit: "\u6B21",
      axes: [
        "\u63D0\u8E35\u5E45\u5EA6",
        "\u843D\u8DDF\u63A7\u5236",
        "\u5750\u59FF\u7A33\u5B9A",
        "\u53CC\u811A\u534F\u8C03"
      ],
      stages: [
        "\u811A\u8DDF\u843D\u5730\u5C31\u7EEA",
        "\u63D0\u8E35\u4E2D",
        "\u63D0\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u843D\u8DDF",
        "\u597D\uFF0C\u843D\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    barbell_good_morning: {
      name: "\u6760\u94C3\u65E9\u5B89\u5F0F",
      english: "BARBELL GOOD MORNING",
      exerciseIds: [
        "exdb:0044"
      ],
      placement: "\u659C\u4FA7\u9762\u5168\u8EAB\u62CD\u6444\uFF0C\u6760\u94C3\u4F4D\u4E8E\u4E0A\u80CC\uFF0C\u4E0D\u53EF\u906E\u6321\u80A9\u3001\u9ACB\u3001\u819D\u4E0E\u811A\u8E1D\u3002",
      instruction: "\u6760\u94C3\u4F4D\u4E8E\u4E0A\u80CC\uFF0C\u7AD9\u76F4\u505C\u7A33\u4E24\u79D2\uFF1B\u819D\u76D6\u4FDD\u6301\u5FAE\u5C48\u3001\u9ACB\u5411\u540E\u6298\u53E0\u4FEF\u8EAB\uFF0C\u518D\u56DE\u5230\u7AD9\u76F4\u3002\u8BF7\u81EA\u884C\u786E\u8BA4\u4FDD\u62A4\u6761\u4EF6\u3002\u4E0E\u7F57\u9A6C\u5C3C\u4E9A\u786C\u62C9\u7684\u533A\u522B\u5728\u94C3\u4F4D\uFF08\u80CC\u4E0A vs \u624B\u6301\u4E0B\u5782\uFF09\uFF0C\u8BC6\u522B\u4E0D\u505A\u4E92\u65A5\u5224\u522B\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u9ACB\u3001\u53CC\u819D\u3001\u53CC\u811A\u8E1D",
      unit: "\u6B21",
      axes: [
        "\u4FEF\u8EAB\u5E45\u5EA6",
        "\u52A8\u4F5C\u63A7\u5236",
        "\u8EAF\u5E72\u59FF\u6001",
        "\u5DE6\u53F3\u534F\u8C03"
      ],
      stages: [
        "\u7AD9\u76F4\u5C31\u7EEA",
        "\u4FEF\u8EAB\u4E2D",
        "\u4FEF\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u7AD9\u76F4",
        "\u597D\uFF0C\u7AD9\u7A33\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    },
    bench_dip: {
      name: "\u5C48\u819D\u51F3\u4E0A\u81C2\u5C48\u4F38",
      english: "BENCH DIP (KNEES BENT)",
      exerciseIds: [
        "exdb:0129"
      ],
      placement: "\u4FA7\u9762\u62CD\u6444\uFF0C\u4E0A\u534A\u8EAB\u548C\u51F3\u9762\u5165\u955C\uFF0C\u80A9\u3001\u8098\u3001\u624B\u8155\u548C\u9ACB\u6E05\u6670\u53EF\u89C1\u3002",
      instruction: "\u53CC\u624B\u5728\u8EAB\u540E\u6491\u4F4F\u51F3\u6CBF\u3001\u4F38\u76F4\u624B\u81C2\u505C\u7A33\u4E24\u79D2\uFF1B\u5C48\u8098\u4E0B\u6C89\u8EAB\u4F53\uFF0C\u518D\u63A8\u56DE\u4F38\u76F4\u3002\u53EA\u5750\u4E0B\u4E0D\u5C48\u8098\u4E0D\u8BA1\u5165\u3002",
      joints: "\u53CC\u80A9\u3001\u53CC\u8098\u3001\u53CC\u624B\u8155\u3001\u53CC\u9ACB",
      unit: "\u6B21",
      axes: [
        "\u4E0B\u6C89\u5E45\u5EA6",
        "\u624B\u81C2\u63A7\u5236",
        "\u8EAF\u5E72\u7A33\u5B9A",
        "\u53CC\u81C2\u534F\u8C03"
      ],
      stages: [
        "\u4F38\u81C2\u652F\u6491\u5C31\u7EEA",
        "\u4E0B\u6C89\u4E2D",
        "\u6C89\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u63A8\u8D77",
        "\u597D\uFF0C\u63A8\u56DE\u6765\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"
      ],
      recognitionVersion: 6
    }
  };

  // src/features/gym/libraryRecognition.ts
  var LIBRARY_RECOGNITION = library_recognition_default;
  var isLibraryRecognition = (value) => Object.prototype.hasOwnProperty.call(library_recognition_default, value);

  // src/features/motion/lib/extendedRecognition.ts
  var cap = (n) => Math.max(0, Math.min(100, n));
  var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  var vector = (a, b) => [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
  var dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
  var norm = (v) => v.map((x) => x / (Math.hypot(...v) || 1));
  var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  var angle3 = (a, b, c) => Math.acos(Math.max(-1, Math.min(1, dot(norm(vector(a, b)), norm(vector(c, b)))))) * 180 / Math.PI;
  var mean2 = (a, b) => (a + b) / 2;
  var freshSideCycle = () => ({ movingAt: null, peakStart: null, peakEnd: 0, peakElbow: 180, peakAmp: 0, peakPosture: 100, peakOther: 180, otherBase: 180, track: freshPeakTrack(), prevAt: null, prevAngle: 180, returnSince: null, returnAccum: 0, scoring: true, controlMax: 0, shiftMax: 0, speedMax: 0, sampleAt: null, sampleAngle: 180, controlSamples: [], speedSpans: [], samples: [], overshoot: false, dirLatched: false, dirMixed: false, dirTurned: false, fwdRun: null, latRun: null, supportBase: null, supportPeak: null, peakWindows: [], returnTouched: false, returnTouchAt: null, evidence: null });
  var SUSTAIN_MS = 150;
  var CALIBRATION_STALE_MS = 1e4;
  var REARM_MIN_SEGMENT_MS = 1500;
  var SEGMENT_GAP_MS = 500;
  var PEAK_PAIR_WINDOW_MS = 800;
  function sustainedPeak(spans, fallback) {
    if (spans.length < 3) return fallback;
    const values = [...new Set(spans.map((s) => s.v))].sort((a, b) => b - a);
    for (const v of values) {
      let runStart = null, runEnd = 0, cover = 0;
      for (const s of spans) {
        if (s.v >= v) {
          if (runStart === null || s.start > runEnd + 1) {
            runStart = s.start;
            runEnd = s.end;
          } else runEnd = Math.max(runEnd, s.end);
          cover = Math.max(cover, runEnd - runStart);
        } else runStart = null;
      }
      if (cover >= SUSTAIN_MS) return v;
    }
    return fallback;
  }
  function controlSpans(samples, end) {
    const spans = [];
    for (let i = 0; i < samples.length; i++) {
      const t = samples[i].t;
      const next = i + 1 < samples.length ? samples[i + 1].t : Math.min(end, t + Math.min(i > 0 ? t - samples[i - 1].t : 100, SUSTAIN_MS));
      spans.push({ start: t, end: Math.max(t, next), v: samples[i].v });
    }
    return spans;
  }
  function zonePortion(prev, cur, threshold, above, prevAt, now) {
    const dt = now - prevAt;
    if (dt <= 0) return { start: now, ms: 0 };
    const inPrev = above ? prev >= threshold : prev <= threshold, inCur = above ? cur >= threshold : cur <= threshold;
    if (inPrev && inCur) return { start: prevAt, ms: dt };
    if (!inPrev && !inCur) return { start: now, ms: 0 };
    const tc = prevAt + dt * ((threshold - prev) / (cur - prev));
    return inCur ? { start: tc, ms: now - tc } : { start: prevAt, ms: tc - prevAt };
  }
  var RETURN_HOLD_MS = 150;
  var RETURN_WINDOW_MS2 = 500;
  var RETURN_FRAME_CAP_MS2 = 100;
  var PEAK_MIN_DWELL_MS = 25;
  var PEAK_GAP_MS = 150;
  var MIN_EXCURSION_MS2 = 250;
  var PEAK_EVIDENCE_WINDOW_MS = 300;
  var PEAK_EVIDENCE_BAND_DEG = 10;
  var EVIDENCE_MIN_SPAN_MS = 50;
  var EVIDENCE_CLEAR_BENT_DEG = 130;
  var CYCLE_PRESERVE_MS = 2e3;
  var SINGLE_SIDE_TYPES = /* @__PURE__ */ new Set(["romanian_deadlift", "glute_bridge", "barbell_deadlift", "lying_leg_raise"]);
  var CONTROL_SUSPENDED_TYPES = /* @__PURE__ */ new Set(["hammer_curl", "seated_curl", "triceps_kickback"]);
  var CHANNEL_SUSPENDED_AXES = /* @__PURE__ */ new Map([
    ["hammer_curl", /* @__PURE__ */ new Set(["trunk"])],
    ["front_raise", /* @__PURE__ */ new Set(["depth", "stability", "trunk"])]
  ]);
  var stabilityWithoutControl = (speed, duration) => cap(100 - Math.max(0, speed - 260) * 0.08 - Math.max(0, 0.6 - duration) * 70);
  var CANNOT_ASSESS_AFTER_MS = 3e3;
  function evaluatePeakEvidence(samples, bestAt, best) {
    const idx = samples.findIndex((s) => s.t === bestAt);
    if (idx < 0) return "insufficient";
    const band = best - PEAK_EVIDENCE_BAND_DEG;
    const gaps = [];
    for (let i = 1; i < samples.length; i++) {
      const g = samples[i].t - samples[i - 1].t;
      if (g > 0 && Math.abs(samples[i].t - bestAt) <= 1e3) gaps.push(g);
    }
    gaps.sort((a, b) => a - b);
    const cadence = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    const chainGap = Math.min(1e3, Math.max(PEAK_GAP_MS, cadence * 2));
    let lo = idx, hi = idx;
    while (lo > 0) {
      const a = samples[lo - 1], b = samples[lo];
      if (b.t - a.t > chainGap || a.raised < band || bestAt - a.t > PEAK_EVIDENCE_WINDOW_MS) break;
      lo--;
    }
    while (hi < samples.length - 1) {
      const a = samples[hi], b = samples[hi + 1];
      if (b.t - a.t > chainGap || b.raised < band || b.t - bestAt > PEAK_EVIDENCE_WINDOW_MS) break;
      hi++;
    }
    const near = samples.slice(lo, hi + 1);
    const counter = (s) => s.elbow < EVIDENCE_CLEAR_BENT_DEG || s.lat;
    if (counter(samples[idx])) return "revoked";
    let runStart = null, runN = 0;
    for (const s of near) {
      if (counter(s)) {
        if (runStart === null) {
          runStart = s.t;
          runN = 1;
        } else runN++;
        if (runN >= 2 && s.t - runStart >= EVIDENCE_MIN_SPAN_MS) return "revoked";
      } else {
        runStart = null;
        runN = 0;
      }
    }
    const ok = near.filter((s) => s.elbow >= 140 && s.fwd);
    return ok.length >= 2 && ok[ok.length - 1].t - ok[0].t >= EVIDENCE_MIN_SPAN_MS ? "qualified" : "insufficient";
  }
  var COPY_RAISE_OVERSHOOT = "\u4E3E\u5F97\u6709\u70B9\u9AD8\u5566\u2014\u2014\u5230\u80A9\u8180\u9AD8\u5C31\u597D";
  var COPY_RAISE_TURNED = "\u521A\u521A\u8F6C\u6210\u4FA7\u8FB9\u5566\u2014\u2014\u524D\u5E73\u4E3E\u8981\u671D\u6B63\u524D\u65B9\u62AC";
  var COPY_RAISE_ELBOW = "\u624B\u8098\u518D\u4F38\u76F4\u4E00\u70B9\u70B9\uFF0C\u6574\u6761\u624B\u81C2\u4E00\u8D77\u62AC";
  var COPY_RAISE_DIRECTION = "\u5C1A\u672A\u786E\u8BA4\u524D\u4E3E\u65B9\u5411\uFF1B\u8BF7\u5411\u8EAB\u4F53\u524D\u65B9\u62AC\u81C2\uFF0C\u4FA7\u5E73\u4E3E\u4E0D\u8BA1\u5165";
  var COPY_RAISE_DEAD_ZONE = "\u7EE7\u7EED\u62AC\u81C2\uFF0C\u65B9\u5411\u5F85\u786E\u8BA4";
  var DIRECTION_DEAD_ZONE_DEG = 37;
  var COPY_FRAMING_WEAK = "\u8FD9\u4E2A\u89D2\u5EA6\u65B9\u5411\u4E0D\u597D\u5224\u65AD\u2014\u2014\u7A0D\u5FAE\u8F6C\u6210\u659C\u4FA7\u9762\uFF0C\u8BA9\u6211\u770B\u6E05\u4F60\u7684\u5934\u548C\u53CC\u81C2";
  function freshPeakTrack() {
    return { prevAt: null, prevDepth: 0, open: false, start: 0, best: -Infinity, bestAt: 0, beforeAt: 0, beforeDepth: 0, afterAt: null, afterDepth: 0, gap: false };
  }
  function feedPeakTrack(tr, now, depth) {
    let best = false, closed = null;
    const prevAt = tr.prevAt, prevDepth = tr.prevDepth;
    if (prevAt !== null && now - prevAt > PEAK_GAP_MS && tr.open) tr.gap = true;
    if (!tr.open && depth >= 0) {
      if (prevAt !== null && prevDepth < 0) {
        const span = depth - prevDepth;
        tr.start = prevAt + (now - prevAt) * (span > 0 ? (0 - prevDepth) / span : 0);
        tr.beforeAt = prevAt;
        tr.beforeDepth = prevDepth;
      } else {
        tr.start = now;
        tr.beforeAt = now;
        tr.beforeDepth = depth;
      }
      tr.open = true;
      tr.gap = false;
      tr.best = -Infinity;
      tr.bestAt = now;
      tr.afterAt = null;
    }
    if (tr.open) {
      if (depth > tr.best) {
        if (prevAt !== null) {
          tr.beforeAt = prevAt;
          tr.beforeDepth = prevDepth;
        }
        tr.best = depth;
        tr.bestAt = now;
        tr.afterAt = null;
        best = true;
      } else if (tr.afterAt === null && now > tr.bestAt) {
        tr.afterAt = now;
        tr.afterDepth = depth;
      }
    }
    if (tr.open && prevAt !== null && prevDepth >= 0 && depth < 0) {
      const span = prevDepth - depth, end = prevAt + (now - prevAt) * (span > 0 ? prevDepth / span : 0);
      const depthEst = tr.best;
      closed = { start: tr.start, end, depth: depthEst, valid: end - tr.start >= PEAK_MIN_DWELL_MS };
      tr.open = false;
    }
    tr.prevAt = now;
    tr.prevDepth = depth;
    return { best, closed };
  }
  var UPPER_ARM_SUSTAIN_MS = 1e3;
  var UPPER_ARM_CLEAR_MS = 300;
  var axes2 = ["depth", "stability", "trunk", "symmetry"];
  var definitions = { ...NEW_EXERCISES, ...LIBRARY_RECOGNITION };
  var sideJoints = (s) => s === "left" ? [11, 23, 25, 27] : [12, 24, 26, 28];
  var ExtendedExerciseTracker = class {
    constructor(type, targetReps = 20, restored = {}, prefiltered = false, armOnStart = false) {
      this.type = type;
      this.prefiltered = prefiltered;
      this.armOnStart = armOnStart;
      const acc = { ...emptyFormBreakdown(), count: 0, total: 0, ...restored.scoreAccumulator };
      this.strictRearm = !!restored.poseFeedback?.calibrated || (restored.reps || 0) > 0;
      this.metrics = { ...restored, reps: Math.max(0, restored.reps || 0), targetReps, perfectReps: restored.perfectReps || 0, formScore: acc.count ? Math.round(acc.total / acc.count) : 0, phase: "standing", feedback: definitions[type].placement, scoreAccumulator: acc, formBreakdown: emptyFormBreakdown(), correctionCounts: { ...emptyCorrectionCounts(), ...restored.correctionCounts }, lastRepIssues: [], repeatedIssue: null, poseFeedback: { status: "uncertain", confidence: 0, issues: [], primaryIssue: null, affectedJoints: [], calibrated: false, message: "\u7AD9\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u966A\u6211\u505C\u4E24\u79D2" } };
      this.updateAverage();
    }
    metrics;
    diagnostics = { fps: 0, confidence: 0, side: null, angle: null, stage: "calibrating", calibrationProgress: 0, pairedSides: [], lastResetReason: null };
    frames = [];
    worlds = [];
    last = null;
    calibration = null;
    /** Start-pose hold time banked across interruptions of the hold itself: calibration
     * progress is latched (pause, never rewind) so a user who starts moving mid-calibration
     * — e.g. following a stray hint — no longer loses the 42%→13% they had earned. Only a
     * real tracking loss (interrupt) clears the bank. */
    calibrationBank = 0;
    /** Last time a start-pose frame was measured. Drives the calibration staleness
     * guard (round 3): gate interrupts inside update() now PRESERVE the bank, so
     * without an expiry a user could bank 50%, walk away for a minute and resume —
     * the bank only survives while set-up is plausibly still in progress. */
    lastStartAt = null;
    baseline = null;
    ready = false;
    /** Set when a latched ready is lost to a tracking-loss interrupt (and
     * for trackers restored from a latched session): re-arming then
     * requires the REARM_MIN_SEGMENT_MS continuous hold. Form-rejection
     * re-arms never set it. */
    strictRearm = false;
    times = [];
    side = null;
    cycleSide = null;
    peak = null;
    peakAt = null;
    returnAt = null;
    retSince = null;
    retAccum = 0;
    retPrevAt = null;
    movingAt = null;
    scoring = true;
    previous = null;
    controlAt = null;
    controlAngle = 0;
    speed = 0;
    shift = 0;
    controlPenalty = 0;
    hammerSides = [freshSideCycle(), freshSideCycle()];
    hammerPending = null;
    rowSides = [freshSideCycle(), freshSideCycle()];
    raiseSides = [freshSideCycle(), freshSideCycle()];
    raisePending = null;
    climberSides = [freshSideCycle(), freshSideCycle()];
    squatSides = [freshSideCycle(), freshSideCycle()];
    /** Which side's split-squat cycle is currently being fed: the front side,
     * re-derived from stance geometry every frame; a mid-cycle flip voids the
     * abandoned side's half cycle rather than letting it complete as the other
     * leg's rep. */
    squatFront = null;
    /** Each side's most recent confirmed peak (midpoint time + peak value in the
     * movement's peak units: elbow angle for hammer curls, raised angle for front
     * raises). Lets a rep that emits as a single still score symmetry peak-to-peak
     * when the other side peaked at nearly the same time (round 3). For hammer
     * curls this record is the peer-peak memory: soft interrupts preserve it
     * (folded with any peak evidence the open cycles hold) while the hole is
     * short — see peerPeakSnapshot and softInterrupt. */
    lastPeak = [null, null];
    /** When the current detection hole began (the last measured frame's time).
     * Drives cycle preservation in softInterrupt (round 4, front raise) and
     * peer-peak preservation (hammer curl); cleared by the next successfully
     * measured frame or any hard interrupt. */
    cycleHoleStart = null;
    /** Step 3 (cell 4): when the current unmeasurable stretch began (the last
     * successfully measured frame's time, or the first failed frame's), and
     * whether it has lasted long enough to name the cannot-assess state. */
    unmeasurableSince = null;
    cannotAssess = false;
    /** Generic-path stability evidence, aggregated by sustainedPeak at completion. */
    controlSamples = [];
    speedSpans = [];
    upperArmDevAt = null;
    upperArmClearAt = null;
    freezeBridged = false;
    requiredIndices(raw) {
      return this.needed(raw);
    }
    updateAverage() {
      const a = this.metrics.scoreAccumulator, b = emptyFormBreakdown();
      for (const k of axes2) b[k] = a.count ? Math.round(a[k] / a.count) : 0;
      const values = a.symmetryValues;
      if (values && values.length) b.symmetry = Math.round(medianOf(values));
      this.metrics.formBreakdown = b;
      this.metrics.axisAssessment = this.assessments();
    }
    /** The step-3 assessability map for the set as it stands (see
     * axisAssessment.ts for the contract). Static per movement, except the
     * hammer category (derived from the recorded peak-timing offsets) and
     * the cannot-assess override: a session that ends inside the degraded-framing
     * state without one scored rep presents every axis as unassessable —
     * scored reps keep the axes they honestly earned before the degradation.
     * Front-raise band tallies are still recorded per rep but, since the
     * channel suspensions, no longer derive a presented axis state. */
    assessments() {
      return this.assessmentsFor(this.metrics.scoreAccumulator);
    }
    /** The assessability map for a given accumulator (the emit sites consult
     * the post-increment accumulator to decide whether the rep's aggregate
     * may be presented — see totalWithheld). */
    assessmentsFor(a) {
      const out = allNumericAssessments();
      if (this.cannotAssess && a.count === 0) {
        for (const k of axes2) out[k] = { kind: "unassessable", reason: "framing" };
        return out;
      }
      if (a.count === 0) return out;
      if (CONTROL_SUSPENDED_TYPES.has(this.type)) {
        const preContract = this.type === "hammer_curl" && !!(a.symmetryValues && a.symmetryValues.length) && !(a.symmetryOffsetsMs && a.symmetryOffsetsMs.length);
        if (!preContract) out.stability = { kind: "unassessable", reason: "control" };
      }
      const channelAxes = CHANNEL_SUSPENDED_AXES.get(this.type);
      if (channelAxes) {
        const preContractHammer = this.type === "hammer_curl" && !!(a.symmetryValues && a.symmetryValues.length) && !(a.symmetryOffsetsMs && a.symmetryOffsetsMs.length);
        if (!preContractHammer) {
          for (const k of axes2) if (channelAxes.has(k)) out[k] = { kind: "unassessable", reason: "channel" };
        }
      }
      if (this.type === "hammer_curl") {
        if (a.symmetryOffsetsMs && a.symmetryOffsetsMs.length) out.symmetry = { kind: "category", category: syncCategoryForOffset(medianOf(a.symmetryOffsetsMs)) };
        else if (!(a.symmetryValues && a.symmetryValues.length)) out.symmetry = { kind: "unassessable", reason: "no-bilateral-evidence" };
      } else if (this.type === "front_raise") {
        out.symmetry = { kind: "unassessable", reason: "view" };
      } else if (SINGLE_SIDE_TYPES.has(this.type)) {
        out.symmetry = { kind: "unassessable", reason: "single-side" };
      }
      return out;
    }
    /** Step 3 (cell 4): a frame that could not be measured extends the
     * current unmeasurable stretch; once it outlasts CANNOT_ASSESS_AFTER_MS
     * the session is in the cannot-assess state until a frame measures again.
     * Called by softInterrupt (every gate loss) and by formInterrupt only for
     * its cannot-confirm rejections — see there. */
    noteUnmeasurable(now) {
      if (this.unmeasurableSince === null) this.unmeasurableSince = this.last ?? now;
      if (now - this.unmeasurableSince >= CANNOT_ASSESS_AFTER_MS) this.cannotAssess = true;
    }
    resetCycle() {
      this.peak = null;
      this.peakAt = null;
      this.returnAt = null;
      this.retSince = null;
      this.retAccum = 0;
      this.retPrevAt = null;
      this.movingAt = null;
      this.cycleSide = null;
      this.scoring = true;
      this.speed = 0;
      this.shift = 0;
      this.controlPenalty = 0;
      this.controlAt = null;
      this.hammerSides = [freshSideCycle(), freshSideCycle()];
      this.hammerPending = null;
      this.rowSides = [freshSideCycle(), freshSideCycle()];
      this.raiseSides = [freshSideCycle(), freshSideCycle()];
      this.raisePending = null;
      this.climberSides = [freshSideCycle(), freshSideCycle()];
      this.squatSides = [freshSideCycle(), freshSideCycle()];
      this.squatFront = null;
      this.lastPeak = [null, null];
      this.controlSamples = [];
      this.speedSpans = [];
      this.upperArmDevAt = null;
      this.upperArmClearAt = null;
      this.freezeBridged = false;
    }
    /** The adaptive wrapper deliberately froze frames during a hammer-curl evidence freeze
     * (see AdaptiveRecognition); the next frame gap is therefore known-benign and must not be
     * read as a tracking loss. Only arms when the pending gap actually exceeds the guard. */
    bridgeFreezeGap(now) {
      if (this.last !== null && now - this.last > 750) this.freezeBridged = true;
    }
    /** Advisory upper-arm hint gating: visible only while a deviation has been sustained for
     * UPPER_ARM_SUSTAIN_MS; brief clearances (< UPPER_ARM_CLEAR_MS) neither hide it nor reset
     * the sustain timer, so the hint cannot flap frame to frame. */
    upperArmHintVisible(deviating, now) {
      if (deviating) {
        this.upperArmClearAt = null;
        if (this.upperArmDevAt === null) this.upperArmDevAt = now;
      } else {
        if (this.upperArmClearAt === null) this.upperArmClearAt = now;
        if (now - this.upperArmClearAt >= UPPER_ARM_CLEAR_MS) this.upperArmDevAt = null;
      }
      return this.upperArmDevAt !== null && now - this.upperArmDevAt >= UPPER_ARM_SUSTAIN_MS;
    }
    interrupt(reason = "\u5148\u505C\u4E00\u4E0B\uFF0C\u7EE7\u7EED\u65F6\u91CD\u65B0\u6821\u51C6", feedback = reason, opts) {
      const preserve = !!opts?.preserveCalibration;
      const bank = preserve ? this.calibrationBank : 0, segment = preserve ? this.calibration : null, ready = preserve && opts?.preserveReady ? this.ready : false, baseline = preserve ? this.baseline : null, progress = preserve ? this.diagnostics.calibrationProgress : 0;
      const keepCycle = !!opts?.preserveCycle;
      const raiseSides = keepCycle ? this.raiseSides : null, raisePending = keepCycle ? this.raisePending : null, lastPeak = keepCycle ? this.lastPeak : null;
      const peerPeaks = opts?.preservePeerPeak ? this.peerPeakSnapshot() : null;
      const keepHammer = !!opts?.preserveHammerCycle;
      const hammerSides = keepHammer ? this.hammerSides : null, hammerPending = keepHammer ? this.hammerPending : null, hammerPeak = keepHammer ? this.lastPeak : null;
      const wasReady = this.ready;
      this.frames = [];
      this.worlds = [];
      this.last = null;
      this.calibration = segment;
      this.calibrationBank = bank;
      this.baseline = baseline;
      this.ready = ready;
      this.side = null;
      this.times = [];
      this.previous = null;
      this.resetCycle();
      if (wasReady && !ready && !preserve) this.strictRearm = true;
      if (keepCycle && raiseSides && lastPeak) {
        this.raiseSides = raiseSides;
        this.raisePending = raisePending;
        this.lastPeak = lastPeak;
      }
      if (keepHammer && hammerSides && hammerPeak) {
        this.hammerSides = hammerSides;
        this.hammerPending = hammerPending;
        this.lastPeak = hammerPeak;
      }
      if (peerPeaks) this.lastPeak = peerPeaks;
      if (!keepCycle && !peerPeaks && !keepHammer) this.cycleHoleStart = null;
      this.diagnostics = { ...this.diagnostics, stage: "tracking_lost", fps: 0, calibrationProgress: progress, lastResetReason: reason };
      this.metrics = { ...this.metrics, phase: "standing", feedback, poseFeedback: { ...this.metrics.poseFeedback, status: "uncertain", calibrated: ready, message: feedback } };
      this.metrics.axisAssessment = this.assessments();
      if (this.cannotAssess) {
        const copy = cannotAssessCopyFor(this.type);
        this.diagnostics = { ...this.diagnostics, stage: "cannot_assess" };
        this.metrics = { ...this.metrics, feedback: copy, poseFeedback: { ...this.metrics.poseFeedback, message: copy } };
      }
      return this.metrics;
    }
    /** Transient-gate interrupt inside update(): the frame stream hiccupped — a
     * joint left the frame, a brief occlusion, a dropped frame. During set-up that
     * is normal user behaviour (stepping back into frame, turning, test-raising an
     * arm), and round 2's bank survived only measured non-start frames, so every
     * hiccup rewound calibration to zero and a dorm set-up could never finish it
     * (2026-11-08 retest: 46% banked, then wiped repeatedly; 70 s of raises, 0
     * counted). Calibration AND a latched ready now survive these interrupts; the
     * one expiry is staleness — no start-pose frame for over CALIBRATION_STALE_MS
     * while still calibrating clears the bank, so a walked-away session cannot
     * resume stale progress. Once ready, ready persists for the rest of the
     * session against transient gates. */
    softInterrupt(reason, now, feedback = reason) {
      this.noteUnmeasurable(now);
      if (!this.ready && this.lastStartAt !== null && now - this.lastStartAt > CALIBRATION_STALE_MS) {
        this.calibrationBank = 0;
        this.calibration = null;
      }
      let preserveCycle = false, preservePeerPeak = false;
      if (this.type === "front_raise" || this.type === "hammer_curl") {
        if (this.cycleHoleStart === null) this.cycleHoleStart = this.last ?? now;
        const withinHole = now - this.cycleHoleStart <= CYCLE_PRESERVE_MS;
        if (this.type === "front_raise") preserveCycle = withinHole;
        else preservePeerPeak = withinHole;
        if (!withinHole) this.cycleHoleStart = null;
      }
      return this.interrupt(reason, feedback, { preserveCalibration: true, preserveReady: true, preserveCycle, preservePeerPeak });
    }
    /** Form-rejection interrupt: measure() judged the pose itself invalid (wrong
     * posture family, direction unconfirmed, baseline moved, side switched
     * mid-cycle). The banked calibration progress survives — set-up was not the
     * problem — but a latched ready does NOT: several rejections explicitly demand
     * recalibration, and staying armed would let smoothing-transition frames
     * fabricate a rep out of the rejected pose (the standing-leg-curl side-switch
     * case). Recalibration then re-earns the hold on top of the preserved bank. */
    formInterrupt(reason, now) {
      if (reason.startsWith("\u6682\u65F6\u65E0\u6CD5")) this.noteUnmeasurable(now);
      if (!this.ready && this.lastStartAt !== null && now - this.lastStartAt > CALIBRATION_STALE_MS) {
        this.calibrationBank = 0;
        this.calibration = null;
      }
      let preserveHammerCycle = false;
      if (this.type === "hammer_curl") {
        if (this.cycleHoleStart === null) this.cycleHoleStart = this.last ?? now;
        preserveHammerCycle = now - this.cycleHoleStart <= CYCLE_PRESERVE_MS;
        if (!preserveHammerCycle) this.cycleHoleStart = null;
      }
      return this.interrupt(reason, reason, { preserveCalibration: true, preserveHammerCycle });
    }
    needed(raw) {
      if (this.type === "seated_curl" || this.type === "seated_lateral_raise" || this.type === "lying_triceps_extension") return [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
      if (this.type === "bench_press" || this.type === "incline_bench_press" || this.type === "seated_triceps_extension") return [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
      if (this.type === "reverse_fly") return [11, 12, 13, 14, 15, 16, 23, 24, 25, 26];
      if (this.type === "barbell_deadlift") {
        const joints = (s) => [...sideJoints(s), s === "left" ? 13 : 14, s === "left" ? 15 : 16];
        if (!this.side) {
          const confidence = (s) => Math.min(...joints(s).map((i) => raw[i]?.visibility || 0));
          this.side = confidence("left") >= confidence("right") ? "left" : "right";
        }
        return joints(this.side);
      }
      if (this.type === "romanian_deadlift" || this.type === "glute_bridge" || this.type === "lying_leg_raise") {
        if (!this.side) {
          const confidence = (s) => Math.min(...sideJoints(s).map((i) => raw[i]?.visibility || 0));
          this.side = confidence("left") >= confidence("right") ? "left" : "right";
        }
        return sideJoints(this.side);
      }
      if (this.type === "standing_leg_curl") return [11, 12, 23, 24, 25, 26, 27, 28];
      if (this.type === "one_arm_row") return [11, 12, 13, 14, 15, 16, 23, 24, 25, 26];
      if (this.type === "mountain_climber") return [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
      if (this.type === "split_squat") return [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
      return [11, 12, 13, 14, 15, 16, 23, 24, ...this.type === "front_raise" ? [0] : [], ...this.type === "triceps_kickback" ? [25, 26] : []];
    }
    measure(points, aspect, world, required) {
      const p = points.map((v) => ({ ...v, x: v.x * aspect, z: 0 }));
      const validWorld = world?.length === 33 && world.every((v) => v && [v.x, v.y, v.z].every(Number.isFinite)) && dist(world[11], world[23]) > 0.04 && dist(world[11], world[23]) < 1.5;
      const a = validWorld ? world : p;
      const o = this.side === "right" ? 1 : 0, sh = p[11 + o], hip = p[23 + o];
      const torso = Math.max(0.03, dist(sh, hip)), tilt = Math.atan2(Math.abs(sh.x - hip.x), Math.abs(sh.y - hip.y)) * 180 / Math.PI;
      const confidence = Math.min(...required.map((i) => points[i].visibility ?? 0));
      const elbows = [angle3(a[11], a[13], a[15]), angle3(a[12], a[14], a[16])];
      const knees = [angle3(a[23], a[25], a[27]), angle3(a[24], a[26], a[28])];
      let start = false, peak = false, amplitude = 0, measured = 0, posture = cap(100 - Math.max(0, tilt - 12) * 2), symmetry = 100, controlPenalty = 0, side = this.side || void 0, basis = "", motion = "", hint;
      let perSide;
      let raiseData;
      let legData;
      let framing;
      if (this.type === "seated_curl" || this.type === "seated_lateral_raise") {
        const hips = [angle3(a[11], a[23], a[25]), angle3(a[12], a[24], a[26])];
        if (tilt > 30 || hips.some((v) => v < 60 || v > 130) || knees.some((v) => v < 55 || v > 140)) return "\u8BF7\u5750\u7A33\u3001\u53CC\u811A\u652F\u6491\u5E76\u8C03\u6574\u4E3A\u659C\u4FA7\u9762\uFF0C\u8BA9\u5C48\u819D\u5750\u59FF\u6E05\u695A\u53EF\u89C1\uFF1B\u7AD9\u59FF\u4E0D\u8BA1\u5165";
        const raised = [angle3(a[13], a[11], a[23]), angle3(a[14], a[12], a[24])];
        if (this.type === "seated_curl") {
          if (Math.max(...raised) > 45) return "\u4E0A\u81C2\u8D34\u7D27\u4E00\u70B9\u70B9\uFF0C\u522B\u8BA9\u80A9\u8180\u8DDF\u7740\u62AC";
          start = Math.min(...elbows) >= 145;
          peak = Math.max(...elbows) <= 80;
          measured = mean2(elbows[0], elbows[1]);
          amplitude = cap((160 - Math.max(...elbows)) / 95 * 100);
          symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
          controlPenalty = Math.max(0, Math.max(...raised) - 15) * 1.5;
          basis = "\u5C48\u819D\u5750\u59FF\uFF0B\u4E0A\u81C2\u9760\u8FD1\u4F53\u4FA7\uFF0B\u53CC\u8098\u5C48\u4F38";
          motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u4F38\u81C2\u2265145\xB0\uFF0C\u5F2F\u4E3E\u226480\xB0`;
        } else {
          if (!validWorld) return "\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u4FA7\u4E3E\u65B9\u5411\uFF0C\u8BF7\u8C03\u6574\u62CD\u6444\u89D2\u5EA6\u5E76\u8BA9\u53CC\u81C2\u6E05\u6670\u5165\u955C";
          const lateral = norm(vector(a[12], a[11])), spread = [0, 1].every((i) => {
            const v = vector(a[15 + i], a[11 + i]);
            return dot(v, lateral) * (i ? 1 : -1) > Math.hypot(...v) * 0.65;
          });
          start = Math.max(...raised) <= 25 && Math.min(...elbows) >= 140;
          peak = Math.min(...raised) >= 65 && Math.max(...raised) <= 115 && Math.min(...elbows) >= 140 && spread;
          measured = mean2(raised[0], raised[1]);
          amplitude = cap(Math.min(...raised) / 90 * 100);
          symmetry = cap(100 - Math.abs(raised[0] - raised[1]) * 1.5);
          controlPenalty = Math.max(0, 165 - Math.min(...elbows));
          basis = "\u5C48\u819D\u5750\u59FF\uFF0B\u53CC\u81C2\u4FA7\u5411\u5C55\u5F00\uFF0B\u8098\u90E8\u5FAE\u5C48";
          motion = `\u62AC\u81C2 ${Math.round(raised[0])}\xB0 / ${Math.round(raised[1])}\xB0\uFF1B${spread ? "\u5411\u4E24\u4FA7\u5C55\u5F00\u5DF2\u786E\u8BA4" : "\u5C1A\u672A\u786E\u8BA4\u4FA7\u4E3E\u65B9\u5411\uFF0C\u524D\u4E3E\u4E0D\u8BA1\u5165"}`;
          if (!start && !spread) hint = "\u8BF7\u5411\u8EAB\u4F53\u4E24\u4FA7\u62AC\u81C2\uFF0C\u5411\u524D\u62AC\u81C2\u4E0D\u8BA1\u5165\u4FA7\u5E73\u4E3E";
        }
      } else if (this.type === "lying_triceps_extension") {
        if (tilt < 60) return "\u8BF7\u5E73\u8EBA\u5E73\u51F3\u3001\u53CC\u811A\u652F\u6491\uFF1B\u76F4\u7ACB\u6216\u5750\u59FF\u4F38\u8098\u4E0D\u8BA1\u5165";
        if (this.baseline && [11, 12, 23, 24, 27, 28].some((i) => dist(p[i], this.baseline.points[i]) > this.baseline.torso * 0.18)) return "\u8EAB\u4F53\u652F\u6491\u6216\u753B\u9762\u79FB\u52A8\uFF0C\u8BF7\u7A33\u5B9A\u540E\u91CD\u65B0\u6821\u51C6";
        const upper = [angle3(a[13], a[11], a[23]), angle3(a[14], a[12], a[24])];
        if (upper.some((v) => v < 60 || v > 120) || [0, 1].some((i) => p[13 + i].y >= p[11 + i].y - torso * 0.15)) return "\u8BF7\u4FDD\u6301\u53CC\u4E0A\u81C2\u5728\u80F8\u90E8\u4E0A\u65B9\uFF1B\u5367\u63A8\u5F0F\u79FB\u52A8\u4E0A\u81C2\u4E0D\u8BA1\u5165\u81C2\u5C48\u4F38";
        const headward = [0, 1].every((i) => {
          const v = vector(a[15 + i], a[13 + i]);
          return dot(v, norm(vector(a[11 + i], a[23 + i]))) > Math.hypot(...v) * 0.3;
        });
        start = Math.min(...elbows) >= 150;
        peak = Math.max(...elbows) <= 95 && headward;
        measured = mean2(elbows[0], elbows[1]);
        amplitude = cap((170 - Math.max(...elbows)) / 90 * 100);
        symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        posture = this.baseline ? cap(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        controlPenalty = Math.max(...upper.map((v) => Math.abs(v - 90)));
        basis = "\u5E73\u8EBA\u652F\u6491\uFF0B\u4E0A\u81C2\u4FDD\u6301\u80F8\u4E0A\u65B9\uFF0B\u5C48\u8098\u5411\u5934\u90E8\u4E0B\u653E";
        motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B${headward ? "\u5411\u5934\u90E8\u4E0B\u653E\u5DF2\u786E\u8BA4" : "\u5C1A\u672A\u786E\u8BA4\u5411\u5934\u90E8\u4E0B\u653E\u65B9\u5411"}`;
      } else if (this.type === "barbell_deadlift") {
        const hinge = angle3(a[11 + o], a[23 + o], a[25 + o]), knee = knees[o], shin = Math.max(0.04, dist(p[25 + o], p[27 + o]));
        if (elbows[o] < 150) return "\u8BF7\u4FDD\u6301\u8DDF\u8E2A\u4FA7\u624B\u81C2\u4F38\u76F4\u3001\u624B\u9760\u8FD1\u5C0F\u817F\uFF1B\u5F2F\u4E3E\u4E0D\u8BA1\u5165\u786C\u62C9";
        if (this.baseline && dist(p[27 + o], this.baseline.points[27 + o]) > this.baseline.torso * 0.16) return "\u811A\u4F4D\u6216\u753B\u9762\u79FB\u52A8\uFF0C\u8BF7\u91CD\u65B0\u4FDD\u6301\u8D77\u59CB\u59FF\u52BF\u6821\u51C6";
        start = hinge >= 45 && hinge <= 130 && knee >= 75 && knee <= 145 && p[15 + o].y >= p[25 + o].y + shin * 0.1 && p[15 + o].y <= p[27 + o].y + shin * 0.3;
        peak = hinge >= 160 && knee >= 160 && p[15 + o].y > p[23 + o].y;
        measured = hinge;
        amplitude = cap((Math.min(hinge, knee) - 130) / 45 * 100);
        posture = cap(100 - Math.max(0, 165 - Math.min(hinge, knee)) * 2);
        symmetry = cap(100 - Math.abs(knees[0] - knees[1]) * 1.5);
        basis = "\u4F4E\u4F4D\u5C48\u9ACB\u5C48\u819D\uFF0B\u624B\u81C2\u4F38\u76F4\uFF0B\u7AD9\u76F4\u540E\u8FD4\u56DE\u8D77\u59CB\u4F4D";
        motion = `\u9ACB\u89D2 ${Math.round(hinge)}\xB0\uFF0C\u819D\u89D2 ${Math.round(knee)}\xB0\uFF1B\u9700\u5728\u624B\u63A5\u8FD1\u5C0F\u817F\u7684\u4F4E\u4F4D\u6821\u51C6`;
        if (!this.ready && !start) hint = "\u8BF7\u56DE\u5230\u5C48\u9ACB\u5C48\u819D\u3001\u53CC\u81C2\u4F38\u76F4\u3001\u624B\u63A5\u8FD1\u5C0F\u817F\u7684\u4F4E\u4F4D\uFF0C\u4FDD\u6301\u4E24\u79D2";
      } else if (this.type === "bench_press" || this.type === "incline_bench_press") {
        if (this.type === "bench_press" && tilt < 60) return "\u8BF7\u5E73\u8EBA\u5E73\u51F3\u5E76\u4ECE\u659C\u4FA7\u9762\u62CD\u6444\uFF1B\u5750\u59FF\u63A8\u4E3E\u4E0D\u8BA1\u5165\u5367\u63A8";
        if (this.type === "incline_bench_press" && (tilt < 30 || tilt > 60)) return "\u8BF7\u8C03\u6574\u4E3A\u4FA7\u9762\u6216\u659C\u4FA7\u9762\uFF0C\u8BA9\u80A9\u80CC\u8D34\u51F3\u7684\u659C\u8EBA\u59FF\u6001\u6E05\u695A\u53EF\u89C1\uFF1B\u5E73\u8EBA\u4E0E\u76F4\u7ACB\u63A8\u4E3E\u4E0D\u8BA1\u5165";
        if ([0, 1].some((i) => p[15 + i].y > p[11 + i].y - torso * 0.08)) return "\u8BF7\u8BA9\u624B\u8155\u3001\u8098\u548C\u80A9\u6E05\u6670\u53EF\u89C1\uFF0C\u53CC\u624B\u4FDD\u6301\u5728\u80F8\u90E8\u4E0A\u65B9";
        if (this.baseline && [11, 12, 23, 24, 27, 28].some((i) => dist(p[i], this.baseline.points[i]) > this.baseline.torso * 0.18)) return "\u652F\u6491\u6216\u753B\u9762\u79FB\u52A8\uFF0C\u8BF7\u7A33\u5B9A\u8EAB\u4F53\u540E\u91CD\u65B0\u6821\u51C6";
        start = Math.min(...elbows) >= 155;
        peak = Math.min(...elbows) >= 55 && Math.max(...elbows) <= 110;
        measured = mean2(elbows[0], elbows[1]);
        amplitude = cap((175 - Math.max(...elbows)) / 90 * 100);
        symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        posture = this.baseline ? cap(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        basis = "\u5E73\u8EBA\u652F\u6491\uFF0B\u53CC\u8098\u5C48\u4F38\uFF0B\u53CC\u624B\u4F4D\u4E8E\u80F8\u90E8\u4E0A\u65B9";
        motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u63A8\u8D77\u2265155\xB0\uFF0C\u4E0B\u653E\u2264110\xB0`;
      } else if (this.type === "seated_triceps_extension") {
        const upper = [angle3(a[13], a[11], a[23]), angle3(a[14], a[12], a[24])], hips = [angle3(a[11], a[23], a[25]), angle3(a[12], a[24], a[26])];
        if (tilt > 30 || hips.some((v) => v < 60 || v > 130) || knees.some((v) => v < 55 || v > 140)) return "\u8BF7\u5750\u7A33\u3001\u53CC\u811A\u652F\u6491\u5E76\u8C03\u6574\u4E3A\u659C\u4FA7\u9762\uFF0C\u8BA9\u5750\u59FF\u548C\u53CC\u81C2\u6E05\u695A\u53EF\u89C1";
        if (Math.min(...upper) < 140) return "\u8BF7\u4FDD\u6301\u53CC\u4E0A\u81C2\u5728\u8033\u4FA7\u4E0A\u65B9\uFF1B\u80F8\u524D\u5F2F\u4E3E\u4E0D\u8BA1\u5165";
        start = Math.min(...elbows) >= 150;
        peak = Math.max(...elbows) <= 95;
        measured = mean2(elbows[0], elbows[1]);
        amplitude = cap((170 - Math.max(...elbows)) / 90 * 100);
        symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        controlPenalty = Math.max(0, 170 - Math.min(...upper));
        basis = "\u5C48\u819D\u5750\u59FF\uFF0B\u4E0A\u81C2\u4FDD\u6301\u5934\u4E0A\uFF0B\u53CC\u8098\u5C48\u4F38";
        motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u4F38\u8098\u2265150\xB0\uFF0C\u5C48\u8098\u226495\xB0`;
      } else if (this.type === "reverse_fly") {
        if (!validWorld) return "\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u53CC\u81C2\u5C55\u5F00\u65B9\u5411\uFF0C\u8BF7\u6B63\u9762\u659C\u4FA7\u62CD\u6444\u5E76\u8BA9\u53CC\u81C2\u5165\u955C";
        if (tilt < 30 || tilt > 85) return "\u8BF7\u5C48\u9ACB\u4FEF\u8EAB\u5E76\u4FDD\u6301\u7A33\u5B9A\uFF0C\u76F4\u7ACB\u4FA7\u5E73\u4E3E\u4E0D\u8BA1\u5165";
        const lateral = norm(vector(a[12], a[11])), raised = [angle3(a[13], a[11], a[23]), angle3(a[14], a[12], a[24])];
        const spread = [0, 1].every((i) => {
          const v = vector(a[15 + i], a[11 + i]), n = Math.hypot(...v);
          return dot(v, lateral) * (i ? 1 : -1) > n * 0.65;
        });
        start = [0, 1].every((i) => p[15 + i].y > p[11 + i].y + torso * 0.3 && Math.abs(dot(norm(vector(a[15 + i], a[11 + i])), lateral)) < 0.35) && Math.min(...elbows) >= 140;
        peak = Math.min(...raised) >= 65 && Math.max(...raised) <= 115 && Math.min(...elbows) >= 140 && spread;
        measured = mean2(raised[0], raised[1]);
        amplitude = cap(Math.min(...raised) / 90 * 100);
        symmetry = cap(100 - Math.abs(raised[0] - raised[1]) * 1.5);
        posture = this.baseline ? cap(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        controlPenalty = Math.max(0, 165 - Math.min(...elbows));
        basis = "\u4FEF\u8EAB\u59FF\u6001\uFF0B\u53CC\u81C2\u5411\u8EAB\u4F53\u4E24\u4FA7\u6253\u5F00\uFF0B\u8098\u90E8\u5FAE\u5C48";
        motion = `\u53CC\u81C2\u5C55\u5F00 ${Math.round(raised[0])}\xB0 / ${Math.round(raised[1])}\xB0\uFF1B${spread ? "\u4FA7\u5411\u5C55\u5F00\u5DF2\u786E\u8BA4" : "\u5C1A\u672A\u786E\u8BA4\u5411\u4E24\u4FA7\u5C55\u5F00"}`;
        if (!start && !spread) hint = "\u8BF7\u5411\u8EAB\u4F53\u4E24\u4FA7\u6253\u5F00\u53CC\u81C2\uFF1B\u5411\u524D\u62AC\u81C2\u4E0D\u8BA1\u5165\u53CD\u5411\u98DE\u9E1F";
      } else if (this.type === "hammer_curl") {
        if (tilt > 35) return "\u8BF7\u76F4\u7ACB\u7AD9\u7A33\uFF0C\u4FDD\u6301\u53CC\u4E0A\u81C2\u5728\u4F53\u4FA7";
        start = Math.min(...elbows) >= 145;
        peak = Math.max(...elbows) <= 80;
        measured = mean2(elbows[0], elbows[1]);
        amplitude = cap((160 - Math.max(...elbows)) / 95 * 100);
        symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        perSide = [elbows[0], elbows[1]];
        basis = "\u53CC\u8098\u5C48\u4F38\uFF1B\u63E1\u6CD5\u7531\u672C\u4EBA\u6309\u8BF4\u660E\u4FDD\u6301";
        motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u5F2F\u4E3E\u226480\xB0\u3001\u653E\u56DE\u2265145\xB0`;
        controlPenalty = Math.max(0, Math.max(angle3(a[13], a[11], a[23]), angle3(a[14], a[12], a[24])) - 15) * 1.5;
        if (controlPenalty > 25) hint = "\u4E0A\u81C2\u8D34\u7D27\u4E00\u70B9\u70B9\uFF0C\u4F60\u4F1A\u66F4\u7701\u529B";
      } else if (this.type === "front_raise") {
        if (!validWorld) return "\u6682\u65F6\u65E0\u6CD5\u5224\u65AD\u524D\u4E3E\u65B9\u5411\uFF0C\u8BF7\u659C\u4FA7\u9762\u62CD\u6444\uFF0C\u8BA9\u5934\u90E8\u548C\u53CC\u81C2\u6E05\u6670\u53EF\u89C1";
        const mid2 = (i, j) => ({ ...a[i], x: mean2(a[i].x, a[j].x), y: mean2(a[i].y, a[j].y), z: mean2(a[i].z, a[j].z) });
        const shoulder = mid2(11, 12), pelvis = mid2(23, 24), lateral = norm(vector(a[12], a[11]));
        let forward = norm(cross(lateral, vector(shoulder, pelvis)));
        const face = dot(vector(a[0], shoulder), forward);
        if (Math.abs(face) < dist(shoulder, pelvis) * 0.06 || dist(a[11], a[12]) < 0.05) return "\u524D\u4E3E\u65B9\u5411\u4E0D\u6E05\u6670\uFF0C\u8BF7\u8C03\u6574\u4E3A\u659C\u4FA7\u9762\u5E76\u8BA9\u5934\u90E8\u5165\u955C";
        if (face < 0) forward = forward.map((v) => -v);
        framing = Math.abs(face) / (dist(shoulder, pelvis) * 0.06) >= 2 ? "ok" : "weak";
        const down = norm(vector(pelvis, shoulder));
        const raised = [0, 1].map((i) => {
          const v = vector(a[15 + i], a[11 + i]);
          return Math.max(0, Math.min(180, Math.atan2(dot(v, forward), dot(v, down)) * 180 / Math.PI));
        });
        raiseData = [0, 1].map((i) => {
          const v = vector(a[15 + i], a[11 + i]), n = Math.hypot(...v), f = dot(v, forward), l = Math.abs(dot(v, lateral));
          return { raised: raised[i], forward: f > n * 0.6 && f > l, latDom: l >= f, elbow: elbows[i] };
        });
        const direction = raiseData.every((s) => s.forward);
        start = Math.max(...raised) <= 25;
        peak = Math.min(...raised) >= 65 && Math.max(...raised) <= 115 && direction && Math.min(...elbows) >= 140;
        measured = mean2(raised[0], raised[1]);
        amplitude = cap(Math.min(...raised) / 90 * 100);
        symmetry = cap(100 - Math.abs(raised[0] - raised[1]) * 1.5);
        basis = "\u9010\u4FA7\u77E2\u72B6\u9762\u62AC\u4E3E\u89D2\uFF08\u80A9\u2192\u8155\uFF09\uFF0B\u524D\u5411\u4E3B\u5BFC\u65B9\u5411";
        motion = `\u62AC\u81C2 ${Math.round(raised[0])}\xB0 / ${Math.round(raised[1])}\xB0\uFF1B${direction ? "\u53CC\u81C2\u524D\u4E3E\u65B9\u5411\u5DF2\u786E\u8BA4" : raiseData.some((s) => s.forward) ? "\u5355\u81C2\u524D\u4E3E\u65B9\u5411\u5DF2\u786E\u8BA4" : "\u5C1A\u672A\u786E\u8BA4\u524D\u4E3E\u65B9\u5411\uFF0C\u4FA7\u4E3E\u4E0D\u8BA1\u6570"}`;
        controlPenalty = Math.max(0, 170 - Math.min(...elbows)) * 1.5;
        if (!start && !direction) hint = "\u5C1A\u672A\u786E\u8BA4\u524D\u4E3E\u65B9\u5411\uFF1B\u8BF7\u5411\u8EAB\u4F53\u524D\u65B9\u62AC\u81C2\uFF0C\u4FA7\u5E73\u4E3E\u4E0D\u8BA1\u5165";
      } else if (this.type === "triceps_kickback") {
        if (tilt < 25 || tilt > 85) return "\u8BF7\u5148\u5C48\u9ACB\u4FEF\u8EAB\uFF0C\u53CC\u4E0A\u81C2\u9760\u8FD1\u8EAF\u5E72\uFF0C\u5C48\u8098\u51C6\u5907";
        const upper = [angle3(a[13], a[11], a[23]), angle3(a[14], a[12], a[24])];
        start = Math.min(...elbows) >= 55 && Math.max(...elbows) <= 125 && Math.max(...upper) <= 55;
        peak = Math.min(...elbows) >= 150 && Math.max(...upper) <= 45;
        measured = mean2(elbows[0], elbows[1]);
        amplitude = cap((Math.min(...elbows) - 80) / 90 * 100);
        symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        posture = this.baseline ? cap(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        basis = "\u4FEF\u8EAB\u59FF\u6001\uFF0B\u53CC\u8098\u5411\u540E\u4F38\u5C55\uFF0C\u4E0A\u81C2\u4FDD\u6301\u4F53\u4FA7";
        motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u4F38\u8098\u2265150\xB0`;
        controlPenalty = Math.max(0, Math.max(...upper) - 15) * 1.5;
      } else if (this.type === "romanian_deadlift") {
        const hinge = angle3(a[11 + o], a[23 + o], a[25 + o]), knee = knees[o];
        start = hinge >= 155 && knee >= 145;
        peak = hinge <= 115 && knee >= 145;
        if (knee < 135) return "\u819D\u76D6\u5F2F\u66F2\u8FC7\u591A\uFF0C\u8BF7\u4FDD\u6301\u819D\u81EA\u7136\u5FAE\u5C48\uFF0C\u4EE5\u9ACB\u540E\u79FB\u5B8C\u6210\u52A8\u4F5C\uFF1B\u6DF1\u8E72\u4E0D\u8BA1\u5165";
        if (this.baseline && dist(p[27 + o], this.baseline.points[27 + o]) > this.baseline.torso * 0.18) return "\u811A\u4F4D\u6216\u753B\u9762\u79FB\u52A8\uFF0C\u8BF7\u7AD9\u7A33\u540E\u91CD\u65B0\u6821\u51C6";
        measured = hinge;
        amplitude = cap((175 - hinge) / 80 * 100);
        posture = cap(100 - Math.max(0, 150 - knee) * 2);
        basis = "\u9ACB\u6298\u53E0\u89D2\uFF0B\u819D\u90E8\u4FDD\u6301\u5FAE\u5C48\uFF0B\u811A\u4F4D\u7A33\u5B9A";
        motion = `\u9ACB\u89D2 ${Math.round(hinge)}\xB0\uFF0C\u819D\u89D2 ${Math.round(knee)}\xB0\uFF1B\u4E0D\u8981\u6C42\u89E6\u5730`;
        symmetry = cap(100 - Math.abs(knees[0] - knees[1]) * 1.5);
        if (knee < 145) hint = "\u819D\u76D6\u5F2F\u66F2\u8F83\u591A\uFF0C\u8BF7\u4FDD\u6301\u5FAE\u5C48\u5E76\u5C06\u9ACB\u5411\u540E\u79FB\uFF0C\u6DF1\u8E72\u4E0D\u8BA1\u5165";
      } else if (this.type === "glute_bridge") {
        const hinge = angle3(a[11 + o], a[23 + o], a[25 + o]), knee = knees[o], b = this.baseline;
        if (tilt < 45 || knee < 45 || knee > 135) return "\u8BF7\u4EF0\u5367\u5C48\u819D\u3001\u53CC\u811A\u8E29\u5730\uFF0C\u6444\u50CF\u5934\u964D\u4F4E\u5E76\u4FA7\u9762\u62CD\u6444";
        if (b && [11 + o, 27 + o].some((i) => dist(p[i], b.points[i]) > b.torso * 0.14)) return "\u80A9\u90E8\u3001\u811A\u4F4D\u6216\u753B\u9762\u79FB\u52A8\uFF0C\u8BF7\u6062\u590D\u652F\u6491\u540E\u91CD\u65B0\u6821\u51C6";
        const rise = b ? (b.points[23 + o].y - p[23 + o].y) / b.torso : 0;
        start = hinge <= 145 && Math.abs(rise) <= 0.07;
        peak = !!b && hinge >= 155 && rise >= 0.18;
        measured = hinge;
        amplitude = cap((hinge - 95) / 75 * 100);
        posture = cap(100 - Math.abs(175 - hinge) * 2);
        symmetry = b ? cap(100 - Math.max(dist(p[11 + o], b.points[11 + o]), dist(p[27 + o], b.points[27 + o])) / b.torso * 200) : 100;
        basis = "\u80A9\u4E0E\u811A\u90E8\u56FA\u5B9A\u652F\u6491\uFF0B\u9ACB\u90E8\u62AC\u8D77\uFF0B\u80A9\u9ACB\u819D\u8FDE\u7EBF";
        motion = `\u9ACB\u89D2 ${Math.round(hinge)}\xB0\uFF0C\u62AC\u9ACB ${Math.round(rise * 100)}% \u8EAF\u5E72\u957F`;
      } else if (this.type === "one_arm_row") {
        if (tilt < 25 || tilt > 85) return "\u8BF7\u5C48\u9ACB\u4FEF\u8EAB\u5E76\u4FDD\u6301\u7A33\u5B9A\uFF0C\u4ECE\u659C\u4FA7\u9762\u671D\u5411\u5DE5\u4F5C\u4FA7\u62CD\u6444\uFF1B\u76F4\u7ACB\u4E0D\u8BA1\u5165";
        start = Math.max(...elbows) >= 145;
        peak = Math.max(...elbows) <= 100;
        measured = mean2(elbows[0], elbows[1]);
        amplitude = cap((160 - Math.max(...elbows)) / 90 * 100);
        symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        posture = this.baseline ? cap(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        perSide = [elbows[0], elbows[1]];
        basis = "\u4FEF\u8EAB\u59FF\u52BF\uFF0B\u5355\u4FA7\u8098\u5C48\u4F38\uFF0C\u9010\u4FA7\u8BA1\u6570";
        motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u62C9\u8D77 \u2264100\xB0\uFF0C\u653E\u56DE \u2265145\xB0`;
      } else if (this.type === "lying_leg_raise") {
        const hips = [angle3(a[11], a[23], a[25]), angle3(a[12], a[24], a[26])], hinge = hips[o];
        if (tilt < 45) return "\u8BF7\u4EF0\u5367\u5728\u51F3\u9762\u6216\u5730\u9762\u3001\u53CC\u817F\u4F38\u76F4\uFF0C\u6444\u50CF\u5934\u964D\u4F4E\u5E76\u4FA7\u9762\u62CD\u6444\uFF1B\u5750\u8D77\u6216\u7AD9\u7ACB\u4E0D\u8BA1\u5165";
        if (this.baseline && [11 + o, 23 + o].some((i) => dist(p[i], this.baseline.points[i]) > this.baseline.torso * 0.14)) return "\u80A9\u90E8\u3001\u9ACB\u90E8\u6216\u753B\u9762\u79FB\u52A8\uFF0C\u8BF7\u6062\u590D\u652F\u6491\u540E\u91CD\u65B0\u6821\u51C6";
        start = hinge >= 160;
        peak = hinge <= 100;
        measured = hinge;
        amplitude = cap((170 - hinge) / 85 * 100);
        posture = this.baseline ? cap(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        symmetry = cap(100 - Math.abs(hips[0] - hips[1]) * 1.5);
        basis = "\u4EF0\u5367\u652F\u6491\u7A33\u5B9A\uFF0B\u9ACB\u5C48\u4F38\uFF08\u80A9\u2013\u9ACB\u2013\u819D\uFF09";
        motion = `\u9ACB\u89D2 ${Math.round(hinge)}\xB0\uFF1B\u653E\u5E73 \u2265160\xB0\uFF0C\u4E3E\u81F3 \u2264100\xB0`;
      } else if (this.type === "upright_row") {
        if (tilt > 35) return "\u8BF7\u76F4\u7ACB\u7AD9\u7A33\u3001\u53CC\u81C2\u81EA\u7136\u5782\u4E0B\uFF1B\u4FEF\u8EAB\u6216\u4FA7\u503E\u63D0\u62C9\u4E0D\u8BA1\u5165";
        const rise = [(p[11].y - p[15].y) / torso, (p[12].y - p[16].y) / torso];
        start = Math.min(...elbows) >= 160 && [0, 1].every((i) => p[15 + i].y >= p[23 + i].y - torso * 0.1);
        peak = Math.max(...elbows) <= 80 && Math.min(...rise) >= 0;
        measured = mean2(elbows[0], elbows[1]);
        amplitude = cap((170 - Math.max(...elbows)) / 90 * 100);
        symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        basis = "\u53CC\u8098\u5C48\u4F38\uFF0B\u53CC\u624B\u76F8\u5BF9\u80A9\u9AD8\uFF08\u53CC\u901A\u9053\u4E92\u8BC1\uFF09";
        motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF0C\u624B\u9AD8 ${Math.round(Math.min(...rise) * 100)}% \u8EAF\u5E72\u957F\uFF1B\u5782\u81C2 \u2265160\xB0\uFF0C\u63D0\u81F3\u8098 \u226480\xB0 \u4E14\u624B\u8FC7\u80A9\u7EBF`;
        if (!start && Math.max(...elbows) > 140 && Math.min(...rise) >= -0.9) hint = "\u624B\u518D\u63D0\u8D77\u6765\u4E00\u70B9\uFF0C\u8098\u5C48\u8D77\u6765\u5411\u5916\u6253\u5F00\u2014\u2014\u53EA\u8038\u80A9\u4E0D\u7B97\u54E6";
      } else if (this.type === "bench_dip") {
        const drop = this.baseline ? (mean2(p[11].y, p[12].y) - mean2(this.baseline.points[11].y, this.baseline.points[12].y)) / torso : 0;
        start = Math.min(...elbows) >= 155 && drop <= 0.04;
        peak = Math.max(...elbows) <= 105 && !!this.baseline && drop >= 0.12;
        measured = mean2(elbows[0], elbows[1]);
        amplitude = cap((170 - Math.max(...elbows)) / 80 * 100);
        symmetry = cap(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        posture = this.baseline ? cap(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        basis = "\u53CC\u8098\u5C48\u4F38\uFF0B\u80A9\u90E8\u4E0B\u964D\u4F4D\u79FB\uFF08\u53CC\u901A\u9053\u4E92\u8BC1\uFF09";
        motion = `\u53CC\u8098 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF0C\u80A9\u964D ${Math.round(drop * 100)}% \u8EAF\u5E72\u957F\uFF1B\u4F38\u81C2 \u2265155\xB0\uFF0C\u4E0B\u6C89\u8098 \u2264105\xB0 \u4E14\u80A9\u964D \u226512%`;
      } else if (this.type === "mountain_climber") {
        if (tilt < 55) return "\u8BF7\u4FDD\u6301\u4FEF\u6491\uFF1A\u53CC\u624B\u6491\u5730\u3001\u8EAB\u4F53\u6210\u4E00\u6761\u76F4\u7EBF\uFF0C\u659C\u4FA7\u9762\u62CD\u6444\uFF1B\u7AD9\u7ACB\u62AC\u817F\u4E0D\u8BA1\u5165";
        const hips = [angle3(a[11], a[23], a[25]), angle3(a[12], a[24], a[26])];
        legData = [{ hip: hips[0], knee: knees[0], proj: 0 }, { hip: hips[1], knee: knees[1], proj: 0 }];
        start = legData.every((l) => l.hip >= 150 && l.knee >= 150);
        peak = legData.some((l) => l.hip <= 100 && l.knee <= 110);
        measured = mean2(hips[0], hips[1]);
        amplitude = cap((170 - Math.min(...hips)) / 85 * 100);
        posture = this.baseline ? cap(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        symmetry = cap(100 - Math.abs(hips[0] - hips[1]) * 1.5);
        basis = "\u4FEF\u6491\u59FF\u6001\uFF0B\u53CC\u817F\u4EA4\u66FF\u9ACB\u819D\u56DE\u6536";
        motion = `\u9ACB ${Math.round(hips[0])}\xB0 / ${Math.round(hips[1])}\xB0\uFF0C\u819D ${Math.round(knees[0])}\xB0 / ${Math.round(knees[1])}\xB0\uFF1B\u56DE\u6536 \u9ACB \u2264100\xB0 \u4E14\u819D \u2264110\xB0\uFF0C\u8E6C\u56DE \u2265150\xB0`;
      } else if (this.type === "split_squat") {
        const fx = mean2(p[31].x - p[29].x, p[32].x - p[30].x), fy = mean2(p[31].y - p[29].y, p[32].y - p[30].y), flen = Math.hypot(fx, fy) || 1;
        legData = [0, 1].map((i) => {
          const leg = Math.max(0.05, dist(p[23 + i], p[25 + i]) + dist(p[25 + i], p[27 + i]));
          return { hip: 180, knee: knees[i], proj: ((p[27 + i].x - p[23 + i].x) * fx + (p[27 + i].y - p[23 + i].y) * fy) / flen / leg };
        });
        const frontKnee = knees[legData[0].proj >= legData[1].proj ? 0 : 1];
        start = frontKnee >= 150;
        peak = frontKnee <= 125;
        measured = frontKnee;
        amplitude = cap((170 - measured) / 80 * 100);
        symmetry = cap(100 - Math.abs(knees[0] - knees[1]) * 1.5);
        basis = "\u5206\u817F\u7AD9\u59FF\uFF0B\u524D\u817F\u819D\u5C48\u4F38\uFF08\u524D/\u540E\u7531\u7AD9\u59FF\u51E0\u4F55\u5224\u5B9A\uFF09";
        motion = `\u53CC\u819D ${Math.round(knees[0])}\xB0 / ${Math.round(knees[1])}\xB0\uFF1B\u7AD9\u7ACB \u2265150\xB0\uFF0C\u524D\u817F\u4E0B\u6C89 \u2264125\xB0`;
      } else {
        if (tilt > 30) return "\u8BF7\u4FDD\u6301\u76F4\u7ACB\uFF0C\u907F\u514D\u4FEF\u8EAB\u6216\u62AC\u8D77\u5927\u817F\u4EE3\u66FF\u540E\u5C48\u817F";
        const candidate = knees[0] <= knees[1] ? "left" : "right";
        side = this.cycleSide || candidate;
        const k = side === "left" ? 0 : 1, support = 1 - k;
        if (this.cycleSide && knees[support] < 135) return "\u5148\u653E\u56DE\u8FD9\u4E00\u4FA7\u518D\u6362\u817F\u2014\u2014\u8FD9\u4E2A\u4E0D\u7B97\uFF0C\u4E5F\u4E0D\u6263\u5206";
        const hips = angle3(a[11 + k], a[23 + k], a[25 + k]);
        start = Math.min(...knees) >= 150;
        peak = knees[k] <= 95 && knees[support] >= 145 && hips >= 150;
        measured = knees[k];
        amplitude = cap((170 - knees[k]) / 95 * 100);
        posture = cap(100 - Math.max(0, 170 - hips) * 2);
        basis = "\u5355\u4FA7\u819D\u5C48\u4F38\uFF0B\u5927\u817F\u4FDD\u6301\u5411\u4E0B\uFF0B\u53E6\u4E00\u817F\u652F\u6491";
        motion = `${side === "left" ? "\u5DE6" : "\u53F3"}\u819D ${Math.round(knees[k])}\xB0\uFF0C\u9ACB\u89D2 ${Math.round(hips)}\xB0\uFF1B\u62AC\u5927\u817F\u4E0D\u8BA1\u6570`;
        symmetry = cap(100 - Math.max(0, 165 - knees[support]) * 3 - (this.baseline ? dist(p[27 + support], this.baseline.points[27 + support]) / torso * 120 : 0));
        if (!start && hips < 150) hint = "\u8BF7\u8BA9\u5927\u817F\u4FDD\u6301\u5411\u4E0B\uFF0C\u811A\u8DDF\u5411\u540E\u62AC\u8D77\uFF0C\u5411\u524D\u62AC\u819D\u4E0D\u8BA1\u5165";
      }
      const scorable = confidence >= 0.7 && [11, 12, 23, 24, ...this.type === "romanian_deadlift" || this.type === "glute_bridge" || this.type === "barbell_deadlift" || this.type === "lying_leg_raise" ? [25, 26, 27, 28] : []].every((i) => (points[i].visibility ?? 0) >= 0.7);
      return { start, peak, amplitude, angle: measured, confidence, scorable, posture, symmetry, controlPenalty, hint, side, basis, motion, points: p, torso, tilt, elbows: perSide, raiseSides: raiseData, legSides: legData, framing };
    }
    /** The peer-peak memory as it stands just before a cycle reset: each side's
     * completed peak record (lastPeak), superseded by fresher peak evidence its
     * still-open cycle holds — a locked peak (peakStart set by a valid closed
     * episode) that never reached completion, or an open peak episode whose
     * deepest sample already clears the same dwell floor a closed episode must
     * clear (PEAK_MIN_DWELL_MS in-zone up to the last measured frame). Spent only
     * through interrupt()'s preservePeerPeak path, so a soft interrupt cannot
     * erase a peak the peer already produced; peerPeakFor still applies its own
     * PEAK_PAIR_WINDOW_MS check when the memory is used, so a snapshot can never
     * pair two peaks that were not actually close in time. Hammer peak units:
     * the depth signal is 80 − elbow, so an open track's peak value is
     * 80 − track.best (a closed episode's interpolated refinement is unknowable
     * for an episode that never closed; the sampled extremum is the honest
     * record, and it is what the track itself would have closed on had the
     * signal left the zone on the next frame). */
    peerPeakSnapshot() {
      const snap = [this.lastPeak[0], this.lastPeak[1]];
      for (const s of [0, 1]) {
        const cyc = this.hammerSides[s];
        let cand = null;
        if (cyc.peakStart !== null) cand = { at: (cyc.peakStart + cyc.peakEnd) / 2, value: cyc.peakElbow };
        else if (cyc.track.open && cyc.track.best > -Infinity && (this.last ?? cyc.track.bestAt) - cyc.track.start >= PEAK_MIN_DWELL_MS) cand = { at: cyc.track.bestAt, value: 80 - cyc.track.best };
        if (cand && (!snap[s] || cand.at >= snap[s].at)) snap[s] = cand;
      }
      return snap;
    }
    /** The other side's confirmed peak for peak-to-peak symmetry (round 3): its last
     * completion's peak if that peaked within PEAK_PAIR_WINDOW_MS of this rep's
     * peak, else its still-open cycle's confirmed peak under the same window. */
    peerPeakFor(single, cycles) {
      const mid2 = (single.peakStart + single.peakEnd) / 2, other = 1 - single.side;
      const stashed = this.lastPeak[other];
      if (stashed && Math.abs(stashed.at - mid2) <= PEAK_PAIR_WINDOW_MS) return stashed;
      const live = cycles[other];
      if (live.peakStart !== null) {
        const at = (live.peakStart + live.peakEnd) / 2;
        if (Math.abs(at - mid2) <= PEAK_PAIR_WINDOW_MS) return { at, value: live.peakElbow };
      }
      return void 0;
    }
    emitHammerRep(parts, f, peer) {
      if (this.metrics.reps >= this.metrics.targetReps) return false;
      const pair = parts.length === 2;
      const depth = pair ? Math.min(parts[0].peakAmp, parts[1].peakAmp) : parts[0].peakAmp;
      const posture = pair ? Math.min(parts[0].peakPosture, parts[1].peakPosture) : parts[0].peakPosture;
      const control = Math.max(...parts.map((p) => p.control)), shift = Math.max(...parts.map((p) => p.shift)), speed = Math.max(...parts.map((p) => p.speed)), duration = Math.max(...parts.map((p) => p.duration));
      const mid2 = (p) => (p.peakStart + p.peakEnd) / 2;
      let offsetMs = null;
      if (pair) offsetMs = Math.abs(mid2(parts[0]) - mid2(parts[1]));
      else if (peer) offsetMs = Math.abs(mid2(parts[0]) - peer.at);
      else {
        const lastOther = this.lastPeak[1 - parts[0].side];
        if (lastOther) offsetMs = Math.abs(mid2(parts[0]) - lastOther.at);
      }
      const breakdown = { depth, stability: cap(100 - Math.max(0, speed - 260) * 0.08 - Math.max(0, 0.6 - duration) * 70 - control), trunk: cap(posture - shift * 1.5) };
      const score = Math.round((breakdown.depth * 0.35 + breakdown.stability * 0.25 + breakdown.trunk * 0.2) / 0.8), scored = parts.every((p) => p.scoring) && f.scorable, issues = [];
      if (breakdown.depth < 70) issues.push("insufficient_range");
      if (breakdown.stability < 70 && stabilityWithoutControl(speed, duration) < 70) issues.push("unstable_movement");
      const acc = { ...this.metrics.scoreAccumulator }, counts = { ...this.metrics.correctionCounts };
      if (scored) {
        acc.count++;
        acc.total += score;
        acc.depth += breakdown.depth;
        acc.stability += breakdown.stability;
        acc.trunk += breakdown.trunk;
        if (offsetMs !== null) acc.symmetryOffsetsMs = [...acc.symmetryOffsetsMs ?? [], Math.round(offsetMs)];
        issues.forEach((k) => counts[k]++);
      }
      const withheld = scored && totalWithheld(this.assessmentsFor(acc));
      this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, lastRepScore: scored ? score : null, scoreAccumulator: acc, perfectReps: this.metrics.perfectReps + (scored && score >= 90 ? 1 : 0), formScore: acc.count ? Math.round(acc.total / acc.count) : 0, correctionCounts: counts, lastRepIssues: scored ? issues : [], feedback: scored ? withheld ? `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u672C\u6B21 ${score} \u5206` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u8FD9\u6B21\u6CA1\u770B\u6E05\uFF0C\u4E0D\u8BC4\u5206` };
      this.updateAverage();
      return true;
    }
    /** Hammer curls count per side: an alternating curl scores one rep per arm, while two sides whose peaks overlap merge into a single synchronized rep. */
    updateHammerCurl(f, now) {
      const elbows = f.elbows;
      let completed = false;
      if (this.hammerPending && now - this.hammerPending.at > 600) {
        const pending = this.hammerPending;
        this.hammerPending = null;
        if (this.emitHammerRep([pending], f, this.peerPeakFor(pending, this.hammerSides))) completed = true;
      }
      for (const s of [0, 1]) {
        const cyc = this.hammerSides[s], e = elbows[s], other = elbows[1 - s];
        const ev = feedPeakTrack(cyc.track, now, 80 - e);
        if (ev.best) {
          cyc.peakPosture = f.posture;
          cyc.peakOther = other;
        }
        if (ev.closed?.valid) {
          cyc.peakStart = ev.closed.start;
          cyc.peakEnd = ev.closed.end;
          cyc.peakElbow = 80 - ev.closed.depth;
          cyc.peakAmp = cap((160 - cyc.peakElbow) / 95 * 100);
          cyc.peakWindows.push({ start: ev.closed.start, end: ev.closed.end });
        }
        const portion = cyc.prevAt === null ? { start: now, ms: 0 } : zonePortion(cyc.prevAngle, e, 145, true, cyc.prevAt, now);
        let replaced = false;
        if (cyc.peakStart !== null && portion.ms > 0) {
          if (cyc.returnSince === null || portion.start - cyc.returnSince > RETURN_WINDOW_MS2) {
            cyc.returnSince = portion.start;
            cyc.returnAccum = 0;
          }
          cyc.returnAccum += Math.min(RETURN_FRAME_CAP_MS2, portion.ms);
          if (cyc.returnAccum >= RETURN_HOLD_MS) {
            const done = { side: s, at: now, peakStart: cyc.peakStart, peakEnd: cyc.peakEnd, peakAmp: cyc.peakAmp, peakPosture: cyc.peakPosture, peakOther: cyc.peakOther, peakElbow: cyc.peakElbow, duration: (now - (cyc.movingAt ?? now)) / 1e3, scoring: cyc.scoring, control: sustainedPeak(controlSpans(cyc.controlSamples, now), cyc.controlMax), shift: cyc.shiftMax, speed: sustainedPeak(cyc.speedSpans, cyc.speedMax), peakWindows: cyc.peakWindows, cycleStart: cyc.movingAt ?? cyc.peakStart, returnedAt: cyc.returnSince ?? now };
            this.lastPeak[s] = { at: (done.peakStart + done.peakEnd) / 2, value: done.peakElbow };
            this.hammerSides[s] = freshSideCycle();
            replaced = true;
            if (this.hammerPending) {
              const pending = this.hammerPending;
              const overlap = done.peakWindows.some((w) => pending.peakWindows.some((p) => w.start <= p.end + 150 && p.start <= w.end + 150));
              if (pending.side !== s && overlap) {
                this.hammerPending = null;
                if (this.emitHammerRep([pending, done], f)) completed = true;
              } else {
                this.hammerPending = null;
                if (this.emitHammerRep([pending], f, this.peerPeakFor(pending, this.hammerSides))) completed = true;
                this.hammerPending = done;
              }
            } else this.hammerPending = done;
          }
        }
        if (!replaced) {
          if (e >= 145) {
            if (cyc.peakStart === null && cyc.movingAt !== null) {
              this.hammerSides[s] = freshSideCycle();
              replaced = true;
            }
          } else {
            if (cyc.movingAt === null) cyc.movingAt = now;
            cyc.scoring = cyc.scoring && f.scorable;
            cyc.controlMax = Math.max(cyc.controlMax, f.controlPenalty);
            cyc.controlSamples.push({ t: now, v: f.controlPenalty });
            cyc.shiftMax = Math.max(cyc.shiftMax, Math.abs(f.tilt - this.baseline.tilt));
            if (cyc.sampleAt === null) {
              cyc.sampleAt = now;
              cyc.sampleAngle = e;
            } else if (now - cyc.sampleAt >= 100) {
              const v = Math.abs(e - cyc.sampleAngle) * 1e3 / (now - cyc.sampleAt);
              cyc.speedMax = Math.max(cyc.speedMax, v);
              cyc.speedSpans.push({ start: cyc.sampleAt, end: now, v });
              cyc.sampleAt = now;
              cyc.sampleAngle = e;
            }
          }
        }
        const cur = this.hammerSides[s];
        cur.prevAt = now;
        cur.prevAngle = e;
        if (replaced) {
          cur.track.prevAt = now;
          cur.track.prevDepth = 80 - e;
        }
      }
      const anyPeak = this.hammerSides.some((c) => c.peakStart !== null || c.track.open) || this.hammerPending !== null;
      const stage = this.metrics.reps >= this.metrics.targetReps ? "complete" : anyPeak ? f.start ? "returning" : "peak" : f.start ? "ready" : "moving";
      const copy = definitions[this.type].stages;
      const nearPeak = stage === "moving" && elbows.every((e) => e > 80) && elbows.some((e) => e <= 105);
      const message = stage === "complete" ? "\u76EE\u6807\u5B8C\u6210\u5566\uFF0C\u6F02\u4EAE" : completed ? this.metrics.feedback : nearPeak ? "\u63A5\u8FD1\u5566\uFF0C\u518D\u5F80\u4E0A\u5E26\u4E00\u70B9\u70B9\uFF0C\u5230\u80A9\u8180\u9AD8\u518D\u653E\u56DE" : copy[stage === "ready" ? 0 : stage === "moving" ? 1 : stage === "peak" ? 2 : 3] + (stage === "moving" ? " \xB7 \u7EE7\u7EED\uFF0C\u4FDD\u6301\u4F4F" : "");
      const issue = null;
      this.diagnostics = { ...this.diagnostics, stage };
      this.metrics = { ...this.metrics, phase: f.start ? "standing" : anyPeak ? "ascending" : "descending", feedback: completed ? this.metrics.feedback : message, poseFeedback: { status: !f.scorable ? "uncertain" : issue ? "adjust" : "stable", confidence: f.confidence, issues: issue ? [issue] : [], primaryIssue: issue, affectedJoints: issue ? poseIssueCopy(issue, this.type).joints : [], calibrated: true, message: issue ? poseIssueCopy(issue, this.type).action : message } };
      return this.metrics;
    }
    emitOneArmRowRep(done, otherBase, f) {
      if (this.metrics.reps >= this.metrics.targetReps) return false;
      const symmetry = cap(100 - Math.abs(done.peakOther - otherBase) * 1.5);
      const breakdown = { depth: done.peakAmp, stability: cap(100 - Math.max(0, done.speed - 260) * 0.08 - Math.max(0, 0.6 - done.duration) * 70 - done.control), trunk: cap(done.peakPosture - done.shift * 1.5), symmetry };
      const score = Math.round(breakdown.depth * 0.35 + breakdown.stability * 0.25 + breakdown.trunk * 0.2 + breakdown.symmetry * 0.2), scored = done.scoring && f.scorable, issues = [];
      if (breakdown.depth < 70) issues.push("insufficient_range");
      if (breakdown.stability < 70) issues.push("unstable_movement");
      if (breakdown.trunk < 70) issues.push("body_alignment");
      if (breakdown.symmetry < 70) issues.push("poor_coordination");
      const acc = { ...this.metrics.scoreAccumulator }, counts = { ...this.metrics.correctionCounts };
      const key = done.side === 0 ? "leftReps" : "rightReps";
      acc[key] = (acc[key] || 0) + 1;
      if (scored) {
        acc.count++;
        acc.total += score;
        axes2.forEach((k) => acc[k] += breakdown[k]);
        issues.forEach((k) => counts[k]++);
      }
      this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, lastRepScore: scored ? score : null, scoreAccumulator: acc, perfectReps: this.metrics.perfectReps + (scored && score >= 90 ? 1 : 0), formScore: acc.count ? Math.round(acc.total / acc.count) : 0, correctionCounts: counts, lastRepIssues: scored ? issues : [], feedback: scored ? `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u672C\u6B21 ${score} \u5206` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u8FD9\u6B21\u6CA1\u770B\u6E05\uFF0C\u4E0D\u8BC4\u5206` };
      this.updateAverage();
      return true;
    }
    /** One-arm rows count per side like hammer curls, minus the pairing: the two
     * sides are independent efforts (one works, one supports), so a completion
     * emits immediately — nothing ever merges, and a side that never leaves the
     * start pose (the support) can never produce a rep, while switching the
     * working side between reps needs no re-locking. The peak zone is the
     * bent_over_row peak (elbow ≤100°) carried on the depth signal 100 − elbow;
     * peak amplitude reuses that pattern's formula; the return gate is the
     * shared ≥145° accumulation. */
    updateOneArmRow(f, now) {
      const elbows = f.elbows;
      let completed = false;
      for (const s of [0, 1]) {
        const cyc = this.rowSides[s], e = elbows[s], other = elbows[1 - s];
        const ev = feedPeakTrack(cyc.track, now, 100 - e);
        if (ev.best) {
          cyc.peakPosture = f.posture;
          cyc.peakOther = other;
        }
        if (ev.closed?.valid) {
          cyc.peakStart = ev.closed.start;
          cyc.peakEnd = ev.closed.end;
          cyc.peakElbow = 100 - ev.closed.depth;
          cyc.peakAmp = cap((160 - cyc.peakElbow) / 90 * 100);
          cyc.peakWindows.push({ start: ev.closed.start, end: ev.closed.end });
        }
        const portion = cyc.prevAt === null ? { start: now, ms: 0 } : zonePortion(cyc.prevAngle, e, 145, true, cyc.prevAt, now);
        let replaced = false;
        if (cyc.peakStart !== null && portion.ms > 0) {
          if (cyc.returnSince === null || portion.start - cyc.returnSince > RETURN_WINDOW_MS2) {
            cyc.returnSince = portion.start;
            cyc.returnAccum = 0;
          }
          cyc.returnAccum += Math.min(RETURN_FRAME_CAP_MS2, portion.ms);
          if (cyc.returnAccum >= RETURN_HOLD_MS) {
            const done = { side: s, at: now, peakStart: cyc.peakStart, peakEnd: cyc.peakEnd, peakAmp: cyc.peakAmp, peakPosture: cyc.peakPosture, peakOther: cyc.peakOther, peakElbow: cyc.peakElbow, duration: (now - (cyc.movingAt ?? now)) / 1e3, scoring: cyc.scoring, control: sustainedPeak(controlSpans(cyc.controlSamples, now), cyc.controlMax), shift: cyc.shiftMax, speed: sustainedPeak(cyc.speedSpans, cyc.speedMax), peakWindows: cyc.peakWindows, cycleStart: cyc.movingAt ?? cyc.peakStart, returnedAt: cyc.returnSince ?? now };
            const otherBase = cyc.otherBase;
            this.rowSides[s] = freshSideCycle();
            replaced = true;
            if (this.emitOneArmRowRep(done, otherBase, f)) completed = true;
          }
        }
        if (!replaced) {
          if (e >= 145) {
            if (cyc.peakStart === null && cyc.movingAt !== null) {
              this.rowSides[s] = freshSideCycle();
              this.rowSides[s].otherBase = other;
              replaced = true;
            } else if (cyc.peakStart === null && cyc.movingAt === null) cyc.otherBase = other;
          } else {
            if (cyc.movingAt === null) {
              cyc.movingAt = now;
              if (cyc.otherBase === 180 && this.baseline?.elbows) cyc.otherBase = this.baseline.elbows[1 - s];
            }
            cyc.scoring = cyc.scoring && f.scorable;
            cyc.controlMax = Math.max(cyc.controlMax, f.controlPenalty);
            cyc.controlSamples.push({ t: now, v: f.controlPenalty });
            cyc.shiftMax = Math.max(cyc.shiftMax, Math.abs(f.tilt - this.baseline.tilt));
            if (cyc.sampleAt === null) {
              cyc.sampleAt = now;
              cyc.sampleAngle = e;
            } else if (now - cyc.sampleAt >= 100) {
              const v = Math.abs(e - cyc.sampleAngle) * 1e3 / (now - cyc.sampleAt);
              cyc.speedMax = Math.max(cyc.speedMax, v);
              cyc.speedSpans.push({ start: cyc.sampleAt, end: now, v });
              cyc.sampleAt = now;
              cyc.sampleAngle = e;
            }
          }
        }
        const cur = this.rowSides[s];
        cur.prevAt = now;
        cur.prevAngle = e;
        if (replaced) {
          cur.track.prevAt = now;
          cur.track.prevDepth = 100 - e;
        }
      }
      const anyPeak = this.rowSides.some((c) => c.peakStart !== null || c.track.open);
      const stage = this.metrics.reps >= this.metrics.targetReps ? "complete" : anyPeak ? f.start ? "returning" : "peak" : f.start ? "ready" : "moving";
      const copy = definitions[this.type].stages;
      const nearPeak = stage === "moving" && elbows.some((e) => e > 100 && e <= 125);
      const message = stage === "complete" ? "\u76EE\u6807\u5B8C\u6210\u5566\uFF0C\u6F02\u4EAE" : completed ? this.metrics.feedback : nearPeak ? "\u63A5\u8FD1\u5566\uFF0C\u518D\u5F80\u540E\u62C9\u4E00\u70B9\u70B9\uFF0C\u8098\u8D34\u8FD1\u8EAF\u5E72\u518D\u653E\u56DE" : copy[stage === "ready" ? 0 : stage === "moving" ? 1 : stage === "peak" ? 2 : 3] + (stage === "moving" ? " \xB7 \u7EE7\u7EED\uFF0C\u4FDD\u6301\u4F4F" : "");
      const issue = f.posture < 70 ? "body_alignment" : null;
      this.diagnostics = { ...this.diagnostics, stage };
      this.metrics = { ...this.metrics, phase: f.start ? "standing" : anyPeak ? "ascending" : "descending", feedback: completed ? this.metrics.feedback : message, poseFeedback: { status: !f.scorable ? "uncertain" : issue ? "adjust" : "stable", confidence: f.confidence, issues: issue ? [issue] : [], primaryIssue: issue, affectedJoints: issue ? poseIssueCopy(issue, this.type).joints : [], calibrated: true, message: issue ? poseIssueCopy(issue, this.type).action : message } };
      return this.metrics;
    }
    emitClimberRep(done, f) {
      if (this.metrics.reps >= this.metrics.targetReps) return false;
      const symmetry = cap(100 - Math.max(0, 150 - done.peakOther) * 1.5);
      const breakdown = { depth: done.peakAmp, stability: cap(100 - Math.max(0, done.speed - 420) * 0.08 - done.control), trunk: cap(done.peakPosture - done.shift * 1.5), symmetry };
      const score = Math.round(breakdown.depth * 0.35 + breakdown.stability * 0.25 + breakdown.trunk * 0.2 + breakdown.symmetry * 0.2), scored = done.scoring && f.scorable, issues = [];
      if (breakdown.depth < 70) issues.push("insufficient_range");
      if (breakdown.stability < 70) issues.push("unstable_movement");
      if (breakdown.trunk < 70) issues.push("body_alignment");
      if (breakdown.symmetry < 70) issues.push("poor_coordination");
      const acc = { ...this.metrics.scoreAccumulator }, counts = { ...this.metrics.correctionCounts };
      const key = done.side === 0 ? "leftReps" : "rightReps";
      acc[key] = (acc[key] || 0) + 1;
      if (scored) {
        acc.count++;
        acc.total += score;
        axes2.forEach((k) => acc[k] += breakdown[k]);
        issues.forEach((k) => counts[k]++);
      }
      this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, lastRepScore: scored ? score : null, scoreAccumulator: acc, perfectReps: this.metrics.perfectReps + (scored && score >= 90 ? 1 : 0), formScore: acc.count ? Math.round(acc.total / acc.count) : 0, correctionCounts: counts, lastRepIssues: scored ? issues : [], feedback: scored ? `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u672C\u6B21 ${score} \u5206` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u8FD9\u6B21\u6CA1\u770B\u6E05\uFF0C\u4E0D\u8BC4\u5206` };
      this.updateAverage();
      return true;
    }
    /** Mountain climbers count per side like one-arm rows: each leg runs its own
     * extended (hip ≥150° and knee ≥150°) → tucked (hip ≤100° and knee ≤110°) →
     * extended cycle on the depth signal min(100 − hip, 110 − knee), and a
     * completion emits immediately for that side. One alternation rule from the
     * survey draft （左右交替）: a completion only counts when the OTHER side was
     * back at extension (hip ≥135°) at this side's peak — both legs tucked
     * together is a frog tuck, not a climber drive, and is discarded for both
     * sides alike. There is no pairing and no pending window. */
    updateMountainClimber(f, now) {
      const legs = f.legSides;
      let completed = false;
      for (const s of [0, 1]) {
        const cyc = this.climberSides[s], leg = legs[s], other = legs[1 - s];
        const depth = Math.min(100 - leg.hip, 110 - leg.knee);
        const ev = feedPeakTrack(cyc.track, now, depth);
        if (ev.best) {
          cyc.peakPosture = f.posture;
          cyc.peakOther = other.hip;
          cyc.peakElbow = leg.hip;
          cyc.peakAmp = cap((170 - leg.hip) / 85 * 100);
        }
        if (ev.closed?.valid) {
          cyc.peakStart = ev.closed.start;
          cyc.peakEnd = ev.closed.end;
          cyc.peakWindows.push({ start: ev.closed.start, end: ev.closed.end });
        }
        const ext = Math.min(leg.hip - 150, leg.knee - 150);
        const portion = cyc.prevAt === null ? { start: now, ms: 0 } : zonePortion(cyc.prevAngle, ext, 0, true, cyc.prevAt, now);
        let replaced = false;
        if (cyc.peakStart !== null && portion.ms > 0) {
          if (cyc.returnSince === null || portion.start - cyc.returnSince > RETURN_WINDOW_MS2) {
            cyc.returnSince = portion.start;
            cyc.returnAccum = 0;
          }
          cyc.returnAccum += Math.min(RETURN_FRAME_CAP_MS2, portion.ms);
          if (cyc.returnAccum >= RETURN_HOLD_MS) {
            const done = { side: s, at: now, peakStart: cyc.peakStart, peakEnd: cyc.peakEnd, peakAmp: cyc.peakAmp, peakPosture: cyc.peakPosture, peakOther: cyc.peakOther, peakElbow: cyc.peakElbow, duration: (now - (cyc.movingAt ?? now)) / 1e3, scoring: cyc.scoring, control: sustainedPeak(controlSpans(cyc.controlSamples, now), cyc.controlMax), shift: cyc.shiftMax, speed: sustainedPeak(cyc.speedSpans, cyc.speedMax), peakWindows: cyc.peakWindows, cycleStart: cyc.movingAt ?? cyc.peakStart, returnedAt: cyc.returnSince ?? now };
            const alternated = done.peakOther >= 135;
            this.climberSides[s] = freshSideCycle();
            replaced = true;
            if (alternated && this.emitClimberRep(done, f)) completed = true;
          }
        }
        if (!replaced) {
          if (ext >= 0) {
            if (cyc.peakStart === null && cyc.movingAt !== null) {
              this.climberSides[s] = freshSideCycle();
              replaced = true;
            }
          } else {
            if (cyc.movingAt === null) cyc.movingAt = now;
            cyc.scoring = cyc.scoring && f.scorable;
            cyc.controlMax = Math.max(cyc.controlMax, f.controlPenalty);
            cyc.controlSamples.push({ t: now, v: f.controlPenalty });
            cyc.shiftMax = Math.max(cyc.shiftMax, Math.abs(f.tilt - this.baseline.tilt));
            if (cyc.sampleAt === null) {
              cyc.sampleAt = now;
              cyc.sampleAngle = leg.hip;
            } else if (now - cyc.sampleAt >= 100) {
              const v = Math.abs(leg.hip - cyc.sampleAngle) * 1e3 / (now - cyc.sampleAt);
              cyc.speedMax = Math.max(cyc.speedMax, v);
              cyc.speedSpans.push({ start: cyc.sampleAt, end: now, v });
              cyc.sampleAt = now;
              cyc.sampleAngle = leg.hip;
            }
          }
        }
        const cur = this.climberSides[s];
        cur.prevAt = now;
        cur.prevAngle = ext;
        if (replaced) {
          cur.track.prevAt = now;
          cur.track.prevDepth = depth;
        }
      }
      const anyPeak = this.climberSides.some((c) => c.peakStart !== null || c.track.open);
      const stage = this.metrics.reps >= this.metrics.targetReps ? "complete" : anyPeak ? f.start ? "returning" : "peak" : f.start ? "ready" : "moving";
      const copy = definitions[this.type].stages;
      const nearTuck = stage === "moving" && legs.some((l) => l.hip <= 130 && l.knee <= 135);
      const message = stage === "complete" ? "\u76EE\u6807\u5B8C\u6210\u5566\uFF0C\u6F02\u4EAE" : completed ? this.metrics.feedback : nearTuck ? "\u63A5\u8FD1\u5566\uFF0C\u518D\u5F80\u80F8\u53E3\u6536\u4E00\u70B9\u70B9" : copy[stage === "ready" ? 0 : stage === "moving" ? 1 : stage === "peak" ? 2 : 3] + (stage === "moving" ? " \xB7 \u7EE7\u7EED\uFF0C\u4FDD\u6301\u4F4F" : "");
      const issue = f.posture < 70 ? "body_alignment" : null;
      this.diagnostics = { ...this.diagnostics, stage };
      this.metrics = { ...this.metrics, phase: f.start ? "standing" : anyPeak ? "ascending" : "descending", feedback: completed ? this.metrics.feedback : message, poseFeedback: { status: !f.scorable ? "uncertain" : issue ? "adjust" : "stable", confidence: f.confidence, issues: issue ? [issue] : [], primaryIssue: issue, affectedJoints: issue ? poseIssueCopy(issue, this.type).joints : [], calibrated: true, message: issue ? poseIssueCopy(issue, this.type).action : message } };
      return this.metrics;
    }
    emitSplitSquatRep(done, rearDrift, f) {
      if (this.metrics.reps >= this.metrics.targetReps) return false;
      const symmetry = cap(100 - rearDrift / f.torso * 200);
      const breakdown = { depth: done.peakAmp, stability: cap(100 - Math.max(0, done.speed - 260) * 0.08 - Math.max(0, 0.6 - done.duration) * 70 - done.control), trunk: cap(done.peakPosture - done.shift * 1.5), symmetry };
      const score = Math.round(breakdown.depth * 0.35 + breakdown.stability * 0.25 + breakdown.trunk * 0.2 + breakdown.symmetry * 0.2), scored = done.scoring && f.scorable, issues = [];
      if (breakdown.depth < 70) issues.push("insufficient_range");
      if (breakdown.stability < 70) issues.push("unstable_movement");
      if (breakdown.trunk < 70) issues.push("body_alignment");
      if (breakdown.symmetry < 70) issues.push("poor_coordination");
      const acc = { ...this.metrics.scoreAccumulator }, counts = { ...this.metrics.correctionCounts };
      const key = done.side === 0 ? "leftReps" : "rightReps";
      acc[key] = (acc[key] || 0) + 1;
      if (scored) {
        acc.count++;
        acc.total += score;
        axes2.forEach((k) => acc[k] += breakdown[k]);
        issues.forEach((k) => counts[k]++);
      }
      this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, lastRepScore: scored ? score : null, scoreAccumulator: acc, perfectReps: this.metrics.perfectReps + (scored && score >= 90 ? 1 : 0), formScore: acc.count ? Math.round(acc.total / acc.count) : 0, correctionCounts: counts, lastRepIssues: scored ? issues : [], feedback: scored ? `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u672C\u6B21 ${score} \u5206` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u8FD9\u6B21\u6CA1\u770B\u6E05\uFF0C\u4E0D\u8BC4\u5206` };
      this.updateAverage();
      return true;
    }
    /** Split squats run the squat family's knee cycle on the front leg only.
     * Only the front side's cycle is fed; the rear side never accumulates a
     * cycle, so its (also flexing) knee can never produce a rep. The front
     * side is re-derived from stance geometry every frame (see measure), the
     * feet stay planted throughout a rep so the derivation is stable, and
     * swapping stance between reps simply feeds the other side's fresh cycle —
     * a mid-cycle flip voids the abandoned half cycle instead of completing
     * it as the wrong leg. */
    updateSplitSquat(f, now) {
      const legs = f.legSides;
      const front = legs[0].proj >= legs[1].proj ? 0 : 1, rear = 1 - front;
      if (this.squatFront !== null && this.squatFront !== front) this.squatSides[this.squatFront] = freshSideCycle();
      this.squatFront = front;
      const cyc = this.squatSides[front], knee = legs[front].knee;
      let completed = false;
      const ev = feedPeakTrack(cyc.track, now, 125 - knee);
      if (ev.best) {
        cyc.peakPosture = f.posture;
        cyc.supportPeak = { ...f.points[27 + rear] };
      }
      if (ev.closed?.valid) {
        cyc.peakStart = ev.closed.start;
        cyc.peakEnd = ev.closed.end;
        cyc.peakElbow = 125 - ev.closed.depth;
        cyc.peakAmp = cap((170 - cyc.peakElbow) / 80 * 100);
        cyc.peakWindows.push({ start: ev.closed.start, end: ev.closed.end });
      }
      const portion = cyc.prevAt === null ? { start: now, ms: 0 } : zonePortion(cyc.prevAngle, knee, 150, true, cyc.prevAt, now);
      let replaced = false;
      if (cyc.peakStart !== null && portion.ms > 0) {
        if (cyc.returnSince === null || portion.start - cyc.returnSince > RETURN_WINDOW_MS2) {
          cyc.returnSince = portion.start;
          cyc.returnAccum = 0;
        }
        cyc.returnAccum += Math.min(RETURN_FRAME_CAP_MS2, portion.ms);
        if (cyc.returnAccum >= RETURN_HOLD_MS) {
          const done = { side: front, at: now, peakStart: cyc.peakStart, peakEnd: cyc.peakEnd, peakAmp: cyc.peakAmp, peakPosture: cyc.peakPosture, peakOther: legs[rear].knee, peakElbow: cyc.peakElbow, duration: (now - (cyc.movingAt ?? now)) / 1e3, scoring: cyc.scoring, control: sustainedPeak(controlSpans(cyc.controlSamples, now), cyc.controlMax), shift: cyc.shiftMax, speed: sustainedPeak(cyc.speedSpans, cyc.speedMax), peakWindows: cyc.peakWindows, cycleStart: cyc.movingAt ?? cyc.peakStart, returnedAt: cyc.returnSince ?? now };
          const drift = cyc.supportBase && cyc.supportPeak ? dist(cyc.supportPeak, cyc.supportBase) : 0;
          this.squatSides[front] = freshSideCycle();
          replaced = true;
          if (this.emitSplitSquatRep(done, drift, f)) completed = true;
        }
      }
      if (!replaced) {
        if (knee >= 150) {
          if (cyc.peakStart === null && cyc.movingAt !== null) {
            this.squatSides[front] = freshSideCycle();
            replaced = true;
          }
        } else {
          if (cyc.movingAt === null) {
            cyc.movingAt = now;
            cyc.supportBase = { ...f.points[27 + rear] };
          }
          cyc.scoring = cyc.scoring && f.scorable;
          cyc.controlMax = Math.max(cyc.controlMax, f.controlPenalty);
          cyc.controlSamples.push({ t: now, v: f.controlPenalty });
          cyc.shiftMax = Math.max(cyc.shiftMax, Math.abs(f.tilt - this.baseline.tilt));
          if (cyc.sampleAt === null) {
            cyc.sampleAt = now;
            cyc.sampleAngle = knee;
          } else if (now - cyc.sampleAt >= 100) {
            const v = Math.abs(knee - cyc.sampleAngle) * 1e3 / (now - cyc.sampleAt);
            cyc.speedMax = Math.max(cyc.speedMax, v);
            cyc.speedSpans.push({ start: cyc.sampleAt, end: now, v });
            cyc.sampleAt = now;
            cyc.sampleAngle = knee;
          }
        }
      }
      const cur = this.squatSides[front];
      cur.prevAt = now;
      cur.prevAngle = knee;
      if (replaced) {
        cur.track.prevAt = now;
        cur.track.prevDepth = 125 - knee;
      }
      const anyPeak = cur.peakStart !== null || cur.track.open;
      const stage = this.metrics.reps >= this.metrics.targetReps ? "complete" : anyPeak ? f.start ? "returning" : "peak" : f.start ? "ready" : "moving";
      const copy = definitions[this.type].stages;
      const nearPeak = stage === "moving" && knee <= 145 && knee > 125;
      const message = stage === "complete" ? "\u76EE\u6807\u5B8C\u6210\u5566\uFF0C\u6F02\u4EAE" : completed ? this.metrics.feedback : nearPeak ? "\u63A5\u8FD1\u5566\uFF0C\u518D\u5F80\u4E0B\u6C89\u4E00\u70B9\u70B9" : copy[stage === "ready" ? 0 : stage === "moving" ? 1 : stage === "peak" ? 2 : 3] + (stage === "moving" ? " \xB7 \u7EE7\u7EED\uFF0C\u4FDD\u6301\u4F4F" : "");
      const issue = f.posture < 70 ? "body_alignment" : null;
      this.diagnostics = { ...this.diagnostics, stage };
      this.metrics = { ...this.metrics, phase: f.start ? "standing" : anyPeak ? "ascending" : "descending", feedback: completed ? this.metrics.feedback : message, poseFeedback: { status: !f.scorable ? "uncertain" : issue ? "adjust" : "stable", confidence: f.confidence, issues: issue ? [issue] : [], primaryIssue: issue, affectedJoints: issue ? poseIssueCopy(issue, this.type).joints : [], calibrated: true, message: issue ? poseIssueCopy(issue, this.type).action : message } };
      return this.metrics;
    }
    emitFrontRaiseRep(parts, f, peer) {
      if (this.metrics.reps >= this.metrics.targetReps) return false;
      const pair = parts.length === 2;
      const posture = pair ? Math.min(parts[0].peakPosture, parts[1].peakPosture) : parts[0].peakPosture;
      const control = Math.max(...parts.map((p) => p.control)), shift = Math.max(...parts.map((p) => p.shift)), speed = Math.max(...parts.map((p) => p.speed)), duration = Math.max(...parts.map((p) => p.duration));
      const breakdown = { stability: cap(100 - Math.max(0, speed - 260) * 0.08 - Math.max(0, 0.6 - duration) * 70 - control), trunk: cap(posture - shift * 1.5) };
      const score = Math.round((breakdown.stability * 0.25 + breakdown.trunk * 0.2) / 0.45), scored = parts.every((p) => p.scoring) && f.scorable, issues = [];
      if (breakdown.stability < 70 && stabilityWithoutControl(speed, duration) < 70) issues.push("unstable_movement");
      const acc = { ...this.metrics.scoreAccumulator }, counts = { ...this.metrics.correctionCounts };
      if (scored) {
        acc.count++;
        acc.total += score;
        acc.stability += breakdown.stability;
        acc.trunk += breakdown.trunk;
        const bands = { left: { ...acc.depthBandCounts?.left ?? {} }, right: { ...acc.depthBandCounts?.right ?? {} } };
        for (const part of parts) {
          const sideKey = part.side === 0 ? "left" : "right";
          const tally = { ...bands[sideKey] ?? {} };
          const band = frontRaiseBandFor(part.peakElbow);
          tally[band] = (tally[band] || 0) + 1;
          bands[sideKey] = tally;
        }
        acc.depthBandCounts = bands;
        issues.forEach((k) => counts[k]++);
      }
      const withheld = scored && totalWithheld(this.assessmentsFor(acc));
      this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, lastRepScore: scored ? score : null, scoreAccumulator: acc, perfectReps: this.metrics.perfectReps + (scored && score >= 90 ? 1 : 0), formScore: acc.count ? Math.round(acc.total / acc.count) : 0, correctionCounts: counts, lastRepIssues: scored ? issues : [], feedback: scored ? withheld ? `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u672C\u6B21 ${score} \u5206` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u8FD9\u6B21\u6CA1\u770B\u6E05\uFF0C\u4E0D\u8BC4\u5206` };
      this.updateAverage();
      return true;
    }
    /** A front-raise completion's arrival at the pending/merge machinery: it
     * pairs with a waiting opposite-side completion whose kept peak windows
     * overlap, otherwise it flushes the waiting one as a single and takes its
     * place. Shared by the return-confirmed path and the latch payout below,
     * so a paid-out latch is indistinguishable from a returned one downstream. */
    arriveRaiseCompletion(done, f) {
      let completed = false;
      if (this.raisePending) {
        const pending = this.raisePending;
        const overlap = done.peakStart <= pending.peakEnd + 150 && pending.peakStart <= done.peakEnd + 150;
        if (pending.side !== done.side && overlap) {
          this.raisePending = null;
          if (this.emitFrontRaiseRep([pending, done], f)) completed = true;
        } else {
          this.raisePending = null;
          if (this.emitFrontRaiseRep([pending], f, this.peerPeakFor(pending, this.raiseSides))) completed = true;
          this.raisePending = done;
        }
      } else this.raisePending = done;
      return completed;
    }
    /** Closes out a latched front-raise effort whose return never confirmed
     * because the NEXT effort's qualified peak superseded it (counting-
     * mechanism repair, 2026-11-09; investigation Lead 3b). The completion is
     * built from the latch and the stability evidence gathered up to the
     * descent's return-zone touch — the effort's own end — and arrives through
     * the same pending machinery as a return-confirmed completion, in order.
     * The cycle stays open for the superseding effort: its per-effort
     * stability evidence restarts here, so the superseded effort's peak and
     * descent samples cannot leak into the next rep's charge, while the
     * conservative whole-cycle flags (scoring, shift) keep accumulating and
     * the new effort's duration runs from the touch. */
    payOutRaiseLatch(s, now, f) {
      const cyc = this.raiseSides[s];
      if (cyc.peakStart === null || cyc.returnTouchAt === null) return false;
      const touchAt = cyc.returnTouchAt;
      const controlSamples = cyc.controlSamples.filter((v) => v.t <= touchAt), speedSpans = cyc.speedSpans.filter((sp) => sp.start <= touchAt);
      const done = { side: s, at: now, peakStart: cyc.peakStart, peakEnd: cyc.peakEnd, peakAmp: cyc.peakAmp, peakPosture: cyc.peakPosture, peakOther: cyc.peakOther, peakElbow: cyc.peakElbow, duration: (touchAt - (cyc.movingAt ?? cyc.peakStart)) / 1e3, scoring: cyc.scoring, control: sustainedPeak(controlSpans(controlSamples, touchAt), controlSamples.length ? Math.max(...controlSamples.map((v) => v.v)) : 0), shift: cyc.shiftMax, speed: sustainedPeak(speedSpans, speedSpans.length ? Math.max(...speedSpans.map((sp) => sp.v)) : 0), peakWindows: [{ start: cyc.peakStart, end: cyc.peakEnd }], cycleStart: cyc.movingAt ?? cyc.peakStart, returnedAt: touchAt };
      this.lastPeak[s] = { at: (done.peakStart + done.peakEnd) / 2, value: done.peakElbow };
      cyc.controlSamples = [];
      cyc.speedSpans = [];
      cyc.controlMax = 0;
      cyc.speedMax = 0;
      cyc.sampleAt = null;
      cyc.movingAt = touchAt;
      return this.arriveRaiseCompletion(done, f);
    }
    /** Front raises count per side, mirroring hammer curls: each arm independently runs
     * start (raised ≤25°) → peak (raised 65–115°, elbow ≥140°, that arm forward-dominant)
     * → return to start. Overlapping peaks merge into one synchronized rep; non-overlapping
     * count one per arm, so single-arm and alternating raises count — while a single-arm
     * LATERAL raise never satisfies the forward-dominance test and stays rejected.
     * Round 4: the peak's form conditions are judged by the peak-bound evidence
     * segment (evaluatePeakEvidence), an overshoot segment revokes an earned
     * latch, and short soft-interrupt holes preserve the open cycle. */
    updateFrontRaise(f, now) {
      const sides = f.raiseSides;
      let completed = false;
      if (this.raisePending && now - this.raisePending.at > 600) {
        const pending = this.raisePending;
        this.raisePending = null;
        if (this.emitFrontRaiseRep([pending], f, this.peerPeakFor(pending, this.raiseSides))) completed = true;
      }
      for (const s of [0, 1]) {
        const cyc = this.raiseSides[s], side = sides[s], other = sides[1 - s], v = side.raised;
        if (v > 25 || cyc.track.open || cyc.peakStart !== null) {
          cyc.samples.push({ t: now, raised: v, elbow: side.elbow, fwd: side.forward, lat: side.latDom });
          while (cyc.samples.length && cyc.samples[0].t < now - 4e3) cyc.samples.shift();
        }
        if (v > 25) {
          const chained = cyc.prevAt !== null && now - cyc.prevAt <= PEAK_GAP_MS;
          if (side.forward) {
            cyc.latRun = null;
            cyc.fwdRun = chained && cyc.fwdRun ? { start: cyc.fwdRun.start, last: now, n: cyc.fwdRun.n + 1 } : { start: now, last: now, n: 1 };
            if (!cyc.dirMixed && cyc.fwdRun.n >= 2 && cyc.fwdRun.last - cyc.fwdRun.start >= EVIDENCE_MIN_SPAN_MS) cyc.dirLatched = true;
          } else if (side.latDom) {
            cyc.fwdRun = null;
            cyc.latRun = chained && cyc.latRun ? { start: cyc.latRun.start, last: now, n: cyc.latRun.n + 1 } : { start: now, last: now, n: 1 };
            if (cyc.latRun.n >= 2 && cyc.latRun.last - cyc.latRun.start >= EVIDENCE_MIN_SPAN_MS) {
              if (cyc.dirLatched) cyc.dirTurned = true;
              cyc.dirLatched = false;
              cyc.dirMixed = true;
            }
          } else {
            cyc.fwdRun = null;
            cyc.latRun = null;
          }
        }
        const ev = feedPeakTrack(cyc.track, now, v - 65);
        if (ev.best) {
          cyc.peakPosture = f.posture;
          cyc.peakOther = other.raised;
        }
        if (ev.closed?.valid) {
          const ext = 65 + ev.closed.depth;
          cyc.peakWindows.push({ start: ev.closed.start, end: ev.closed.end });
          const verdict = evaluatePeakEvidence(cyc.samples, cyc.track.bestAt, 65 + cyc.track.best);
          cyc.evidence = verdict;
          this.diagnostics = { ...this.diagnostics, lastPeakEvidence: verdict };
          if (ext > 115) {
            cyc.overshoot = true;
            cyc.peakStart = null;
          } else if (!cyc.overshoot && verdict === "qualified") {
            if (cyc.peakStart !== null && cyc.returnTouched && this.payOutRaiseLatch(s, now, f)) completed = true;
            cyc.peakStart = ev.closed.start;
            cyc.peakEnd = ev.closed.end;
            cyc.peakElbow = ext;
            cyc.peakAmp = cap(ext / 90 * 100);
            cyc.returnTouched = false;
            cyc.returnTouchAt = null;
          }
        }
        const portion = cyc.prevAt === null ? { start: now, ms: 0 } : zonePortion(cyc.prevAngle, v, 25, false, cyc.prevAt, now);
        let replaced = false;
        if (cyc.peakStart !== null && portion.ms > 0) {
          if (!cyc.returnTouched) {
            cyc.returnTouched = true;
            cyc.returnTouchAt = portion.start;
          }
          if (cyc.returnSince === null || portion.start - cyc.returnSince > RETURN_WINDOW_MS2) {
            cyc.returnSince = portion.start;
            cyc.returnAccum = 0;
          }
          cyc.returnAccum += Math.min(RETURN_FRAME_CAP_MS2, portion.ms);
          if (cyc.returnAccum >= RETURN_HOLD_MS) {
            const done = { side: s, at: now, peakStart: cyc.peakStart, peakEnd: cyc.peakEnd, peakAmp: cyc.peakAmp, peakPosture: cyc.peakPosture, peakOther: cyc.peakOther, peakElbow: cyc.peakElbow, duration: (now - (cyc.movingAt ?? now)) / 1e3, scoring: cyc.scoring, control: sustainedPeak(controlSpans(cyc.controlSamples, now), cyc.controlMax), shift: cyc.shiftMax, speed: sustainedPeak(cyc.speedSpans, cyc.speedMax), peakWindows: cyc.peakWindows, cycleStart: cyc.movingAt ?? cyc.peakStart, returnedAt: cyc.returnSince ?? now };
            this.lastPeak[s] = { at: (done.peakStart + done.peakEnd) / 2, value: done.peakElbow };
            this.raiseSides[s] = freshSideCycle();
            replaced = true;
            if (this.arriveRaiseCompletion(done, f)) completed = true;
          }
        }
        if (!replaced) {
          if (v <= 25) {
            if (cyc.peakStart === null && cyc.movingAt !== null) {
              this.raiseSides[s] = freshSideCycle();
              replaced = true;
            }
          } else {
            if (cyc.movingAt === null) cyc.movingAt = now;
            cyc.scoring = cyc.scoring && f.scorable;
            const control = Math.max(0, 170 - side.elbow) * 1.5;
            cyc.controlMax = Math.max(cyc.controlMax, control);
            cyc.controlSamples.push({ t: now, v: control });
            cyc.shiftMax = Math.max(cyc.shiftMax, Math.abs(f.tilt - this.baseline.tilt));
            if (cyc.sampleAt === null) {
              cyc.sampleAt = now;
              cyc.sampleAngle = v;
            } else if (now - cyc.sampleAt >= 100) {
              const w = Math.abs(v - cyc.sampleAngle) * 1e3 / (now - cyc.sampleAt);
              cyc.speedMax = Math.max(cyc.speedMax, w);
              cyc.speedSpans.push({ start: cyc.sampleAt, end: now, v: w });
              cyc.sampleAt = now;
              cyc.sampleAngle = v;
            }
          }
        }
        const cur = this.raiseSides[s];
        cur.prevAt = now;
        cur.prevAngle = v;
        if (replaced) {
          cur.track.prevAt = now;
          cur.track.prevDepth = v - 65;
        }
        if (v <= 25) {
          cur.fwdRun = null;
          cur.latRun = null;
        }
      }
      const anyPeak = this.raiseSides.some((c) => c.peakStart !== null || c.track.open) || this.raisePending !== null;
      const stage = this.metrics.reps >= this.metrics.targetReps ? "complete" : anyPeak ? f.start ? "returning" : "peak" : f.start ? "ready" : "moving";
      const copy = definitions[this.type].stages;
      const nearPeak = stage === "moving" && sides.every((s) => s.raised < 65) && sides.some((s) => s.raised >= 45);
      const blocker = this.frontRaiseBlocker(sides);
      const message = stage === "complete" ? "\u76EE\u6807\u5B8C\u6210\u5566\uFF0C\u6F02\u4EAE" : completed ? this.metrics.feedback : blocker || (nearPeak ? "\u63A5\u8FD1\u5566\uFF0C\u518D\u5F80\u4E0A\u5E26\u4E00\u70B9\u70B9\uFF0C\u5230\u80A9\u8180\u9AD8\u518D\u653E\u56DE" : copy[stage === "ready" ? 0 : stage === "moving" ? 1 : stage === "peak" ? 2 : 3] + (stage === "moving" ? " \xB7 \u7EE7\u7EED\uFF0C\u4FDD\u6301\u4F4F" : ""));
      const issue = null;
      this.diagnostics = { ...this.diagnostics, stage };
      this.metrics = { ...this.metrics, phase: f.start ? "standing" : anyPeak ? "ascending" : "descending", feedback: completed ? this.metrics.feedback : message, poseFeedback: { status: !f.scorable ? "uncertain" : issue ? "adjust" : "stable", confidence: f.confidence, issues: issue ? [issue] : [], primaryIssue: issue, affectedJoints: issue ? poseIssueCopy(issue, this.type).joints : [], calibrated: true, message: blocker || (issue ? poseIssueCopy(issue, this.type).action : message) } };
      return this.metrics;
    }
    /** The gate actually blocking the front-raise rep right now, named in the
     * live hint (round 4). Judges the more-raised arm that has not yet latched a
     * peak; returns undefined when nothing is blocking, letting the near-peak
     * encouragement or the stage copy speak. Replaces the measure() aggregate
     * hint in this updater: that hint required BOTH arms forward, so it fired
     * throughout correct single-arm raises and said nothing about which gate —
     * overshoot, a turn to the side, a bent elbow, or direction — was binding. */
    frontRaiseBlocker(sides) {
      let active = -1, top = -Infinity;
      for (const s of [0, 1]) if (this.raiseSides[s].peakStart === null && sides[s].raised > 25 && sides[s].raised > top) {
        top = sides[s].raised;
        active = s;
      }
      if (active < 0) return void 0;
      const side = sides[active], cyc = this.raiseSides[active];
      if (side.raised > 115 || cyc.overshoot) return COPY_RAISE_OVERSHOOT;
      if (cyc.dirTurned) return COPY_RAISE_TURNED;
      if (side.forward && side.raised >= 45 && side.elbow < EVIDENCE_CLEAR_BENT_DEG) return COPY_RAISE_ELBOW;
      if (!side.forward && !cyc.dirLatched) {
        if (side.raised > DIRECTION_DEAD_ZONE_DEG) return COPY_RAISE_DIRECTION;
        return COPY_RAISE_DEAD_ZONE;
      }
      return void 0;
    }
    update(raw, now, aspect = 1, world = null) {
      if (!raw || raw.length !== 33 || !Number.isFinite(now) || !Number.isFinite(aspect) || aspect <= 0 || raw.some((p) => !p || ![p.x, p.y, p.visibility ?? 0].every(Number.isFinite))) return this.softInterrupt("\u672A\u68C0\u6D4B\u5230\u5B8C\u6574\u4EBA\u4F53\u5173\u952E\u70B9", now, notSeenCopyFor(this.type));
      if (this.last !== null && now <= this.last) return this.metrics;
      if (this.last !== null && now - this.last > 750) {
        if (this.freezeBridged) this.freezeBridged = false;
        else this.softInterrupt("\u753B\u9762\u4E2D\u65AD", now, COPY_HALF_REP);
      }
      const required = this.needed(raw);
      if (required.some((i) => (raw[i].visibility ?? 0) < 0.25 || raw[i].x < 0 || raw[i].x > 1 || raw[i].y < 0 || raw[i].y > 1)) return this.softInterrupt("\u5FC5\u8981\u5173\u8282\u79BB\u5F00\u753B\u9762\u6216\u88AB\u906E\u6321", now, COPY_OUT_OF_FRAME);
      this.frames = [...this.frames, raw].slice(-(this.prefiltered ? 1 : 5));
      const smooth = medianLandmarks(this.frames);
      const smoothGate = this.type === "front_raise" ? required.filter((i) => i !== 23 && i !== 24) : required;
      if (smoothGate.some((i) => (smooth[i].visibility ?? 0) < 0.55)) return this.softInterrupt("\u5FC5\u8981\u5173\u8282\u6301\u7EED\u4E0D\u6E05\u6670", now, "\u6211\u6709\u70B9\u770B\u4E0D\u6E05\u2014\u2014\u6362\u4E2A\u89D2\u5EA6\uFF0C\u8BA9\u6211\u770B\u6E05\u4F60");
      this.worlds = world?.length === 33 && world.every((p) => p && [p.x, p.y, p.z].every(Number.isFinite)) ? [...this.worlds, world].slice(-(this.prefiltered ? 1 : 5)) : [];
      const f = this.measure(smooth, aspect, this.worlds.length ? medianLandmarks(this.worlds) : null, required);
      if (typeof f === "string") return this.formInterrupt(f, now);
      this.unmeasurableSince = null;
      if (this.cannotAssess) {
        this.cannotAssess = false;
        this.metrics.axisAssessment = this.assessments();
      }
      const prevMeasuredAt = this.last;
      this.last = now;
      this.cycleHoleStart = null;
      this.times = [...this.times, now].filter((t) => now - t <= 2e3);
      this.diagnostics = { ...this.diagnostics, fps: this.times.length > 1 ? Math.round((this.times.length - 1) * 1e3 / (now - this.times[0])) : 0, confidence: f.confidence, side: f.side || null, angle: f.angle, basis: f.basis, motion: f.motion };
      if (!this.ready) {
        if (!f.start && this.lastStartAt !== null && now - this.lastStartAt > CALIBRATION_STALE_MS) {
          this.calibrationBank = 0;
          this.calibration = null;
        }
        if (f.start) this.lastStartAt = now;
        if (!f.start) {
          if (this.calibration !== null) {
            this.calibrationBank += now - this.calibration;
            this.calibration = null;
          }
          this.baseline = null;
        } else {
          if (this.calibration !== null && prevMeasuredAt !== null && now - prevMeasuredAt > SEGMENT_GAP_MS) {
            this.calibrationBank += prevMeasuredAt - this.calibration;
            this.calibration = now;
          }
          if (this.calibration === null) this.calibration = now;
          this.baseline = f;
          const segment = now - this.calibration;
          if ((!this.strictRearm || segment >= REARM_MIN_SEGMENT_MS) && (this.armOnStart || this.calibrationBank + segment >= 2e3)) this.ready = true;
        }
        const segmentNow = this.calibration === null ? 0 : now - this.calibration;
        let progress = this.ready ? 1 : Math.min(1, (this.calibrationBank + segmentNow) / 2e3);
        if (this.strictRearm && !this.ready) progress = this.armOnStart ? Math.min(1, segmentNow / REARM_MIN_SEGMENT_MS) : Math.min(progress, segmentNow / REARM_MIN_SEGMENT_MS);
        this.diagnostics = { ...this.diagnostics, stage: this.ready ? "ready" : "calibrating", calibrationProgress: progress };
        const calibHint = this.type === "front_raise" && !f.start && f.framing === "weak" ? COPY_FRAMING_WEAK : void 0;
        const message2 = this.ready ? COPY_CALIBRATED : f.start ? `\u5C31\u5FEB\u597D\u5566\uFF0C\u4FDD\u6301\u8D77\u59CB\u59FF\u52BF\uFF08${Math.round(progress * 100)}%\uFF09` : calibHint || (this.armOnStart ? "\u5148\u56DE\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u966A\u6211\u505C\u4E24\u79D2" : "\u56DE\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u966A\u6211\u505C\u4E24\u79D2");
        this.metrics = { ...this.metrics, feedback: message2, poseFeedback: { ...this.metrics.poseFeedback, status: "uncertain", calibrated: this.ready, confidence: f.confidence, message: message2 } };
        return this.metrics;
      }
      if (this.type === "hammer_curl") return this.updateHammerCurl(f, now);
      if (this.type === "front_raise") return this.updateFrontRaise(f, now);
      if (this.type === "one_arm_row") return this.updateOneArmRow(f, now);
      if (this.type === "mountain_climber") return this.updateMountainClimber(f, now);
      if (this.type === "split_squat") return this.updateSplitSquat(f, now);
      if (!f.start) {
        if (this.movingAt === null) {
          this.movingAt = now;
          if (this.type === "standing_leg_curl") this.cycleSide = f.side || null;
        }
        this.scoring = this.scoring && f.scorable;
        this.shift = Math.max(this.shift, Math.abs(f.tilt - this.baseline.tilt));
        this.controlPenalty = Math.max(this.controlPenalty, f.controlPenalty);
        this.controlSamples.push({ t: now, v: f.controlPenalty });
        if (this.controlAt === null) {
          this.controlAt = now;
          this.controlAngle = f.angle;
        } else if (now - this.controlAt >= 100) {
          const v = Math.abs(f.angle - this.controlAngle) * 1e3 / (now - this.controlAt);
          this.speed = Math.max(this.speed, v);
          this.speedSpans.push({ start: this.controlAt, end: now, v });
          this.controlAt = now;
          this.controlAngle = f.angle;
        }
      }
      if (f.start && !this.peak) this.movingAt = null;
      if (f.peak) {
        if (this.peakAt === null) this.peakAt = now;
        if (!this.peak || f.amplitude > this.peak.amplitude) this.peak = f;
      } else this.peakAt = null;
      let completed = false;
      if (this.peak && f.start) {
        if (this.returnAt === null) this.returnAt = now;
        if (this.retSince === null || now - this.retSince > RETURN_WINDOW_MS2) {
          this.retSince = now;
          this.retAccum = this.retPrevAt !== null ? Math.min(RETURN_FRAME_CAP_MS2, now - this.retPrevAt) / 2 : 0;
        } else if (this.retPrevAt !== null) this.retAccum += Math.min(RETURN_FRAME_CAP_MS2, now - this.retPrevAt);
        this.retPrevAt = now;
        if (this.retAccum >= RETURN_HOLD_MS) {
          if (this.returnAt - (this.movingAt ?? this.returnAt) < MIN_EXCURSION_MS2) {
            this.resetCycle();
          } else if (this.metrics.reps < this.metrics.targetReps) {
            const acc = { ...this.metrics.scoreAccumulator }, duration = (now - (this.movingAt ?? now)) / 1e3;
            if (this.type === "standing_leg_curl") {
              const key = this.peak.side === "left" ? "leftReps" : "rightReps";
              acc[key] = (acc[key] || 0) + 1;
            }
            const sustainedSpeed = sustainedPeak(this.speedSpans, this.speed), sustainedControl = sustainedPeak(controlSpans(this.controlSamples, now), this.controlPenalty);
            const breakdown = { depth: this.peak.amplitude, stability: cap(100 - Math.max(0, sustainedSpeed - 260) * 0.08 - Math.max(0, 0.6 - duration) * 70 - sustainedControl), trunk: cap(this.peak.posture - (this.type === "romanian_deadlift" || this.type === "glute_bridge" || this.type === "barbell_deadlift" ? 0 : this.shift * 1.5)), symmetry: this.peak.symmetry };
            const singleSide = SINGLE_SIDE_TYPES.has(this.type);
            const score = singleSide ? Math.round((breakdown.depth * 0.35 + breakdown.stability * 0.25 + breakdown.trunk * 0.2) / 0.8) : Math.round(breakdown.depth * 0.35 + breakdown.stability * 0.25 + breakdown.trunk * 0.2 + breakdown.symmetry * 0.2), scored = this.scoring && f.scorable, issues = [];
            const stabilityIssue = breakdown.stability < 70 && (!CONTROL_SUSPENDED_TYPES.has(this.type) || stabilityWithoutControl(sustainedSpeed, duration) < 70);
            if (breakdown.depth < 70) issues.push("insufficient_range");
            if (stabilityIssue) issues.push("unstable_movement");
            if (breakdown.trunk < 70) issues.push("body_alignment");
            if (!singleSide && breakdown.symmetry < 70) issues.push("poor_coordination");
            const counts = { ...this.metrics.correctionCounts };
            if (scored) {
              acc.count++;
              acc.total += score;
              axes2.forEach((k) => {
                if (singleSide && k === "symmetry") return;
                acc[k] += breakdown[k];
              });
              issues.forEach((k) => counts[k]++);
            }
            const withheld = scored && totalWithheld(this.assessmentsFor(acc));
            this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, lastRepScore: scored ? score : null, scoreAccumulator: acc, perfectReps: this.metrics.perfectReps + (scored && score >= 90 ? 1 : 0), formScore: acc.count ? Math.round(acc.total / acc.count) : 0, correctionCounts: counts, lastRepIssues: scored ? issues : [], feedback: scored ? withheld ? `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u672C\u6B21 ${score} \u5206` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u8FD9\u6B21\u6CA1\u770B\u6E05\uFF0C\u4E0D\u8BC4\u5206` };
            this.updateAverage();
            completed = true;
          }
          this.resetCycle();
        }
      } else {
        this.returnAt = null;
        if (this.peak) this.retPrevAt = now;
      }
      const stage = this.metrics.reps >= this.metrics.targetReps ? "complete" : this.peak ? f.start ? "returning" : "peak" : f.start ? "ready" : "moving";
      const copy = definitions[this.type].stages, message = stage === "complete" ? "\u76EE\u6807\u5B8C\u6210\u5566\uFF0C\u6F02\u4EAE" : f.hint || copy[stage === "ready" ? 0 : stage === "moving" ? 1 : stage === "peak" ? 2 : 3] + (stage === "moving" ? " \xB7 \u7EE7\u7EED\uFF0C\u4FDD\u6301\u4F4F" : "");
      const issue = f.controlPenalty > 30 && !CONTROL_SUSPENDED_TYPES.has(this.type) ? "unstable_movement" : f.posture < 70 ? "body_alignment" : !SINGLE_SIDE_TYPES.has(this.type) && f.symmetry < 70 ? "poor_coordination" : null;
      this.diagnostics = { ...this.diagnostics, stage };
      this.metrics = { ...this.metrics, phase: f.start ? "standing" : this.peak ? "ascending" : "descending", feedback: completed ? this.metrics.feedback : message, poseFeedback: { status: !f.scorable ? "uncertain" : issue ? "adjust" : "stable", confidence: f.confidence, issues: issue ? [issue] : [], primaryIssue: issue, affectedJoints: issue ? poseIssueCopy(issue, this.type).joints : [], calibrated: true, message: f.hint || (issue ? poseIssueCopy(issue, this.type).action : message) } };
      this.previous = f;
      return this.metrics;
    }
  };

  // src/features/gym/planRecognition.ts
  var PLAN_PROFILES = ["biceps_curl", "lateral_raise", "shoulder_press", "bent_over_row", "reverse_lunge", "calf_raise", "seated_calf_raise"];
  var isNewPlanProfile = (value) => PLAN_PROFILES.includes(value);
  var axes3 = ["depth", "stability", "trunk", "symmetry"];
  var RETURN_HOLD_MS2 = 150;
  var RETURN_WINDOW_MS3 = 500;
  var RETURN_FRAME_CAP_MS3 = 100;
  var MIN_EXCURSION_MS3 = 250;
  var zero = () => ({ depth: 0, stability: 0, trunk: 0, symmetry: 0 });
  var average = (acc) => ({ depth: Math.round(acc.depth / acc.count), stability: Math.round(acc.stability / acc.count), trunk: Math.round(acc.trunk / acc.count), symmetry: Math.round(acc.symmetry / acc.count) });
  var clamp3 = (v) => Math.max(0, Math.min(100, v));
  var mean3 = (a, b) => (a + b) / 2;
  var mid = (a, b) => ({ x: mean3(a.x, b.x), y: mean3(a.y, b.y), z: mean3(a.z || 0, b.z || 0), visibility: Math.min(a.visibility ?? 0, b.visibility ?? 0) });
  var distance3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  var angle4 = (a, b, c) => {
    const u = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)], v = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
    return Math.acos(Math.max(-1, Math.min(1, u.reduce((n, x, i) => n + x * v[i], 0) / (Math.hypot(...u) * Math.hypot(...v) || 1e-8)))) * 180 / Math.PI;
  };
  var PLAN_STAGE_COPY = {
    biceps_curl: ["\u4F38\u81C2\u5C31\u7EEA", "\u53CC\u81C2\u5F2F\u4E3E\u4E2D", "\u6F02\u4EAE\uFF0C\u5C31\u662F\u8FD9\u4E2A\u9AD8\u5EA6\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"],
    lateral_raise: ["\u5782\u81C2\u5C31\u7EEA", "\u53CC\u81C2\u4FA7\u4E3E\u4E2D", "\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"],
    shoulder_press: ["\u80A9\u90E8\u8D77\u59CB\u4F4D\u5C31\u7EEA", "\u63A8\u4E3E\u4E2D", "\u63A8\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u56DE", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"],
    bent_over_row: ["\u4FEF\u8EAB\u5782\u81C2\u5C31\u7EEA", "\u53CC\u81C2\u62C9\u8D77\u4E2D", "\u62C9\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u653E\u4E0B\u6765", "\u597D\uFF0C\u653E\u56DE\u5566\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"],
    reverse_lunge: ["\u5E76\u811A\u7AD9\u7ACB\u5C31\u7EEA", "\u540E\u64A4\u4E0B\u6C89\u4E2D", "\u5230\u4F4D\u5566\u2014\u2014\u56DE\u5230\u7AD9\u7ACB", "\u597D\uFF0C\u7AD9\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"],
    calf_raise: ["\u811A\u8DDF\u843D\u5730\u5C31\u7EEA", "\u63D0\u8E35\u4E2D", "\u63D0\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u843D\u8DDF", "\u597D\uFF0C\u843D\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"],
    seated_calf_raise: ["\u811A\u8DDF\u843D\u5730\u5C31\u7EEA", "\u63D0\u8E35\u4E2D", "\u63D0\u5230\u4F4D\u5566\u2014\u2014\u6162\u6162\u843D\u8DDF", "\u597D\uFF0C\u843D\u7A33\uFF0C\u6211\u786E\u8BA4\u4E00\u4E0B"]
  };
  var needed = (type) => type === "calf_raise" || type === "seated_calf_raise" ? [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32] : type === "reverse_lunge" ? [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32] : type === "bent_over_row" ? [11, 12, 13, 14, 15, 16, 23, 24, 25, 26] : [11, 12, 13, 14, 15, 16, 23, 24];
  var PlanExerciseTracker = class {
    constructor(type, targetReps = 20, restored = {}, prefiltered = false, armOnStart = false) {
      this.type = type;
      this.prefiltered = prefiltered;
      this.armOnStart = armOnStart;
      const acc = { ...zero(), count: 0, total: 0, ...restored.scoreAccumulator };
      this.metrics = { ...restored, reps: Math.max(0, restored.reps || 0), targetReps, formScore: acc.count ? Math.round(acc.total / acc.count) : 0, perfectReps: restored.perfectReps || 0, feedback: "\u7AD9\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u966A\u6211\u505C\u4E24\u79D2", phase: "standing", scoreAccumulator: acc, formBreakdown: acc.count ? average(acc) : zero(), correctionCounts: { out_of_frame: 0, insufficient_depth: 0, knee_instability: 0, excessive_trunk_lean: 0, asymmetry: 0, insufficient_range: 0, unstable_movement: 0, body_alignment: 0, poor_coordination: 0, ...restored.correctionCounts }, lastRepIssues: [], repeatedIssue: null, poseFeedback: { status: "uncertain", confidence: 0, issues: [], primaryIssue: null, affectedJoints: [], calibrated: false, message: "\u6211\u5728\u7B49\u4F60\u7AD9\u597D" } };
    }
    metrics;
    diagnostics = { fps: 0, confidence: 0, side: null, angle: null, stage: "calibrating", calibrationProgress: 0, pairedSides: [], lastResetReason: null };
    frames = [];
    worldFrames = [];
    at = null;
    calibration = null;
    baseline = null;
    calibrated = false;
    times = [];
    peakSince = null;
    peak = null;
    returnSince = null;
    retAnchor = null;
    retAccum = 0;
    retPrevAt = null;
    movementSince = null;
    scoring = true;
    freezeBridged = false;
    maxTrunkShift = 0;
    previous = null;
    maxStep = 0;
    controlAt = null;
    controlAngle = 0;
    issues = /* @__PURE__ */ new Set();
    requiredIndices(raw) {
      return needed(this.type);
    }
    interrupt(reason = "\u5148\u505C\u4E00\u4E0B\uFF0C\u7EE7\u7EED\u65F6\u91CD\u65B0\u6821\u51C6", feedback = reason) {
      this.frames = [];
      this.worldFrames = [];
      this.at = null;
      this.calibration = null;
      this.baseline = null;
      this.calibrated = false;
      this.times = [];
      this.resetCycle();
      this.previous = null;
      this.freezeBridged = false;
      this.diagnostics = { ...this.diagnostics, fps: 0, confidence: 0, stage: "tracking_lost", calibrationProgress: 0, lastResetReason: reason };
      this.metrics = { ...this.metrics, phase: "standing", feedback, poseFeedback: { ...this.metrics.poseFeedback, status: "uncertain", calibrated: false, message: feedback } };
      return this.metrics;
    }
    /** The adaptive wrapper deliberately held frames back (a ladder step-down
     * swapping the pose model — see AdaptiveRecognition.carryToRun); the next
     * frame gap is therefore known-benign and must not be read as a tracking
     * loss. Only arms when the pending gap actually exceeds the guard. Mirrors
     * ExtendedExerciseTracker.bridgeFreezeGap. */
    bridgeFreezeGap(now) {
      if (this.at !== null && now - this.at > 750) this.freezeBridged = true;
    }
    resetCycle() {
      this.peakSince = null;
      this.peak = null;
      this.returnSince = null;
      this.retAnchor = null;
      this.retAccum = 0;
      this.retPrevAt = null;
      this.movementSince = null;
      this.scoring = true;
      this.maxTrunkShift = 0;
      this.maxStep = 0;
      this.controlAt = null;
      this.issues.clear();
    }
    sample(raw, aspect, world) {
      const p = raw.map((v) => ({ ...v, x: v.x * aspect, z: 0 }));
      const a = world?.length === raw.length && world.every((v) => v && [v.x, v.y, v.z].every(Number.isFinite)) ? world : p;
      const hip = mid(p[23], p[24]), shoulder = mid(p[11], p[12]), torso = Math.max(0.02, distance3(hip, shoulder));
      const elbows = [angle4(a[11], a[13], a[15]), angle4(a[12], a[14], a[16])], knee = [angle4(a[23], a[25], a[27]), angle4(a[24], a[26], a[28])];
      const tilt = Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(shoulder.y - hip.y)) * 180 / Math.PI;
      const confidence = Math.min(...needed(this.type).map((i) => raw[i].visibility ?? 0));
      const footScale = Math.max(0.015, mean3(distance3(p[29], p[31]), distance3(p[30], p[32])));
      const heels = [(p[29].y - p[31].y) / footScale, (p[30].y - p[32].y) / footScale];
      const forward = { x: mean3(p[31].x - p[29].x, p[32].x - p[30].x), y: 0, z: 0, visibility: 1 };
      let start = false, peak = false, amplitude = 0, symmetry = 100, posture = clamp3(100 - Math.max(0, tilt - 12) * 2), measured = mean3(...elbows), basis = "", motion = "", side;
      if (this.type === "biceps_curl") {
        start = Math.min(...elbows) >= 145;
        peak = Math.max(...elbows) <= 80;
        amplitude = clamp3((160 - Math.max(...elbows)) / 95 * 100);
        symmetry = clamp3(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        basis = "\u53CC\u8098\u5C48\u4F38";
        motion = `\u8098\u89D2 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u5F2F\u4E3E \u226480\xB0\uFF0C\u653E\u56DE \u2265145\xB0`;
      } else if (this.type === "lateral_raise") {
        const raised = [angle4(a[13], a[11], a[23]), angle4(a[14], a[12], a[24])];
        measured = mean3(raised[0], raised[1]);
        start = Math.max(...raised) <= 25;
        peak = Math.min(...raised) >= 65 && Math.max(...raised) <= 120;
        amplitude = clamp3(Math.min(...raised) / 90 * 100);
        symmetry = clamp3(100 - Math.abs(raised[0] - raised[1]) * 1.5);
        basis = "\u53CC\u4E0A\u81C2\u76F8\u5BF9\u8EAF\u5E72\u62AC\u4E3E";
        motion = `\u62AC\u4E3E ${Math.round(raised[0])}\xB0 / ${Math.round(raised[1])}\xB0\uFF1B\u4FA7\u4E3E \u226565\xB0\uFF0C\u653E\u56DE \u226425\xB0`;
      } else if (this.type === "shoulder_press") {
        const hands = [(p[11].y - p[15].y) / torso, (p[12].y - p[16].y) / torso];
        start = Math.max(...elbows) <= 125 && Math.min(...elbows) >= 55 && Math.min(...hands) >= -0.1 && Math.max(...hands) < 0.8;
        peak = Math.min(...elbows) >= 150 && Math.min(...hands) >= 0.5;
        amplitude = clamp3((Math.min(...elbows) - 85) / 80 * 100);
        symmetry = clamp3(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        basis = "\u53CC\u8098\u4F38\u5C55\uFF0B\u53CC\u624B\u8D85\u8FC7\u80A9\u90E8";
        motion = `\u8098\u89D2 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u63A8\u8D77 \u2265150\xB0`;
      } else if (this.type === "bent_over_row") {
        if (tilt < 25 || tilt > 85) return null;
        start = Math.min(...elbows) >= 145;
        peak = Math.max(...elbows) <= 100;
        amplitude = clamp3((160 - Math.max(...elbows)) / 90 * 100);
        symmetry = clamp3(100 - Math.abs(elbows[0] - elbows[1]) * 1.5);
        posture = this.baseline ? clamp3(100 - Math.abs(tilt - this.baseline.tilt) * 3) : 100;
        basis = "\u4FEF\u8EAB\u59FF\u52BF\uFF0B\u53CC\u8098\u5C48\u4F38";
        motion = `\u8098\u89D2 ${Math.round(elbows[0])}\xB0 / ${Math.round(elbows[1])}\xB0\uFF1B\u62C9\u8D77 \u2264100\xB0`;
      } else if (this.type === "reverse_lunge") {
        const b = this.baseline, leg = Math.max(0.04, mean3(distance3(p[23], p[27]), distance3(p[24], p[28]))), direction = b ? Math.sign(b.forward.x) : Math.sign(forward.x);
        if (Math.abs((b || { forward }).forward.x) < torso * 0.035) return null;
        const retreat = b ? [27, 28].map((i) => -direction * (p[i].x - hip.x - (b.points[i].x - b.hip.x)) / leg) : [0, 0];
        side = retreat[0] >= retreat[1] ? "left" : "right";
        start = Math.min(...knee) >= 150 && Math.max(...retreat) < 0.15;
        peak = !!b && Math.max(...retreat) >= 0.22 && Math.min(...knee) <= 125;
        measured = Math.min(...knee);
        amplitude = clamp3((165 - measured) / 75 * 100);
        symmetry = clamp3(100 - Math.abs(p[11].y - p[12].y) / torso * 160);
        basis = "\u540E\u64A4\u811A\u4F4D\u79FB\uFF0B\u5C48\u819D\uFF0C\u518D\u8FD4\u56DE\u8D77\u59CB\u811A\u4F4D";
        motion = `${side === "left" ? "\u5DE6" : "\u53F3"}\u4FA7\u540E\u64A4 ${Math.round(Math.max(...retreat) * 100)}% \u817F\u957F\uFF0C\u819D\u89D2 ${Math.round(measured)}\xB0`;
      } else {
        if (footScale < torso * 0.06 || (this.type === "seated_calf_raise" ? Math.min(...knee) < 60 || Math.max(...knee) > 130 : Math.min(...knee) < 150)) return null;
        const b = this.baseline, raise = b ? heels.map((v, i) => b.heels[i] - v) : [0, 0];
        if (b && [31, 32].some((i) => distance3(p[i], b.points[i]) > b.footScale * 0.4)) return null;
        start = Math.max(...raise) <= 0.07;
        peak = !!b && Math.min(...raise) >= 0.16;
        amplitude = clamp3(Math.min(...raise) / 0.3 * 100);
        symmetry = clamp3(100 - Math.abs(raise[0] - raise[1]) * 180);
        measured = mean3(raise[0], raise[1]) * 100;
        basis = "\u811A\u8DDF\u76F8\u5BF9\u524D\u811A\u638C\u4E0A\u5347\uFF1B\u524D\u811A\u638C\u4FDD\u6301\u539F\u4F4D";
        motion = `\u53CC\u811A\u63D0\u8E35 ${Math.round(raise[0] * 100)}% / ${Math.round(raise[1] * 100)}% \u811A\u957F\uFF1B\u76EE\u6807 \u226516%`;
      }
      return { start, peak, amplitude, symmetry, posture, confidence, side, angle: measured, basis, motion, hip, torso, tilt, points: p, footScale, heels, forward };
    }
    update(raw, now, aspect = 1, world = null) {
      if (!raw || raw.length < 33 || !Number.isFinite(now) || !Number.isFinite(aspect) || aspect <= 0 || raw.some((p) => !p || ![p.x, p.y, p.visibility ?? 0].every(Number.isFinite))) return this.interrupt("\u672A\u68C0\u6D4B\u5230\u5B8C\u6574\u4EBA\u4F53\u5173\u952E\u70B9", notSeenCopyFor(this.type));
      if (this.at !== null && now <= this.at) return this.metrics;
      if (this.at !== null && now - this.at > 750) {
        if (this.freezeBridged) this.freezeBridged = false;
        else this.interrupt("\u753B\u9762\u4E2D\u65AD", COPY_HALF_REP);
      }
      const indices = needed(this.type);
      if (indices.some((i) => (raw[i].visibility ?? 0) < 0.25 || raw[i].x < 0 || raw[i].x > 1 || raw[i].y < 0 || raw[i].y > 1)) return this.interrupt("\u6240\u9700\u5173\u8282\u79BB\u5F00\u753B\u9762\u6216\u88AB\u906E\u6321", COPY_OUT_OF_FRAME);
      this.frames = [...this.frames, raw].slice(-(this.prefiltered ? 1 : 5));
      const points = medianLandmarks(this.frames);
      if (indices.some((i) => (points[i].visibility ?? 0) < 0.55)) return this.interrupt("\u5173\u952E\u5173\u8282\u6301\u7EED\u4E0D\u6E05\u6670", "\u6211\u6709\u70B9\u770B\u4E0D\u6E05\u2014\u2014\u6362\u4E2A\u89D2\u5EA6\uFF0C\u8BA9\u6211\u770B\u6E05\u4F60");
      this.worldFrames = world?.length === raw.length && world.every((p) => p && [p.x, p.y, p.z].every(Number.isFinite)) ? [...this.worldFrames, world].slice(-(this.prefiltered ? 1 : 5)) : [];
      const smoothedWorld = this.worldFrames.length && indices.every((i) => (raw[i].visibility ?? 0) >= 0.7) ? medianLandmarks(this.worldFrames) : null;
      const f = this.sample(points, aspect, smoothedWorld);
      if (!f) return this.interrupt(this.type === "calf_raise" ? "\u8BF7\u8BA9\u53CC\u811A\u8DDF\u548C\u524D\u811A\u638C\u6E05\u6670\u53EF\u89C1\uFF0C\u4FDD\u6301\u524D\u811A\u638C\u539F\u4F4D\u548C\u819D\u76D6\u4F38\u76F4" : this.type === "seated_calf_raise" ? "\u8BF7\u5750\u7A33\u3001\u53CC\u819D\u5F2F\u66F2\uFF0C\u8BA9\u53CC\u811A\u8DDF\u548C\u524D\u811A\u638C\u6E05\u6670\u53EF\u89C1\uFF0C\u4FDD\u6301\u524D\u811A\u638C\u539F\u4F4D" : this.type === "reverse_lunge" ? "\u8BF7\u659C\u4FA7\u9762\u62CD\u6444\uFF0C\u8BA9\u811A\u5C16\u65B9\u5411\u53CA\u540E\u64A4\u811A\u4F4D\u6E05\u6670\u53EF\u89C1" : "\u8BF7\u4FDD\u6301\u659C\u4FA7\u9762\u4FEF\u8EAB\u59FF\u52BF\uFF0C\u8BA9\u53CC\u81C2\u6E05\u6670\u53EF\u89C1");
      const dt = this.at === null ? 0 : now - this.at;
      this.at = now;
      this.times = [...this.times, now].filter((t) => now - t <= 2e3);
      this.diagnostics = { ...this.diagnostics, fps: this.times.length > 1 ? Math.round((this.times.length - 1) * 1e3 / (now - this.times[0])) : 0, confidence: f.confidence, angle: f.angle, side: f.side || null, basis: f.basis, motion: f.motion };
      if (!this.calibrated) {
        if (!f.start) {
          this.calibration = null;
          this.baseline = null;
        } else {
          if (this.calibration === null) this.calibration = now;
          this.baseline = f;
          if (this.armOnStart || now - this.calibration >= 2e3) this.calibrated = true;
        }
        const progress = this.calibrated ? 1 : this.calibration === null ? 0 : Math.min(1, (now - this.calibration) / 2e3);
        this.diagnostics = { ...this.diagnostics, stage: this.calibrated ? "ready" : "calibrating", calibrationProgress: progress };
        this.metrics = { ...this.metrics, feedback: this.calibrated ? COPY_CALIBRATED : f.start ? `\u5C31\u5FEB\u597D\u5566\uFF0C\u4FDD\u6301\u8D77\u59CB\u59FF\u52BF\uFF08${Math.round(progress * 100)}%\uFF09` : "\u5148\u56DE\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u966A\u6211\u505C\u4E24\u79D2", poseFeedback: { ...this.metrics.poseFeedback, calibrated: this.calibrated, confidence: f.confidence, status: "uncertain" } };
        this.previous = f;
        return this.metrics;
      }
      if (!f.start) {
        if (this.movementSince === null) this.movementSince = now;
        this.scoring = this.scoring && f.confidence >= 0.7;
        this.maxTrunkShift = Math.max(this.maxTrunkShift, Math.abs(f.tilt - this.baseline.tilt));
        if (this.controlAt === null) {
          this.controlAt = now;
          this.controlAngle = f.angle;
        } else if (now - this.controlAt >= 100) {
          this.maxStep = Math.max(this.maxStep, Math.abs(f.angle - this.controlAngle) / ((now - this.controlAt) / 1e3));
          this.controlAt = now;
          this.controlAngle = f.angle;
        }
        if (f.posture < 70) this.issues.add("body_alignment");
        if (f.symmetry < 70) this.issues.add("poor_coordination");
      }
      if (f.start && !this.peak) this.movementSince = null;
      if (f.peak) {
        if (this.peakSince === null) this.peakSince = now;
        if (!this.peak || f.amplitude > this.peak.amplitude) this.peak = f;
      } else this.peakSince = null;
      let completed = false;
      if (this.peak && f.start) {
        if (this.returnSince === null) this.returnSince = now;
        if (this.retAnchor === null || now - this.retAnchor > RETURN_WINDOW_MS3) {
          this.retAnchor = now;
          this.retAccum = this.retPrevAt !== null ? Math.min(RETURN_FRAME_CAP_MS3, now - this.retPrevAt) / 2 : 0;
        } else if (this.retPrevAt !== null) this.retAccum += Math.min(RETURN_FRAME_CAP_MS3, now - this.retPrevAt);
        this.retPrevAt = now;
        if (this.retAccum >= RETURN_HOLD_MS2) {
          if (this.returnSince - (this.movementSince ?? this.returnSince) < MIN_EXCURSION_MS3) {
            this.resetCycle();
          } else if (this.metrics.reps < this.metrics.targetReps) {
            const peak = this.peak, acc = { ...this.metrics.scoreAccumulator }, counts = { ...this.metrics.correctionCounts };
            if (this.type === "reverse_lunge") {
              const k = peak.side === "left" ? "leftReps" : "rightReps";
              acc[k] = (acc[k] || 0) + 1;
            }
            const duration = (now - (this.movementSince ?? now)) / 1e3;
            const breakdown = { depth: peak.amplitude, stability: clamp3(100 - Math.max(0, this.maxStep - 260) * 0.08 - Math.max(0, 0.6 - duration) * 70), trunk: clamp3(peak.posture - this.maxTrunkShift * 1.5), symmetry: peak.symmetry };
            if (breakdown.stability < 70) this.issues.add("unstable_movement");
            if (breakdown.depth < 70) this.issues.add("insufficient_range");
            const score = Math.round(breakdown.depth * 0.35 + breakdown.stability * 0.25 + breakdown.trunk * 0.2 + breakdown.symmetry * 0.2), repIssues = [...this.issues];
            const scored = this.scoring && f.confidence >= 0.7;
            if (scored) {
              acc.count++;
              acc.total += score;
              axes3.forEach((k) => acc[k] += breakdown[k]);
              repIssues.forEach((k) => counts[k]++);
            }
            this.metrics = { ...this.metrics, reps: this.metrics.reps + 1, lastRepScore: scored ? score : null, scoreAccumulator: acc, formScore: acc.count ? Math.round(acc.total / acc.count) : 0, formBreakdown: acc.count ? average(acc) : zero(), perfectReps: this.metrics.perfectReps + (scored && score >= 90 ? 1 : 0), correctionCounts: counts, lastRepIssues: scored ? repIssues : [], feedback: scored ? `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u672C\u6B21 ${score} \u5206` : `\u597D\uFF0C\u7B2C ${this.metrics.reps + 1} \u6B21\u8BB0\u4E0B\u5566 \xB7 \u8FD9\u6B21\u6CA1\u770B\u6E05\uFF0C\u4E0D\u8BC4\u5206` };
            completed = true;
          }
          this.resetCycle();
        }
      } else {
        this.returnSince = null;
        if (this.peak) this.retPrevAt = now;
      }
      const stage = this.metrics.reps >= this.metrics.targetReps ? "complete" : this.peak ? f.start ? "returning" : "peak" : f.start ? "ready" : f.peak ? "peak" : "moving";
      this.diagnostics = { ...this.diagnostics, stage, calibrationProgress: 1 };
      const issue = [...this.issues][0] || null;
      const message = stage === "complete" ? "\u76EE\u6807\u5B8C\u6210\u5566\uFF0C\u6F02\u4EAE" : PLAN_STAGE_COPY[this.type][stage === "ready" ? 0 : stage === "moving" ? 1 : stage === "peak" ? 2 : 3];
      this.metrics = { ...this.metrics, phase: f.start ? "standing" : this.peak ? "ascending" : "descending", feedback: completed ? this.metrics.feedback : message, poseFeedback: { status: f.confidence < 0.7 ? "uncertain" : issue ? "adjust" : "stable", confidence: f.confidence, issues: issue ? [issue] : [], primaryIssue: issue, affectedJoints: issue ? poseIssueCopy(issue, this.type).joints : [], calibrated: true, message: issue ? poseIssueCopy(issue, this.type).action : message } };
      this.previous = f;
      return this.metrics;
    }
  };

  // src/features/motion/lib/recognition.ts
  function createRecognitionTracker(type, target = 20, restored = {}, prefiltered = false, armOnStart = false) {
    if (isLibraryRecognition(type)) {
      if (type === "goblet_squat" || type === "barbell_back_squat" || type === "barbell_front_squat") return new ExerciseTracker("squat", target, restored, prefiltered, armOnStart, false);
      if (type === "barbell_curl" || type === "reverse_barbell_curl") return new PlanExerciseTracker("biceps_curl", target, restored, prefiltered, armOnStart);
      if (type === "barbell_row") return new PlanExerciseTracker("bent_over_row", target, restored, prefiltered, armOnStart);
      if (type === "neutral_seated_press") return new PlanExerciseTracker("shoulder_press", target, restored, prefiltered, armOnStart);
      if (type === "dumbbell_standing_press" || type === "barbell_military_press") return new PlanExerciseTracker("shoulder_press", target, restored, prefiltered, armOnStart);
      if (type === "dumbbell_reverse_lunge") return new PlanExerciseTracker("reverse_lunge", target, restored, prefiltered, armOnStart);
      if (type === "dumbbell_deadlift") return new ExtendedExerciseTracker("barbell_deadlift", target, restored, prefiltered, armOnStart);
      if (type === "barbell_good_morning") return new ExtendedExerciseTracker("romanian_deadlift", target, restored, prefiltered, armOnStart);
      if (type === "seated_calf_raise") return new PlanExerciseTracker("seated_calf_raise", target, restored, prefiltered, armOnStart);
      if (type === "dumbbell_calf_raise") return new PlanExerciseTracker("calf_raise", target, restored, prefiltered, armOnStart);
      return new ExtendedExerciseTracker(type, target, restored, prefiltered, armOnStart);
    }
    if (isNewExercise(type)) return new ExtendedExerciseTracker(type, target, restored, prefiltered, armOnStart);
    if (isNewPlanProfile(type)) return new PlanExerciseTracker(type, target, restored, prefiltered, armOnStart);
    if (isCameraExercise(type)) return new ExerciseTracker(type, target, restored, prefiltered, armOnStart);
    throw new Error("\u5F53\u524D\u5BA2\u6237\u7AEF\u4E0D\u652F\u6301\u6B64\u52A8\u4F5C\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u6216\u5207\u6362\u624B\u52A8\u8BB0\u5F55");
  }

  // src/features/motion/lib/poseProtocol.ts
  var FrameOrder = class {
    id = -1;
    time = -1;
    runId;
    constructor(runId) {
      this.runId = runId;
    }
    /** Rebind to a new run when a ladder step-down swaps the pose model
     * mid-session: frame ids restart with the run, but the captured-at
     * high-water mark is kept, so a late frame from before the swap can never
     * be accepted after it. */
    rebind(runId) {
      this.runId = runId;
      this.id = -1;
    }
    accept(f) {
      if (f.runId !== this.runId || !Number.isInteger(f.frameId) || f.frameId <= this.id || !Number.isFinite(f.capturedAt) || f.capturedAt <= this.time || !Number.isFinite(f.receivedAt) || f.receivedAt < f.capturedAt || f.receivedAt - f.capturedAt > 250 || !Number.isFinite(f.width) || !Number.isFinite(f.height) || f.width <= 0 || f.height <= 0) return false;
      this.id = f.frameId;
      this.time = f.capturedAt;
      return true;
    }
  };
  var TimeFilter = class {
    points = null;
    derivatives = [];
    at = 0;
    reset() {
      this.points = null;
      this.derivatives = [];
      this.at = 0;
    }
    apply(raw, now) {
      if (!this.points) {
        this.points = raw.map((p) => ({ ...p }));
        this.derivatives = raw.map(() => [0, 0, 0]);
        this.at = now;
        return this.points;
      }
      const dt = Math.max(1e-3, (now - this.at) / 1e3), alpha = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
      this.at = now;
      this.points = raw.map((p, i) => {
        const q = { ...p };
        ["x", "y", "z"].forEach((key, k) => {
          const previous = this.points[i][key] || 0, value = p[key] || 0, d = this.derivatives[i][k] + alpha(1) * ((value - previous) / dt - this.derivatives[i][k]);
          this.derivatives[i][k] = d;
          q[key] = previous + alpha(1.5 + 0.03 * Math.abs(d)) * (value - previous);
        });
        return q;
      });
      return this.points;
    }
  };

  // src/features/motion/lib/framingFeedback.ts
  var names = { 0: "\u5934\u90E8", 11: "\u5DE6\u80A9", 12: "\u53F3\u80A9", 13: "\u5DE6\u8098", 14: "\u53F3\u8098", 15: "\u5DE6\u624B\u8155", 16: "\u53F3\u624B\u8155", 23: "\u5DE6\u9ACB", 24: "\u53F3\u9ACB", 25: "\u5DE6\u819D", 26: "\u53F3\u819D", 27: "\u5DE6\u811A\u8E1D", 28: "\u53F3\u811A\u8E1D", 29: "\u5DE6\u811A\u8DDF", 30: "\u53F3\u811A\u8DDF", 31: "\u5DE6\u524D\u811A\u638C", 32: "\u53F3\u524D\u811A\u638C" };
  function framingFeedback(points, required) {
    const affected = required.filter((i) => points[i].x < 0 || points[i].x > 1 || points[i].y < 0 || points[i].y > 1);
    if (!affected.length) return null;
    const parts = affected.map((i) => names[i] || `\u5173\u8282${i}`).slice(0, 3).join("\u3001") + (affected.length > 3 ? "\u7B49" : "");
    const bottom = affected.some((i) => points[i].y > 1), top = affected.some((i) => points[i].y < 0);
    const edge = bottom && top ? "\u4E0A\u4E0B\u8FB9\u7F18" : bottom ? "\u4E0B\u6CBF" : top ? "\u4E0A\u6CBF" : "\u4FA7\u8FB9";
    const action = bottom && !top ? "\u8BF7\u540E\u9000\u4E00\u70B9\uFF0C\u6216\u628A\u955C\u5934\u7A0D\u5411\u4E0B\u8C03\u6574\uFF0C\u8BA9\u811A\u90E8\u5B8C\u6574\u5165\u955C" : top && !bottom ? "\u8BF7\u540E\u9000\u4E00\u70B9\uFF0C\u6216\u628A\u955C\u5934\u7A0D\u5411\u4E0A\u8C03\u6574" : "\u8BF7\u540E\u9000\u4E00\u70B9\uFF0C\u5E76\u628A\u8EAB\u4F53\u79FB\u5230\u753B\u9762\u4E2D\u592E";
    return { affected, message: `${parts}\u51FA\u753B\uFF08\u753B\u9762${edge}\uFF09\u3002${action}\uFF0C\u5165\u955C\u540E\u7EE7\u7EED\u505A\u5B8C\u6574\u52A8\u4F5C` };
  }

  // src/features/motion/lib/adaptiveRecognition.ts
  var distance4 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
  var HAMMER_FREEZE_GRACE_MS = 2e3;
  var AdaptiveRecognition = class {
    constructor(type, target, restored, runId) {
      this.type = type;
      this.target = target;
      this.restored = restored;
      this.base = createRecognitionTracker(type, target, restored, true, true);
      this.order = new FrameOrder(runId);
    }
    base;
    order;
    image = new TimeFilter();
    world = new TimeFilter();
    weak = null;
    weakWorld = null;
    source = null;
    shape = null;
    previous = null;
    previousShoulder = 11;
    stepBridge = false;
    frozenAt = null;
    lastFreezeAt = null;
    width = 0;
    height = 0;
    scoring = true;
    usableFrame = false;
    get metrics() {
      return this.base.metrics;
    }
    get diagnostics() {
      return this.base.diagnostics;
    }
    get ready() {
      return this.base.metrics.poseFeedback.calibrated;
    }
    /** Reuse only a fully prepared neutral phase; never carry a paused partial cycle. */
    continuePrepared(runId) {
      if (!this.ready || this.diagnostics.stage !== "ready") return false;
      this.order = new FrameOrder(runId);
      this.image.reset();
      this.world.reset();
      return true;
    }
    /** A ladder step-down swaps only the pose model (see useAdaptivePose): this
     * engine — the tracker with its calibration bank and open cycle, both
     * landmark TimeFilters, and the wrapper's framing state — carries over
     * untouched, so the switch is invisible to the measurement. Three seams are
     * re-sewn explicitly: frame order rebinds to the new run (frame ids
     * restart; the captured-at high-water mark survives, so pre-swap frames
     * stay rejected); the 2D/3D basis is re-established from the new rung's
     * first frame instead of reading the estimator change itself as a basis
     * flip (the flip guard resumes from there); and the transport gap is
     * bridged past the tracker's frame-gap guard on the next measured frame,
     * the same one-shot bridge the hammer evidence freeze uses. The bridge flag
     * is consumed only when a frame actually reaches the tracker, and a tracker
     * interrupt in between resets its gap reference, which neutralises a stale
     * flag on its own. */
    carryToRun(runId) {
      this.order.rebind(runId);
      this.source = null;
      this.stepBridge = true;
    }
    interrupt(reason = "\u8BC6\u522B\u5DF2\u6682\u505C\uFF0C\u7EE7\u7EED\u540E\u8BC6\u522B\u4E0B\u4E00\u4E2A\u5B8C\u6574\u52A8\u4F5C") {
      this.usableFrame = false;
      this.base.interrupt(reason);
      this.image.reset();
      this.world.reset();
      this.previous = null;
      this.shape = null;
      this.source = null;
      this.weak = null;
      this.weakWorld = null;
      this.scoring = true;
      this.frozenAt = null;
      this.lastFreezeAt = null;
    }
    /** Hammer-curl evidence freeze: hold the frozen message and feed nothing to the base
     * tracker, so its per-side cycle state (including an already-reached peak) survives.
     * Past the grace the half rep is voided with the caller's usual reason. */
    freezeHammer(capturedAt, message, expiredReason) {
      if (this.frozenAt === null) {
        this.frozenAt = capturedAt;
        this.lastFreezeAt = capturedAt;
      }
      if (capturedAt - this.frozenAt > HAMMER_FREEZE_GRACE_MS) {
        this.frozenAt = null;
        return this.reject(expiredReason);
      }
      const frozen = message;
      this.base.metrics = { ...this.metrics, feedback: frozen, poseFeedback: { ...this.metrics.poseFeedback, status: "uncertain", message: frozen } };
      return this.metrics;
    }
    reject(reason) {
      this.interrupt(reason);
      return this.metrics;
    }
    freezeSquat(capturedAt, _message, affectedJoints = []) {
      this.weak ??= capturedAt;
      if (capturedAt - this.weak > 200) return this.reject(COPY_HALF_REP);
      this.scoring = false;
      this.base.metrics = { ...this.metrics, feedback: COPY_UNCLEAR, poseFeedback: { ...this.metrics.poseFeedback, status: "uncertain", message: COPY_UNCLEAR, affectedJoints } };
      return this.metrics;
    }
    update(f, count = true) {
      this.usableFrame = false;
      if (!this.order.accept(f)) return this.metrics;
      if (this.width && (f.width !== this.width || f.height !== this.height)) this.interrupt("\u753B\u9762\u53D8\u4E86\u4E00\u4E0B\uFF0C\u56DE\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u6211\u4EEC\u91CD\u65B0\u5F00\u59CB");
      this.width = f.width;
      this.height = f.height;
      const raw = f.landmarks;
      if (!raw || raw.length !== 33 || raw.some((p) => !p || ![p.x, p.y, p.visibility ?? 0].every(Number.isFinite))) return this.type === "squat" ? this.freezeSquat(f.capturedAt, "\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u7684\u6DF1\u8E72\u5173\u8282") : this.reject(notSeenCopyFor(this.type));
      const needed2 = this.base.requiredIndices(raw);
      const framing = framingFeedback(raw, needed2);
      if (this.type === "squat") {
        const side = needed2.includes(12) ? "right" : "left";
        if (!squatSideVisible(raw, side)) {
          if (this.ready) return this.freezeSquat(f.capturedAt, framing?.message || "\u8DDF\u8E2A\u4FA7\u5173\u8282\u4E0D\u591F\u6E05\u6670", framing?.affected);
          if (!framing) return this.reject("\u8BA9\u6211\u770B\u6E05\u4F60\u540C\u4E00\u4FA7\u7684\u80A9\u3001\u9ACB\u3001\u819D\u548C\u811A\u8E1D");
        }
      }
      if (framing) {
        this.reject(framing.message);
        this.base.metrics.poseFeedback = { ...this.metrics.poseFeedback, affectedJoints: framing.affected };
        return this.metrics;
      }
      if (needed2.some((i) => (raw[i].visibility ?? 0) < 0.55)) {
        if (this.type === "hammer_curl") return this.freezeHammer(f.capturedAt, COPY_UNCLEAR, COPY_HALF_REP);
        this.weak ??= f.capturedAt;
        if (f.capturedAt - this.weak > 200) return this.reject(COPY_HALF_REP);
        this.base.metrics = { ...this.metrics, feedback: COPY_UNCLEAR, poseFeedback: { ...this.metrics.poseFeedback, status: "uncertain", message: COPY_UNCLEAR } };
        return this.metrics;
      }
      if (this.weak !== null && f.capturedAt - this.weak > 200) this.interrupt(COPY_HALF_REP);
      this.weak = null;
      const shoulder = this.type === "squat" && needed2.includes(12) ? 12 : 11, hip = shoulder + 12;
      const aspect = f.width / f.height, scale = Math.hypot((raw[shoulder].x - raw[hip].x) * aspect, raw[shoulder].y - raw[hip].y);
      if (scale < 0.06) return this.reject("\u753B\u9762\u91CC\u4F60\u663E\u5F97\u6709\u70B9\u5C0F\uFF0C\u9760\u8FD1\u4E00\u70B9\u70B9\uFF0C\u8BA9\u6211\u770B\u6E05\u695A\u4F60");
      if (this.previous && this.previousShoulder === shoulder) {
        const last = this.previous, old = Math.max(0.04, Math.hypot((last[shoulder].x - last[hip].x) * aspect, last[shoulder].y - last[hip].y));
        const centroidStep = Math.hypot((raw[23].x + raw[24].x - (last[23].x + last[24].x)) / 2 * aspect, (raw[23].y + raw[24].y - (last[23].y + last[24].y)) / 2), shoulderWidth = Math.hypot((raw[11].x - raw[12].x) * aspect, raw[11].y - raw[12].y), lastShoulderWidth = Math.max(0.02, Math.hypot((last[11].x - last[12].x) * aspect, last[11].y - last[12].y)), widthRatio = shoulderWidth / lastShoulderWidth;
        if (centroidStep > old * 0.5 && (widthRatio < 0.75 || widthRatio > 1.33)) return this.reject(COPY_SUBJECT_SWITCH);
        if (Math.hypot((raw[hip].x - last[hip].x) * aspect, raw[hip].y - last[hip].y) > old * 0.5 || scale / old < 0.75 || scale / old > 1.25) return this.reject("\u4F4D\u7F6E\u53D8\u4E86\u4E00\u4E0B\uFF0C\u56DE\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u6211\u4EEC\u91CD\u65B0\u6765");
      }
      const w = f.worldLandmarks, pairs = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]].filter((pair) => pair.every((i) => needed2.includes(i)));
      let world = w?.length === 33 && w.every((p) => p && [p.x, p.y, p.z].every(Number.isFinite)) && needed2.every((i) => (raw[i].visibility ?? 0) >= 0.7 && (w[i].visibility ?? raw[i].visibility ?? 0) >= 0.7) ? w : null;
      if (world) {
        const torso = distance4(world[shoulder], world[hip]), ratios = pairs.map(([a, b]) => distance4(world[a], world[b]) / torso);
        if (torso < 0.04 || torso > 1.5 || ratios.some((r, i) => r < 0.15 || r > 2.5 || this.shape && Math.abs(r / this.shape[i] - 1) > 0.25)) world = null;
        else this.shape = ratios;
      }
      if (["jumping_jack", "push_up", "high_knees"].includes(this.type)) world = null;
      if (world && ["goblet_squat", "barbell_back_squat", "barbell_front_squat"].includes(this.type) && analyzeSquatFrame(raw, aspect, world)?.angleSource !== "world") world = null;
      if (this.source === true && !world) {
        if (this.type === "hammer_curl") return this.freezeHammer(f.capturedAt, COPY_BASIS_UNSTABLE, "\u5149\u7EBF\u6709\u70B9\u6B3A\u8D1F\u4EBA\uFF0C\u5148\u56DE\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u6211\u4EEC\u91CD\u65B0\u7A33\u4E00\u7A33");
        this.weakWorld ??= f.capturedAt;
        if (f.capturedAt - this.weakWorld <= 200) {
          this.base.metrics = { ...this.metrics, feedback: COPY_BASIS_UNSTABLE, poseFeedback: { ...this.metrics.poseFeedback, status: "uncertain", message: COPY_BASIS_UNSTABLE } };
          return this.metrics;
        }
      } else this.weakWorld = null;
      const source = !!world;
      if (this.source !== null && source !== this.source) {
        const tolerated = this.type === "hammer_curl" && (this.frozenAt !== null || this.lastFreezeAt !== null && f.capturedAt - this.lastFreezeAt <= HAMMER_FREEZE_GRACE_MS);
        if (!tolerated) this.interrupt("\u5149\u7EBF\u6709\u70B9\u6B3A\u8D1F\u4EBA\uFF0C\u5148\u56DE\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u6211\u4EEC\u91CD\u65B0\u7A33\u4E00\u7A33");
      }
      this.source = source;
      this.previousShoulder = shoulder;
      this.previous = raw.map((p) => ({ ...p }));
      if (this.type === "hammer_curl" && this.frozenAt !== null) {
        const gap = f.capturedAt - this.frozenAt;
        this.frozenAt = null;
        if (gap > HAMMER_FREEZE_GRACE_MS) return this.reject(COPY_HALF_REP);
        this.base.bridgeFreezeGap?.(f.capturedAt);
      }
      if (this.stepBridge) {
        this.stepBridge = false;
        this.base.bridgeFreezeGap?.(f.capturedAt);
      }
      const before = structuredClone(this.metrics), stage = this.diagnostics.stage;
      this.base.update(this.image.apply(raw, f.capturedAt), f.capturedAt, aspect, world ? this.world.apply(world, f.capturedAt) : null);
      this.usableFrame = this.diagnostics.stage !== "tracking_lost";
      if (stage !== "ready" || this.diagnostics.stage !== "ready") {
        const weakScore = this.type === "squat" ? !squatSideVisible(raw, "left", 0.7) || !squatSideVisible(raw, "right", 0.7) : needed2.some((i) => (raw[i].visibility ?? 0) < 0.7);
        if (weakScore) this.scoring = false;
      }
      if (this.metrics.reps > before.reps) {
        if (!this.scoring) {
          const sides = this.metrics.scoreAccumulator;
          this.base.metrics = { ...this.metrics, scoreAccumulator: { ...before.scoreAccumulator, ...sides.leftReps !== void 0 ? { leftReps: sides.leftReps, rightReps: sides.rightReps } : {} }, formScore: before.formScore, formBreakdown: before.formBreakdown, axisAssessment: before.axisAssessment, perfectReps: before.perfectReps, correctionCounts: before.correctionCounts, lastRepScore: null, lastRepIssues: [], feedback: "\u8BB0\u4E0B\u5566 \xB7 \u521A\u624D\u6709\u70B9\u6CA1\u770B\u6E05\uFF0C\u8FD9\u6B21\u4E0D\u8BC4\u5206" };
        }
        this.scoring = true;
      }
      if (!count && this.metrics.reps > before.reps) {
        this.base = createRecognitionTracker(this.type, this.target, before, true, true);
        this.interrupt("\u521A\u624D\u8FD8\u5728\u51C6\u5907\u9636\u6BB5\uFF0C\u5148\u56DE\u5230\u8D77\u59CB\u59FF\u52BF\uFF0C\u6211\u4EEC\u6B63\u5F0F\u5F00\u59CB");
        return this.metrics;
      }
      return this.metrics;
    }
  };

  // test-assets/thunder-tracker-entry.ts
  globalThis.MoveMateTracker = {
    create(runId) {
      const engine = new AdaptiveRecognition("hammer_curl", 20, {}, runId);
      return {
        update: (frame) => engine.update(frame, true),
        get reps() {
          return engine.metrics.reps;
        },
        get ready() {
          return engine.ready;
        }
      };
    }
  };
})();

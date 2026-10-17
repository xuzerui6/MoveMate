import { Router } from "express";
import * as gym from "../gym/service";
import { previewImport, commitImport, importPlan } from "../gym/imports";
import {settings,saveSettings} from "../gym/preferences";
const router = Router();
const wrap =
  (handler: (req: any) => any) => async (req: any, res: any, next: any) => {
    try {
      res.json({ code: 0, message: "success", data: await handler(req) });
    } catch (error) {
      next(error);
    }
  };
router.get("/training-settings",wrap(r=>settings(r.user.id)));
router.put("/training-settings",wrap(r=>saveSettings(r.user.id,r.body)));
router.get(
  "/exercises",
  wrap((r) => gym.library(r.user.id, r.query)),
);
router.post(
  "/exercises",
  wrap((r) => gym.saveExercise(r.user.id, r.body)),
);
router.put(
  "/exercises/:id/favorite",
  wrap((r) => gym.favorite(r.user.id, r.params.id, r.body.enabled === true)),
);
router.get(
  "/training-plans",
  wrap((r) => gym.plans(r.user.id)),
);
router.post(
  "/training-plans",
  wrap((r) => gym.savePlan(r.user.id, r.body)),
);
router.put(
  "/training-plans/:id",
  wrap((r) => gym.savePlan(r.user.id, r.body, r.params.id)),
);
router.delete(
  "/training-plans/:id",
  wrap((r) => gym.removePlan(r.user.id, r.params.id)),
);
router.get(
  "/training-plans/:id/progression",
  wrap((r) => gym.progression(r.user.id, r.params.id)),
);
router.get(
  "/workout-sessions",
  wrap((r) => gym.listWorkouts(r.user.id)),
);
router.post(
  "/workout-sessions",
  wrap((r) => gym.startWorkout(r.user.id, r.body)),
);
router.get(
  "/workout-sessions/:id",
  wrap((r) => gym.workout(r.user.id, r.params.id)),
);
router.post(
  "/workout-sessions/:id/actions",
  wrap((r) => gym.actWorkout(r.user.id, r.params.id, r.body)),
);
router.post("/workout-sessions/:id/save-plan",wrap(r=>gym.saveWorkoutPlan(r.user.id,r.params.id,r.body)));
router.patch(
  "/workout-sessions/:id/history",
  wrap((r) => gym.editHistory(r.user.id, r.params.id, r.body)),
);
router.get(
  "/body-measurements",
  wrap((r) => gym.measurements(r.user.id)),
);
router.put(
  "/body-measurements",
  wrap((r) => gym.saveMeasurement(r.user.id, r.body)),
);
router.get(
  "/training-analytics",
  wrap((r) => gym.analytics(r.user.id)),
);
router.get(
  "/training-export",
  wrap((r) => gym.exportData(r.user.id)),
);
router.post(
  "/training-imports/preview",
  wrap((r) => previewImport(r.user.id, r.body)),
);
router.post(
  "/training-imports/commit",
  wrap((r) => commitImport(r.user.id, r.body)),
);
router.post(
  "/training-imports/plan",
  wrap((r) => importPlan(r.user.id, r.body)),
);
router.get(
  "/games/:id/training-plan",
  wrap((r) => gym.gamePlan(r.user.id, Number(r.params.id))),
);
router.put(
  "/games/:id/training-plan",
  wrap((r) =>
    gym.attachPlan(
      r.user.id,
      Number(r.params.id),
      String(r.body.planId),
      String(r.body.routineId),
    ),
  ),
);
export default router;

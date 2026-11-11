import {useCallback, useEffect, useMemo, useState} from 'react';
import type {PoseModel} from '../lib/poseProtocol';
import {
  checkPoseModelsReady,
  ensurePoseModels,
  getPosePrepareSnapshot,
  plannedPoseModel,
  prefetchPoseModels,
  subscribePosePrepare,
  type PrepareSnapshot,
} from '../lib/posePrepare';

/** Binds a component to the shared prepare run for the model a training start
 * would open on this device. `start()` joins (or begins) the deduped run;
 * `ready` flips true once the whole set is verified in cache. */
export function usePosePrepare(model?: PoseModel) {
  const target = useMemo(() => model ?? plannedPoseModel(false), [model]);
  const [snapshot, setSnapshot] = useState<PrepareSnapshot>(() => getPosePrepareSnapshot(target));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const unsubscribe = subscribePosePrepare(target, next => {
      setSnapshot(next);
      if (next.phase === 'ready') setReady(true);
    });
    void checkPoseModelsReady(target).then(ok => { if (alive && ok) setReady(true); });
    return () => { alive = false; unsubscribe(); };
  }, [target]);
  const start = useCallback(() => ensurePoseModels(target), [target]);
  return {model: target, snapshot, ready, start};
}

/** Design D: silent background prefetch on mount + the quiet status line's data.
 * The line only exists while a download is actually running. */
export function usePosePrefetchLine() {
  const target = useMemo(() => plannedPoseModel(false), []);
  const [snapshot, setSnapshot] = useState<PrepareSnapshot>(() => getPosePrepareSnapshot(target));
  useEffect(() => {
    prefetchPoseModels();
    return subscribePosePrepare(target, setSnapshot);
  }, [target]);
  return snapshot;
}

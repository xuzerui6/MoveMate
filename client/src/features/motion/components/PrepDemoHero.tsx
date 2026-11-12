import {useEffect, useState} from 'react';
import {ExerciseDemo, ExerciseMediaPanel} from '../../gym/ExerciseMedia';
import {mediaSummaryFor} from '../../gym/media';
import {useCdnFirstImage} from '../lib/cdnAssets';

/** Design B demo hero: the movement's own published start-frame photo fills a 4:3
 * frame with a glass 示范 pill; tapping opens the same in-site demo panel the old
 * text disclosure opened. Movements without a photo keep the text disclosure. */
export function PrepDemoHero({exercise, suspended = false}: {exercise: any; suspended?: boolean}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [exercise?.id]);
  if (!exercise) return null;
  const thumb = mediaSummaryFor(exercise.id)?.thumb;
  const image = useCdnFirstImage(thumb ?? null);
  if (!thumb) return <ExerciseDemo exercise={exercise} suspended={suspended}/>;
  return (
    <div className="prep-demo">
      <button type="button" className="prep-demo-hero" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <img src={image.src} onError={() => { image.onError(); }} alt="" loading="lazy" decoding="async"/>
        <span className="prep-demo-pill"><span aria-hidden="true">▶</span> 示范 · 站内图文</span>
        <span className="prep-demo-ratio">4:3</span>
      </button>
      {open && <ExerciseMediaPanel exercise={exercise} suspended={suspended}/>}
    </div>
  );
}

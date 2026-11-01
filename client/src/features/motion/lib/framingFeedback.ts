import type {NormalizedLandmark as Point} from '@mediapipe/tasks-vision';
const names:Record<number,string>={0:'头部',11:'左肩',12:'右肩',13:'左肘',14:'右肘',15:'左手腕',16:'右手腕',23:'左髋',24:'右髋',25:'左膝',26:'右膝',27:'左脚踝',28:'右脚踝',29:'左脚跟',30:'右脚跟',31:'左前脚掌',32:'右前脚掌'};
/** Report only joints actually required by this action. Never clamp or accept out-of-frame samples. */
export function framingFeedback(points:Point[],required:number[]){
 const affected=required.filter(i=>points[i].x<0||points[i].x>1||points[i].y<0||points[i].y>1);
 if(!affected.length)return null;
 const parts=affected.map(i=>names[i]||`关节${i}`).slice(0,3).join('、')+(affected.length>3?'等':'');
 const bottom=affected.some(i=>points[i].y>1),top=affected.some(i=>points[i].y<0);
 const edge=bottom&&top?'上下边缘':bottom?'下沿':top?'上沿':'侧边';
 const action=bottom&&!top?'请后退一点，或把镜头稍向下调整，让脚部完整入镜':top&&!bottom?'请后退一点，或把镜头稍向上调整':'请后退一点，并把身体移到画面中央';
 return {affected,message:`${parts}出画（画面${edge}）。${action}，站稳后重新校准`};
}

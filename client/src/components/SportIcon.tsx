import {Icon} from '../features/motion/components/Icons';
import type {SportType} from '../types';
export function SportIcon({sport,size=24,color,className}:{sport:SportType;size?:number|string;color?:string;className?:string}){const names:Record<string,string>={fitness:'dumbbell',basketball:'basketball',soccer:'soccer',badminton:'tennis',table_tennis:'tennis',volleyball:'basketball',roller_skating:'running'};return <span  className={[className,"ui-components-sporticon-inline-0"].filter(Boolean).join(" ")} style={{color}}><Icon name={names[sport]||sport} size={typeof size==='number'?size:24}/></span>;}
export default SportIcon;


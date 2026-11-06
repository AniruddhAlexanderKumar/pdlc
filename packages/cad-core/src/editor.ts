import { distance2, LENGTH_EPSILON_METRES, type Vec2 } from './math.js';
import type { EntityMetadata, LineEntity } from './geometry.js';
import { solveSketch, type SolveResult } from './solver.js';
import type { Sketch, SketchConstraint, SketchEntity } from './sketch.js';

/** Pure, in-memory sketch transaction history. It is not a persistence or UI implementation. */
export type SketchHistory={current:Sketch; undo:Sketch[]; redo:Sketch[]};
export const startHistory=(sketch:Sketch):SketchHistory=>({current:structuredClone(sketch),undo:[],redo:[]});
export function undoSketch(history:SketchHistory):SketchHistory {
 if(!history.undo.length)return history;
 return {current:history.undo[history.undo.length-1],undo:history.undo.slice(0,-1),redo:[...history.redo,history.current]};
}
export function redoSketch(history:SketchHistory):SketchHistory {
 if(!history.redo.length)return history;
 return {current:history.redo[history.redo.length-1],undo:[...history.undo,history.current],redo:history.redo.slice(0,-1)};
}
/** Commit the solved source as a single undo step; invalid candidates preserve the exact history. */
export function commitSketch(history:SketchHistory,candidate:Sketch):{history:SketchHistory;result:SolveResult} {
 const result=solveSketch(candidate);
 if(!result.sketch)return {history,result};
 // A source cannot be used to change document identity or the server revision via an edit.
 if(candidate.id!==history.current.id||candidate.revision!==history.current.revision)throw new Error('Sketch identity or revision changed during edit');
 if(JSON.stringify(result.sketch)===JSON.stringify(history.current))return {history,result};
 return {history:{current:structuredClone(result.sketch),undo:[...history.undo.slice(-99),structuredClone(history.current)],redo:[]},result};
}
/** Four separate lines and explicit corner, horizontal and vertical constraints. */
export function rectangleGeometry(a:Vec2,b:Vec2, metadata:(id:string)=>EntityMetadata, id:()=>string):{entities:LineEntity[];constraints:SketchConstraint[]} {
 if(!Number.isFinite(a[0])||!Number.isFinite(a[1])||!Number.isFinite(b[0])||!Number.isFinite(b[1])||Math.abs(a[0]-b[0])<=LENGTH_EPSILON_METRES||Math.abs(a[1]-b[1])<=LENGTH_EPSILON_METRES)throw new RangeError('Rectangle requires nondegenerate corners');
 const corners:Vec2[]=[a,[b[0],a[1]],b,[a[0],b[1]]];
 const entities:LineEntity[]=corners.map((start,i)=>({...metadata(id()),type:'line',start,end:corners[(i+1)%4]}));
 const constraints:SketchConstraint[]=[...entities.map((line,i)=>({id:id(),enabled:true,type:'coincident' as const,a:{entityId:line.id,point:'end' as const},b:{entityId:entities[(i+1)%4].id,point:'start' as const}})),...entities.map((line,i)=>({id:id(),enabled:true,type:i%2===0?'horizontal' as const:'vertical' as const,lineId:line.id}))];
 return {entities,constraints};
}
function constraintReferences(c:SketchConstraint,ids:Set<string>):boolean {
 switch(c.type){
  case 'coincident':case 'horizontal-distance':case 'vertical-distance':case 'distance':return ids.has(c.a.entityId)||ids.has(c.b.entityId);
  case 'fixed-point':return ids.has(c.point.entityId);
  case 'horizontal':case 'vertical':case 'fixed-line':case 'line-length':return ids.has(c.lineId);
  case 'parallel':case 'perpendicular':case 'equal-length':case 'angle':return ids.has(c.lineA)||ids.has(c.lineB);
  case 'radius':case 'diameter':return ids.has(c.circleId);
 }
}
/** Removes attached constraints as part of the same candidate transaction. */
export function removeEntities(sketch:Sketch,ids:Iterable<string>):Sketch {
 const selected=new Set(ids);return {...sketch,entities:sketch.entities.filter(e=>!selected.has(e.id)),constraints:sketch.constraints.filter(c=>!constraintReferences(c,selected))};
}
export function moveEntities(sketch:Sketch,ids:Iterable<string>,delta:Vec2):Sketch {
 if(!Number.isFinite(delta[0])||!Number.isFinite(delta[1]))throw new RangeError('Invalid movement');const selected=new Set(ids);
 const shift=(p:Vec2):Vec2=>[p[0]+delta[0],p[1]+delta[1]];
 const entities:SketchEntity[]=sketch.entities.map(e=>!selected.has(e.id)?e:e.type==='point'?{...e,position:shift(e.position)}:e.type==='line'?{...e,start:shift(e.start),end:shift(e.end)}:{...e,center:shift(e.center)});
 return {...sketch,entities};
}
export type SnapResult={point:Vec2;kind:'endpoint'|'center'|'origin'|'grid'|'none';entityId?:string};
/** Nearest existing point wins; origin and optional grid are explicit lower-priority targets. */
export function snapPoint(sketch:Sketch,point:Vec2,tolerance:number,gridSize?:number):SnapResult {
 if(!Number.isFinite(point[0])||!Number.isFinite(point[1])||!Number.isFinite(tolerance)||tolerance<0||gridSize!==undefined&&(!Number.isFinite(gridSize)||gridSize<=0))throw new RangeError('Invalid snapping input');
 let best:SnapResult|null=null,closest=Infinity;
 for(const e of sketch.entities){if(!e.visible)continue;const candidates:{point:Vec2;kind:'endpoint'|'center'}[]=e.type==='line'?[{point:e.start,kind:'endpoint'},{point:e.end,kind:'endpoint'}]:(e.type==='circle'||e.type==='arc')?[{point:e.center,kind:'center'}]:[{point:e.position,kind:'endpoint'}];
  for(const c of candidates){const d=distance2(point,c.point);if(d<=tolerance&&d<closest){closest=d;best={...c,entityId:e.id};}}
 }
 if(best)return best;if(distance2(point,[0,0])<=tolerance)return {point:[0,0],kind:'origin'};
 if(gridSize!==undefined){const p:Vec2=[Math.round(point[0]/gridSize)*gridSize,Math.round(point[1]/gridSize)*gridSize];if(distance2(point,p)<=tolerance)return {point:p,kind:'grid'};}
 return {point,kind:'none'};
}

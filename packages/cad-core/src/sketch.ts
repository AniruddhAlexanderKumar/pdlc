import { coordinate, distance2, finiteNumber, LENGTH_EPSILON_METRES, type Vec2 } from './math.js';
import type { ArcEntity, CircleEntity, LineEntity, PointEntity } from './geometry.js';

/** Initial solver supports point, line, circle and arc entities. */
export type SketchEntity = PointEntity | LineEntity | CircleEntity | ArcEntity;
export type PointRef = { entityId:string; point:'position'|'start'|'end'|'center' };
export type ConstraintBase = { id:string; enabled:boolean };
export type SketchConstraint = ConstraintBase & (
  | {type:'coincident'; a:PointRef; b:PointRef}
  | {type:'horizontal'|'vertical'; lineId:string}
  | {type:'parallel'|'perpendicular'|'equal-length'; lineA:string; lineB:string}
  | {type:'fixed-point'; point:PointRef; target:Vec2}
  | {type:'fixed-line'; lineId:string; start:Vec2; end:Vec2}
  | {type:'horizontal-distance'|'vertical-distance'|'distance'; a:PointRef; b:PointRef; metres:number}
  | {type:'line-length'; lineId:string; metres:number}
  | {type:'radius'|'diameter'; circleId:string; metres:number}
  | {type:'angle'; lineA:string; lineB:string; radians:number}
);
export type Sketch = { schemaVersion:1; id:string; plane:'XY'; units:'m'; revision:number; entities:SketchEntity[]; constraints:SketchConstraint[] };

/** Fail closed before numerical evaluation; does not accept polylines, splines or unknown records. */
export function validateSketch(sketch:Sketch):void {
  if(!sketch||sketch.schemaVersion!==1||sketch.plane!=='XY'||sketch.units!=='m'||!Number.isSafeInteger(sketch.revision)||sketch.revision<0||typeof sketch.id!=='string'||!sketch.id.trim()||!Array.isArray(sketch.entities)||!Array.isArray(sketch.constraints))throw new Error('Invalid sketch header');
  if(sketch.entities.length>100||sketch.constraints.length>300)throw new Error('Sketch exceeds solver limits');
  const ids=new Set<string>();
  for(const e of sketch.entities){
    if(!e||typeof e.id!=='string'||!e.id.trim()||ids.has(e.id)||typeof e.ownerId!=='string'||!e.ownerId.trim()||typeof e.createdAt!=='string'||!Number.isFinite(Date.parse(e.createdAt))||typeof e.construction!=='boolean'||typeof e.visible!=='boolean')throw new Error('Invalid entity metadata or duplicate entity ID');ids.add(e.id);
    const p=(v:Vec2)=>{if(!Array.isArray(v)||v.length!==2)throw new Error('Invalid point');coordinate(v[0]);coordinate(v[1])};
    if(e.type==='line'){p(e.start);p(e.end);if(distance2(e.start,e.end)<=LENGTH_EPSILON_METRES)throw new Error('Degenerate line');}
    else if(e.type==='point')p(e.position);
    else if(e.type==='circle'||e.type==='arc'){p(e.center);coordinate(e.radius);if(e.radius<=LENGTH_EPSILON_METRES)throw new Error('Degenerate circle or arc');if(e.type==='arc'){finiteNumber(e.startAngle,'arc start');finiteNumber(e.sweep,'arc sweep');if(Math.abs(e.startAngle)>2*Math.PI||Math.abs(e.sweep)<=1e-12||Math.abs(e.sweep)>2*Math.PI)throw new Error('Invalid arc angles');}}
    else throw new Error('Unsupported entity type');
  }
  const byId=new Map(sketch.entities.map(e=>[e.id,e]));const cids=new Set<string>();
  const point=(ref:PointRef)=>{if(!ref||typeof ref.entityId!=='string')throw new Error('Invalid point reference');const e=byId.get(ref.entityId);if(!e||!((e.type==='line'&&(ref.point==='start'||ref.point==='end'))||(e.type==='point'&&ref.point==='position')||((e.type==='circle'||e.type==='arc')&&ref.point==='center')))throw new Error('Invalid point reference');};
  const line=(id:string)=>{if(byId.get(id)?.type!=='line')throw new Error('Invalid line reference');};
  const target=(p:Vec2)=>{if(!Array.isArray(p)||p.length!==2)throw new Error('Invalid fixed target');coordinate(p[0]);coordinate(p[1]);};
  for(const c of sketch.constraints){
    if(!c||typeof c.id!=='string'||!c.id.trim()||cids.has(c.id)||typeof c.enabled!=='boolean')throw new Error('Invalid or duplicate constraint ID');cids.add(c.id);
    switch(c.type){
      case 'coincident':point(c.a);point(c.b);break;
      case 'horizontal':case 'vertical':line(c.lineId);break;
      case 'parallel':case 'perpendicular':case 'equal-length':line(c.lineA);line(c.lineB);if(c.lineA===c.lineB)throw new Error('Constraint requires distinct lines');break;
      case 'angle':line(c.lineA);line(c.lineB);if(c.lineA===c.lineB)throw new Error('Constraint requires distinct lines');finiteNumber(c.radians,'angle');if(Math.abs(c.radians)>Math.PI)throw new Error('Angle must be in [-π, π]');break;
      case 'fixed-point':point(c.point);target(c.target);break;
      case 'fixed-line':line(c.lineId);target(c.start);target(c.end);if(distance2(c.start,c.end)<=LENGTH_EPSILON_METRES)throw new Error('Degenerate fixed line');break;
      case 'horizontal-distance':case 'vertical-distance':case 'distance':point(c.a);point(c.b);coordinate(c.metres);if(c.type==='distance'&&c.metres<=LENGTH_EPSILON_METRES)throw new Error('Distance must be positive');break;
      case 'line-length':line(c.lineId);coordinate(c.metres);if(c.metres<=LENGTH_EPSILON_METRES)throw new Error('Length must be positive');break;
      case 'radius':case 'diameter':if(!['circle','arc'].includes(byId.get(c.circleId)?.type??''))throw new Error('Invalid circle or arc reference');coordinate(c.metres);if(c.metres<=LENGTH_EPSILON_METRES)throw new Error('Radius or diameter must be positive');break;
      default:throw new Error('Unsupported constraint type');
    }
  }
}

import { add2, coordinate, cross2, distance2, finiteNumber, LENGTH_EPSILON_METRES, scale2, sub2, type Vec2 } from './math.js';
export type EntityMetadata = { id:string; ownerId:string; createdAt:string; construction:boolean; visible:boolean };
export type PointEntity = EntityMetadata & { type:'point'; position:Vec2 };
export type LineEntity = EntityMetadata & { type:'line'; start:Vec2; end:Vec2 };
export type CircleEntity = EntityMetadata & { type:'circle'; center:Vec2; radius:number };
export type ArcEntity = EntityMetadata & { type:'arc'; center:Vec2; radius:number; startAngle:number; sweep:number };
export type EllipseEntity = EntityMetadata & { type:'ellipse'; center:Vec2; majorRadius:number; minorRadius:number; rotation:number };
export type PolylineEntity = EntityMetadata & { type:'polyline'; vertices:Vec2[]; closed:boolean };
/** Cubic Bezier, four control points; not a general NURBS or B-spline. */
export type CubicBezierEntity = EntityMetadata & { type:'cubic-bezier'; controlPoints:readonly [Vec2,Vec2,Vec2,Vec2] };
export type GeometryEntity = PointEntity|LineEntity|CircleEntity|ArcEntity|EllipseEntity|PolylineEntity|CubicBezierEntity;
export function validPoint(p:Vec2):void { coordinate(p[0]);coordinate(p[1]); }
export function validRadius(radius:number):void { coordinate(radius);if(radius<=LENGTH_EPSILON_METRES)throw new RangeError('Radius is degenerate'); }
export function lineLength(line:Pick<LineEntity,'start'|'end'>):number { validPoint(line.start);validPoint(line.end);return distance2(line.start,line.end); }
/** Intersection of infinite lines. Parallel and coincident lines are reported explicitly. */
export function lineIntersection(a:Pick<LineEntity,'start'|'end'>,b:Pick<LineEntity,'start'|'end'>):{kind:'point';point:Vec2}|{kind:'parallel'|'coincident'} {
  const u=sub2(a.end,a.start),v=sub2(b.end,b.start),lu=lineLength(a),lv=lineLength(b);
  if(lu<=LENGTH_EPSILON_METRES||lv<=LENGTH_EPSILON_METRES)throw new RangeError('Degenerate line');
  const denom=cross2(u,v),offset=sub2(b.start,a.start);
  if(Math.abs(denom)<=1e-12*lu*lv)return {kind:Math.abs(cross2(offset,u))<=LENGTH_EPSILON_METRES*lu?'coincident':'parallel'};
  const point=add2(a.start,scale2(u,cross2(offset,v)/denom));validPoint(point);return {kind:'point',point};
}
export function circleArea(radius:number):number { validRadius(radius);return Math.PI*radius*radius; }
export function arcPoint(arc:Pick<ArcEntity,'center'|'radius'|'startAngle'|'sweep'>,t:number):Vec2 {
  validPoint(arc.center);validRadius(arc.radius);finiteNumber(arc.startAngle);finiteNumber(arc.sweep);finiteNumber(t);
  if(t<0||t>1||Math.abs(arc.sweep)<=1e-12||Math.abs(arc.sweep)>2*Math.PI+1e-12)throw new RangeError('Invalid arc parameter or sweep');
  const a=arc.startAngle+t*arc.sweep;const result:Vec2=[arc.center[0]+arc.radius*Math.cos(a),arc.center[1]+arc.radius*Math.sin(a)];validPoint(result);return result;
}
export function cubicBezierPoint(p:readonly [Vec2,Vec2,Vec2,Vec2],t:number):Vec2 {
  p.forEach(validPoint);finiteNumber(t);if(t<0||t>1)throw new RangeError('Bezier parameter out of range');
  const u=1-t;return [u**3*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t**3*p[3][0],u**3*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t**3*p[3][1]];
}

import type {Vec2,Vec3} from '../math.js';
import type {Frame3} from './geometry.js';
import type {ToleranceContext} from './types.js';

/** Isolated analytic rectangular-radial revolution B-rep; not interchangeable with planar Solid. */
export type RevolveProvenance={operation:'revolve';operationId:string;sourceSketchId:string;sourceRevision:number;sourceEntityIds:string[];role:string};
export type RevolveVertex={id:string;point:Vec3;edgeIds:string[];provenance:RevolveProvenance};
export type RevolveCurve={kind:'segment';start:Vec3;end:Vec3}|{kind:'circular-arc';frame:Frame3;radius:number;startAngle:number;sweep:number};
export type RevolveEdge={id:string;curve:RevolveCurve;startVertexId:string;endVertexId:string;coedgeIds:string[];provenance:RevolveProvenance};
/** pcurves are oriented in traversal direction; their parameter is t in [0,1]. */
export type PCurve={kind:'line';start:Vec2;end:Vec2}|{kind:'arc';radius:number;startAngle:number;sweep:number};
export type RevolveCoedge={id:string;edgeId:string;orientation:1|-1;loopId:string;previousId:string;nextId:string;pcurve:PCurve};
export type RevolveLoop={id:string;faceId:string;kind:'outer'|'inner';coedgeIds:string[]};
export type RevolveSurface={kind:'cylinder';frame:Frame3;radius:number;startAngle:number;sweep:number;axialRange:readonly [number,number]}|{kind:'plane';origin:Vec3;uAxis:Vec3;vAxis:Vec3};
export type RevolveFace={id:string;surface:RevolveSurface;orientation:1|-1;outerLoopId:string;innerLoopIds:string[];adjacentFaceIds:string[];provenance:RevolveProvenance};
export type RevolvedSolid={kind:'rectangular-revolution';id:string;vertices:RevolveVertex[];edges:RevolveEdge[];coedges:RevolveCoedge[];loops:RevolveLoop[];faces:RevolveFace[];shell:{id:string;faceIds:string[];closed:true};tolerance:ToleranceContext;parameters:{axisX:number;innerRadius:number;outerRadius:number;axialMin:number;axialMax:number;startAngle:number;sweep:number;full:boolean};provenance:RevolveProvenance};

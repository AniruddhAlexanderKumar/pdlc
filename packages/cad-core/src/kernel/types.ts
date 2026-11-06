import type {Vec3} from '../math.js';

/** All distances use metres; area m² and volume m³. IDs are operation-scoped strings. */
export type Diagnostic={code:string;message:string;entityIds?:string[]};
export type KernelResult<T>={ok:true;value:T}|{ok:false;diagnostics:Diagnostic[]};
export type ToleranceContext={scaleMetres:number;lengthMetres:number;areaMetres2:number;angularRadians:number;maxCoordinateMetres:number};
export type Provenance={operationId:string;operation:'extrude'|'boolean';inputSolidIds?:string[];sourceSketchIds?:string[];sourceSketchId:string;sourceRevision:number;sourceEntityIds:string[];role:string};
export type Vertex={id:string;point:Vec3;tolerance:number;edgeIds:string[];provenance:Provenance};
export type Segment3={kind:'segment';start:Vec3;end:Vec3};
export type Edge={id:string;curve:Segment3;startVertexId:string;endVertexId:string;parameterRange:readonly [0,1];coedgeIds:string[];provenance:Provenance};
export type Coedge={id:string;edgeId:string;orientation:1|-1;previousId:string;nextId:string;loopId:string};
export type Loop={id:string;coedgeIds:string[];kind:'outer';faceId:string};
export type Plane3={kind:'plane';origin:Vec3;normal:Vec3};
export type Face={id:string;surface:Plane3;outerLoopId:string;innerLoopIds:string[];orientation:1;adjacentFaceIds:string[];provenance:Provenance};
export type Shell={id:string;faceIds:string[];closed:true;provenance:Provenance};
/** Restricted manifold planar B-rep, not a general B-rep or a triangle mesh. */
export type Solid={id:string;kind:'linear-extrusion';vertices:Vertex[];edges:Edge[];coedges:Coedge[];loops:Loop[];faces:Face[];shell:Shell;tolerance:ToleranceContext;provenance:Provenance};
export type Properties={volumeMetres3:number;surfaceAreaMetres2:number;centroid:Vec3;bounds:{min:Vec3;max:Vec3};faceAreas:Record<string,number>;edgeLengths:Record<string,number>};

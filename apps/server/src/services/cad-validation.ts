import { z } from 'zod';
import { MAX_COORDINATE_METRES, solveSketch, validateSketch, type Sketch } from '@sv/cad-core';
import { uuid } from '../lib/http.js';
const scalar=z.number().finite().min(-MAX_COORDINATE_METRES).max(MAX_COORDINATE_METRES);
const positive=scalar.positive();
const point=z.tuple([scalar,scalar]);
const ref=z.object({entityId:uuid,point:z.enum(['position','start','end','center'])}).strict();
const metadata={id:uuid,ownerId:uuid,createdAt:z.iso.datetime({offset:true}),construction:z.boolean(),visible:z.boolean()};
const entity=z.discriminatedUnion('type',[
 z.object({...metadata,type:z.literal('point'),position:point}).strict(),
 z.object({...metadata,type:z.literal('line'),start:point,end:point}).strict(),
 z.object({...metadata,type:z.literal('circle'),center:point,radius:positive}).strict(),
 z.object({...metadata,type:z.literal('arc'),center:point,radius:positive,startAngle:z.number().finite().min(-2*Math.PI).max(2*Math.PI),sweep:z.number().finite().min(-2*Math.PI).max(2*Math.PI)}).strict(),
]);
const base={id:uuid,enabled:z.boolean()};
const constraints=z.discriminatedUnion('type',[
 z.object({...base,type:z.literal('coincident'),a:ref,b:ref}).strict(),
 ...(['horizontal','vertical'] as const).map(type=>z.object({...base,type:z.literal(type),lineId:uuid}).strict()),
 ...(['parallel','perpendicular','equal-length'] as const).map(type=>z.object({...base,type:z.literal(type),lineA:uuid,lineB:uuid}).strict()),
 z.object({...base,type:z.literal('angle'),lineA:uuid,lineB:uuid,radians:z.number().finite().min(-Math.PI).max(Math.PI)}).strict(),
 z.object({...base,type:z.literal('fixed-point'),point:ref,target:point}).strict(),
 z.object({...base,type:z.literal('fixed-line'),lineId:uuid,start:point,end:point}).strict(),
 ...(['horizontal-distance','vertical-distance','distance'] as const).map(type=>z.object({...base,type:z.literal(type),a:ref,b:ref,metres:scalar}).strict()),
 ...(['line-length','radius','diameter'] as const).map(type=>z.object({...base,type:z.literal(type),...type==='line-length'?{lineId:uuid}:{circleId:uuid},metres:positive}).strict()),
]);
/** Strict structural validation at the untrusted HTTP boundary. No unknown CAD records are accepted. */
export const cadSourceSchema=z.object({schemaVersion:z.literal(1),id:uuid,plane:z.literal('XY'),units:z.literal('m'),revision:z.number().int().min(1).max(2147483647),entities:z.array(entity).max(32),constraints:z.array(constraints).max(64)}).strict().superRefine((source,ctx)=>{
 try { validateSketch(source as Sketch); } catch(e) { ctx.addIssue({code:'custom',message:e instanceof Error?e.message:'Invalid sketch'}); }
 const variables=source.entities.reduce((n,e)=>n+(e.type==='line'?4:e.type==='circle'?3:e.type==='arc'?5:2),0);
 const equations=source.constraints.reduce((n,c)=>n+(!c.enabled?0:c.type==='fixed-line'?4:(c.type==='fixed-point'||c.type==='coincident')?2:1),0);
 if(variables>32||equations>64)ctx.addIssue({code:'custom',message:'Experimental API is limited to 32 variables and 64 equations'});
});
/** Solve only after validation. Uncertain/inconsistent results are never persisted. */
export function solveCadSource(source:Sketch):Sketch {
 const result=solveSketch(source);
 if(!result.sketch)throw new Error(`${result.status}: ${result.diagnostics.join(' ')}`);
 return result.sketch;
}

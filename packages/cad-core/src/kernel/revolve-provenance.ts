import type {RevolvedSolid,RevolveFace} from './revolve-types.js';
export type RevolvedFaceResolution={status:'resolved';face:RevolveFace}|{status:'missing'|'ambiguous';candidateIds:string[]};
/** Never guess by distance or rendering indices. */
export function resolveRevolvedFace(previous:RevolveFace,next:RevolvedSolid):RevolvedFaceResolution {
 const p=previous.provenance;const matches=next.faces.filter(f=>f.provenance.operationId===p.operationId&&f.provenance.sourceSketchId===p.sourceSketchId&&f.provenance.role===p.role&&JSON.stringify([...f.provenance.sourceEntityIds].sort())===JSON.stringify([...p.sourceEntityIds].sort()));
 if(matches.length>1)return {status:'ambiguous',candidateIds:matches.map(f=>f.id)};
 if(matches.length===1&&matches[0].id===previous.id)return {status:'resolved',face:matches[0]};
 return {status:'missing',candidateIds:matches.map(f=>f.id)};
}

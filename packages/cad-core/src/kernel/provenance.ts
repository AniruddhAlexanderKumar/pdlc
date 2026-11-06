import type {Face,Solid} from './types.js';
export type FaceResolution={status:'resolved';face:Face}|{status:'missing'|'ambiguous';candidateIds:string[]};
/** Resolve only an exact persistent ID with matching ancestry. No nearest-point or index fallback. */
export function resolveFaceReference(previous:Face,next:Solid):FaceResolution {
 const p=previous.provenance;
 const matches=next.faces.filter(f=>f.provenance.operationId===p.operationId&&f.provenance.sourceSketchId===p.sourceSketchId&&f.provenance.role===p.role&&JSON.stringify([...f.provenance.sourceEntityIds].sort())===JSON.stringify([...p.sourceEntityIds].sort()));
 if(matches.length>1)return {status:'ambiguous',candidateIds:matches.map(f=>f.id)};
 if(matches.length===1&&matches[0].id===previous.id)return {status:'resolved',face:matches[0]};
 return {status:'missing',candidateIds:matches.map(f=>f.id)};
}

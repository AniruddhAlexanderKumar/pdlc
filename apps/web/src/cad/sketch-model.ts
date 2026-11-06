import {commitSketch, type Sketch, type SketchHistory} from '@sv/cad-core';

/** Ignore server-controlled attribution and revision when comparing an acknowledged submission. */
export function contentFingerprint(name:string,source:Sketch):string {
 return JSON.stringify({name,entities:source.entities.map(({ownerId: _owner,createdAt: _date,...entity})=>entity),constraints:source.constraints});
}
/** Client-side preflight mirrors the server's stricter resource caps. Server remains authoritative. */
export function transaction(history:SketchHistory,candidate:Sketch) {
 const vars=candidate.entities.reduce((n,e)=>n+(e.type==='line'?4:e.type==='point'?2:e.type==='circle'?3:5),0);
 const equations=candidate.constraints.reduce((n,c)=>n+(!c.enabled?0:c.type==='fixed-line'?4:c.type==='fixed-point'||c.type==='coincident'?2:1),0);
 if(candidate.entities.length>32||candidate.constraints.length>64||vars>32||equations>64)throw new Error('Sketch exceeds the experimental API limit (32 variables / 64 equations).');
 return commitSketch(history,candidate);
}
export function rebaseHistory(history:SketchHistory,source:Sketch):SketchHistory {
 const revision=source.revision;
 return {current:source,undo:history.undo.map(s=>({...s,revision})),redo:history.redo.map(s=>({...s,revision}))};
}

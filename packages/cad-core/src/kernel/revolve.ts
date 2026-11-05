import {coordinate,distance2,type Vec3} from '../math.js';
import type {LineEntity} from '../geometry.js';
import {validateSketch,type Sketch} from '../sketch.js';
import {solveSketch} from '../solver.js';
import {toleranceFor} from './numerics.js';
import {evaluateRevolveCurve} from './revolve-geometry.js';
import {checkRevolution} from './revolve-validation.js';
import type {Frame3} from './geometry.js';
import type {KernelResult} from './types.js';
import type {PCurve,RevolveCoedge,RevolveEdge,RevolveFace,RevolveLoop,RevolveProvenance,RevolvedSolid,RevolveSurface,RevolveVertex} from './revolve-types.js';

export type RevolveInput={sketch:Sketch;operationId:string;axis:{origin:Vec3;direction:Vec3};startAngle:number;sweep:number};
export type RevolveOutput={solid:RevolvedSolid;solvedSketch:Sketch};
type Side='inner'|'outer';type Level='bottom'|'top';type End='start'|'end';
type Use={edge:string;dir:1|-1;seam?:0|1};
const fail=(code:string,message:string):KernelResult<never>=>({ok:false,diagnostics:[{code,message}]});
/** Narrow analytical operation: offset rectangular line sketch about the in-plane +Y axis. */
export function revolveSketch(input:RevolveInput):KernelResult<RevolveOutput> {
 try{
  if(!input||typeof input.operationId!=='string'||!input.operationId.trim()||input.operationId.length>200)return fail('INVALID_OPERATION','Operation ID required');
  validateSketch(input.sketch);if(input.sketch.id.length>200||input.sketch.entities.some(e=>e.id.length>200))return fail('RESOURCE_LIMIT','IDs are too long');
  if(!Array.isArray(input.axis?.origin)||input.axis.origin.length!==3||!Array.isArray(input.axis.direction)||input.axis.direction.length!==3)return fail('INVALID_AXIS','Axis must be a finite 3D vector');input.axis.origin.forEach(coordinate);input.axis.direction.forEach(coordinate);
  if(input.axis.origin[2]!==0||input.axis.direction[0]!==0||input.axis.direction[1]!==1||input.axis.direction[2]!==0)return fail('UNSUPPORTED_AXIS','Only the sketch-plane axis parallel to +Y is supported');
  if(!Number.isFinite(input.startAngle)||Math.abs(input.startAngle)>1e6||!Number.isFinite(input.sweep)||Math.abs(input.sweep)>2*Math.PI+1e-12||Math.abs(input.sweep)<=1e-9)return fail('INVALID_SWEEP','Sweep must be nonzero and at most one turn');
  const abs=Math.abs(input.sweep),full=Math.abs(abs-2*Math.PI)<=1e-12;if(!full&&abs>2*Math.PI-1e-8)return fail('UNCERTAIN_SWEEP','Nearly full sweep is numerically ambiguous');
  const solved=solveSketch(input.sketch);if(!solved.sketch)return fail('SKETCH_SOLVER',solved.diagnostics.join(' '));const sketch=solved.sketch,entities=sketch.entities.filter(e=>!e.construction);
  if(entities.length!==4||entities.some(e=>e.type!=='line'))return fail('UNSUPPORTED_PROFILE','Requires four line entities forming one rectangle');const lines=entities as LineEntity[];
  const pts=lines.flatMap(l=>[l.start,l.end]);const xmin=Math.min(...pts.map(p=>p[0])),xmax=Math.max(...pts.map(p=>p[0])),ymin=Math.min(...pts.map(p=>p[1])),ymax=Math.max(...pts.map(p=>p[1]));const inner=xmin-input.axis.origin[0],outer=xmax-input.axis.origin[0];
  const tol0=toleranceFor([[xmin,ymin,0],[xmax,ymax,0],[input.axis.origin[0]-Math.abs(outer),ymin,0]]).lengthMetres;
  if(inner<=tol0)return fail('AXIS_INTERSECTION','Profile touches, crosses, or lies behind the revolution axis');
  if(outer-inner<=tol0||ymax-ymin<=tol0)return fail('DEGENERATE_PROFILE','Profile has degenerate dimensions');
  if(!full&&inner*abs<=tol0*4)return fail('UNCERTAIN_SWEEP','Angular sweep is too small for model tolerance');
  const sideIds=new Map<string,string>();
  for(const l of lines){const [a,b]=[l.start,l.end];let side='';
   if(Math.abs(a[0]-b[0])<=tol0&&Math.abs(Math.abs(a[1]-b[1])-(ymax-ymin))<=tol0){if(Math.abs(a[0]-xmin)<=tol0&&Math.abs(b[0]-xmin)<=tol0)side='inner';else if(Math.abs(a[0]-xmax)<=tol0&&Math.abs(b[0]-xmax)<=tol0)side='outer';}
   else if(Math.abs(a[1]-b[1])<=tol0&&Math.abs(Math.abs(a[0]-b[0])-(xmax-xmin))<=tol0){if(Math.abs(a[1]-ymin)<=tol0&&Math.abs(b[1]-ymin)<=tol0)side='bottom';else if(Math.abs(a[1]-ymax)<=tol0&&Math.abs(b[1]-ymax)<=tol0)side='top';}
   if(!side||sideIds.has(side))return fail('UNSUPPORTED_PROFILE','Profile must be a non-branching axis-aligned rectangle');sideIds.set(side,l.id);
  }
  if(sideIds.size!==4)return fail('OPEN_PROFILE','Rectangle sides do not form one closed profile');
  const sweep=full?Math.sign(input.sweep)*2*Math.PI:input.sweep;const solid=build(sketch,input.operationId,input.axis.origin[0],inner,outer,ymin,ymax,input.startAngle%(2*Math.PI),sweep,full,sideIds);
  const diagnostics=checkRevolution(solid);if(diagnostics.length)return {ok:false,diagnostics};return {ok:true,value:{solid,solvedSketch:sketch}};
 }catch(e){return fail('INVALID_INPUT',e instanceof Error?e.message:'Invalid revolution input');}
}
function build(sketch:Sketch,operationId:string,axisX:number,inner:number,outer:number,ymin:number,ymax:number,startAngle:number,sweep:number,full:boolean,sideIds:Map<string,string>):RevolvedSolid {
 const root=`revolve/${encodeURIComponent(operationId)}`,all=[...sideIds.values()].sort();const prov=(role:string,ids:string[]):RevolveProvenance=>({operation:'revolve',operationId,sourceSketchId:sketch.id,sourceRevision:sketch.revision,sourceEntityIds:[...ids].sort(),role});
 const frame:Frame3={origin:[axisX,0,0],x:[1,0,0],y:[0,0,-1],z:[0,1,0]};const radius=(s:Side)=>s==='inner'?inner:outer,level=(l:Level)=>l==='bottom'?ymin:ymax;
 const point=(r:number,y:number,t:number):Vec3=>[axisX+r*Math.cos(startAngle+sweep*t),y,-r*Math.sin(startAngle+sweep*t)];
 const vertices:RevolveVertex[]=[],edges:RevolveEdge[]=[],coedges:RevolveCoedge[]=[],loops:RevolveLoop[]=[],faces:RevolveFace[]=[];const vertexMap=new Map<string,RevolveVertex>(),edgeMap=new Map<string,RevolveEdge>();
 const key=(s:Side,l:Level,e:End)=>`${s}-${l}-${full?'start':e}`;
 for(const s of ['inner','outer'] as const)for(const l of ['bottom','top'] as const)for(const e of (full?['start']:['start','end']) as End[]){const k=key(s,l,e),v:RevolveVertex={id:`${root}/v/${k}`,point:point(radius(s),level(l),e==='start'?0:1),edgeIds:[],provenance:prov('vertex',[sideIds.get(s)!,sideIds.get(l)!])};vertices.push(v);vertexMap.set(k,v);}
 function addEdge(k:string,start:string,end:string,curve:RevolveEdge['curve'],sourceIds:string[]){const va=vertexMap.get(start)!,vb=vertexMap.get(end)!,edge:RevolveEdge={id:`${root}/e/${k}`,curve,startVertexId:va.id,endVertexId:vb.id,coedgeIds:[],provenance:prov(k,sourceIds)};edges.push(edge);edgeMap.set(k,edge);va.edgeIds.push(edge.id);if(va!==vb)vb.edgeIds.push(edge.id);}
 for(const s of ['inner','outer'] as const)for(const l of ['bottom','top'] as const){const r=radius(s),y=level(l);addEdge(`circle-${s}-${l}`,key(s,l,'start'),key(s,l,'end'),{kind:'circular-arc',frame:{...frame,origin:[axisX,y,0]},radius:r,startAngle,sweep},[sideIds.get(s)!,sideIds.get(l)!]);}
 for(const s of ['inner','outer'] as const)for(const e of (full?['start']:['start','end']) as End[]){addEdge(`axial-${s}-${e}`,key(s,'bottom',e),key(s,'top',e),{kind:'segment',start:point(radius(s),ymin,e==='start'?0:1),end:point(radius(s),ymax,e==='start'?0:1)},[sideIds.get(s)!]);}
 if(!full)for(const l of ['bottom','top'] as const)for(const e of ['start','end'] as const){addEdge(`radial-${l}-${e}`,key('inner',l,e),key('outer',l,e),{kind:'segment',start:point(inner,level(l),e==='start'?0:1),end:point(outer,level(l),e==='start'?0:1)},[sideIds.get(l)!]);}
 const reversed=(items:Use[])=>[...items].reverse().map(x=>({...x,dir:-x.dir as 1|-1}));
 const reverseP=(p:PCurve):PCurve=>p.kind==='line'?{kind:'line',start:p.end,end:p.start}:{...p,startAngle:p.startAngle+p.sweep,sweep:-p.sweep};
 const fwdP=(faceKind:'cylinder'|'cap'|'cut',use:Use):PCurve=>{const parts=use.edge.split('-');if(faceKind==='cylinder'){
   if(parts[0]==='circle'){const l=parts[2] as Level;return {kind:'line',start:[0,level(l)],end:[1,level(l)]};}
   const seam=use.seam??(parts[2]==='end'?1:0);return {kind:'line',start:[seam,ymin],end:[seam,ymax]};
  }if(faceKind==='cap'){
   if(parts[0]==='circle')return {kind:'arc',radius:radius(parts[1] as Side),startAngle,sweep};
   const a=startAngle+(parts[2]==='end'?sweep:0);return {kind:'line',start:[inner*Math.cos(a),inner*Math.sin(a)],end:[outer*Math.cos(a),outer*Math.sin(a)]};
  }
  if(parts[0]==='axial'){const r=radius(parts[1] as Side);return {kind:'line',start:[r,ymin],end:[r,ymax]};}const y=level(parts[1] as Level);return {kind:'line',start:[inner,y],end:[outer,y]};
 };
 function face(id:string,surface:RevolveSurface,orientation:1|-1,groups:{kind:'outer'|'inner';uses:Use[]}[],kind:'cylinder'|'cap'|'cut',sourceIds:string[]){const fid=`${root}/f/${id}`,loopIds:string[]=[];
  for(const g of groups){const lid=`${fid}/loop/${g.kind}`,uses=g.uses.map(u=>{const e=edgeMap.get(u.edge)!;const p=fwdP(kind,u),c:RevolveCoedge={id:`${lid}/use/${u.edge}/${u.seam??'x'}/${u.dir}`,edgeId:e.id,orientation:u.dir,loopId:lid,previousId:'',nextId:'',pcurve:u.dir===1?p:reverseP(p)};e.coedgeIds.push(c.id);return c;});
   uses.forEach((u,i)=>{u.previousId=uses[(i+uses.length-1)%uses.length].id;u.nextId=uses[(i+1)%uses.length].id;coedges.push(u)});loops.push({id:lid,faceId:fid,kind:g.kind,coedgeIds:uses.map(u=>u.id)});loopIds.push(lid);
  }faces.push({id:fid,surface,orientation,outerLoopId:loopIds[0],innerLoopIds:loopIds.slice(1),adjacentFaceIds:[],provenance:prov(id,sourceIds)});
 }
 const sign=Math.sign(sweep) as 1|-1,maybeReverse=(a:Use[])=>sign===1?a:reversed(a);
 const cylinderUses=(s:Side):Use[]=>[{edge:`circle-${s}-bottom`,dir:1},{edge:`axial-${s}-${full?'start':'end'}`,dir:1,seam:1},{edge:`circle-${s}-top`,dir:-1},{edge:`axial-${s}-start`,dir:-1,seam:0}];
 for(const s of ['inner','outer'] as const){let u=maybeReverse(cylinderUses(s));if(s==='inner')u=reversed(u);face(s,{kind:'cylinder',frame,radius:radius(s),startAngle,sweep,axialRange:[ymin,ymax]},s==='outer'?sign:-sign as 1|-1,[{kind:'outer',uses:u}],'cylinder',[sideIds.get(s)!]);}
 for(const l of ['bottom','top'] as const){let groups:{kind:'outer'|'inner';uses:Use[]}[];
  if(full){let outerUses=maybeReverse([{edge:`circle-outer-${l}`,dir:1}]),innerUses=maybeReverse([{edge:`circle-inner-${l}`,dir:-1}]);if(l==='bottom'){outerUses=reversed(outerUses);innerUses=reversed(innerUses)}groups=[{kind:'outer',uses:outerUses},{kind:'inner',uses:innerUses}];}
  else {let uses=maybeReverse([{edge:`circle-outer-${l}`,dir:1},{edge:`radial-${l}-end`,dir:-1},{edge:`circle-inner-${l}`,dir:-1},{edge:`radial-${l}-start`,dir:1}]);if(l==='bottom')uses=reversed(uses);groups=[{kind:'outer',uses}];}
  face(l,{kind:'plane',origin:[axisX,level(l),0],uAxis:frame.x,vAxis:frame.y},l==='top'?1:-1,groups,'cap',[sideIds.get(l)!]);
 }
 if(!full)for(const end of ['start','end'] as const){let uses:Use[]=[{edge:`radial-bottom-${end}`,dir:1},{edge:`axial-outer-${end}`,dir:1},{edge:`radial-top-${end}`,dir:-1},{edge:`axial-inner-${end}`,dir:-1}];if(end==='end')uses=reversed(uses);uses=maybeReverse(uses);const a=startAngle+(end==='end'?sweep:0);face(`cut-${end}`,{kind:'plane',origin:[axisX,0,0],uAxis:[Math.cos(a),0,-Math.sin(a)],vAxis:[0,1,0]},end==='start'?sign:-sign as 1|-1,[{kind:'outer',uses}],'cut',all);}
 const lm=new Map(loops.map(l=>[l.id,l]));for(const f of faces){const adjacent=new Set<string>();for(const lid of [f.outerLoopId,...f.innerLoopIds])for(const cid of lm.get(lid)!.coedgeIds){const c=coedges.find(x=>x.id===cid)!;for(const o of coedges.filter(x=>x.edgeId===c.edgeId&&x.id!==cid)){const id=lm.get(o.loopId)!.faceId;if(id!==f.id)adjacent.add(id);}}f.adjacentFaceIds=[...adjacent].sort();}
 const tolerance=toleranceFor(vertices.map(v=>v.point).concat([[axisX+outer,ymin,0],[axisX-outer,ymax,0],[axisX,ymax,outer],[axisX,ymin,-outer]]));
 return {kind:'rectangular-revolution',id:`${root}/solid`,vertices,edges,coedges,loops,faces,shell:{id:`${root}/shell`,faceIds:faces.map(f=>f.id),closed:true},tolerance,parameters:{axisX,innerRadius:inner,outerRadius:outer,axialMin:ymin,axialMax:ymax,startAngle,sweep,full},provenance:prov('solid',all)};
}

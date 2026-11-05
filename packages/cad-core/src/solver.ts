import { coordinate, LENGTH_EPSILON_METRES, type Vec2 } from './math.js';
import { validateSketch, type PointRef, type Sketch, type SketchConstraint, type SketchEntity } from './sketch.js';

export type SolverStatus = 'underconstrained'|'fully-constrained'|'redundant'|'inconsistent'|'uncertain';
export type SolveResult = { status:SolverStatus; dof:number|null; rank:number|null; iterations:number; maxResidual:number; diagnostics:string[]; conflictingConstraintIds:string[]; sketch:Sketch|null };
const MAX_ITERATIONS=100;
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const samePoint=(a:PointRef,b:PointRef)=>a.entityId===b.entityId&&a.point===b.point;
function directConflicts(constraints:SketchConstraint[]):string[] {
 const active=constraints.filter(c=>c.enabled);const out=new Set<string>();
 for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){
  const a=active[i],b=active[j];let different=false;
  if(a.type==='line-length'&&b.type==='line-length'&&a.lineId===b.lineId)different=Math.abs(a.metres-b.metres)>1e-10;
  if((a.type==='radius'||a.type==='diameter')&&(b.type==='radius'||b.type==='diameter')&&a.circleId===b.circleId)different=Math.abs(a.metres/(a.type==='diameter'?2:1)-b.metres/(b.type==='diameter'?2:1))>1e-10;
  if((a.type==='horizontal-distance'||a.type==='vertical-distance'||a.type==='distance')&&a.type===b.type&&samePoint(a.a,b.a)&&samePoint(a.b,b.b))different=Math.abs(a.metres-b.metres)>1e-10;
  if(a.type==='fixed-point'&&b.type==='fixed-point'&&samePoint(a.point,b.point))different=Math.hypot(a.target[0]-b.target[0],a.target[1]-b.target[1])>1e-10;
  if(different){out.add(a.id);out.add(b.id)}
 }
 return [...out];
}
/** Rank estimate via pivoted elimination. Close-to-threshold pivots are uncertain. */
function estimateRank(input:number[][], columns:number):{rank:number; uncertain:boolean} {
 if(!input.length||columns===0)return {rank:0,uncertain:false};
 const a=input.map(row=>[...row]),rows=a.length,max=Math.max(...a.flat().map(Math.abs));if(max===0)return {rank:0,uncertain:rows>0};
 let rank=0,uncertain=a.some(row=>Math.max(...row.map(Math.abs))<=max*1e-10);const tolerance=max*1e-8;
 for(let col=0;col<columns&&rank<rows;col++){
  let p=rank;for(let r=rank+1;r<rows;r++)if(Math.abs(a[r][col])>Math.abs(a[p][col]))p=r;
  const pivot=Math.abs(a[p][col]);if(pivot>tolerance*0.1&&pivot<tolerance*10)uncertain=true;
  if(pivot<=tolerance)continue;
  [a[rank],a[p]]=[a[p],a[rank]];for(let r=rank+1;r<rows;r++){const k=a[r][col]/a[rank][col];for(let c=col;c<columns;c++)a[r][c]-=k*a[rank][c];}rank++;
 }
 return {rank,uncertain};
}
/** Damped least squares via column-pivoted modified Gram-Schmidt QR, not normal equations. */
function leastSquares(A:number[][], b:number[], n:number):number[] {
 const m=A.length,cols=Array.from({length:n},(_,j)=>A.map(row=>row[j])),perm=Array.from({length:n},(_,i)=>i);
 const R=Array.from({length:n},()=>Array<number>(n).fill(0)),qtb=Array<number>(n).fill(0);
 const dot=(a:number[],b:number[])=>a.reduce((s,x,i)=>s+x*b[i],0);
 for(let k=0;k<n;k++){
  let best=k;for(let j=k+1;j<n;j++)if(dot(cols[j],cols[j])>dot(cols[best],cols[best]))best=j;
  if(best!==k){[cols[k],cols[best]]=[cols[best],cols[k]];[perm[k],perm[best]]=[perm[best],perm[k]];for(let i=0;i<k;i++)[R[i][k],R[i][best]]=[R[i][best],R[i][k]];}
  const norm=Math.sqrt(dot(cols[k],cols[k]));if(!Number.isFinite(norm)||norm<1e-18)throw new Error('Singular damped system');
  R[k][k]=norm;const q=cols[k].map(x=>x/norm);qtb[k]=dot(q,b);
  for(let j=k+1;j<n;j++){let r=dot(q,cols[j]);for(let i=0;i<m;i++)cols[j][i]-=r*q[i];const correction=dot(q,cols[j]);for(let i=0;i<m;i++)cols[j][i]-=correction*q[i];R[k][j]=r+correction;}
 }
 const y=Array<number>(n).fill(0),x=Array<number>(n).fill(0);
 for(let i=n-1;i>=0;i--){let s=qtb[i];for(let j=i+1;j<n;j++)s-=R[i][j]*y[j];y[i]=s/R[i][i];}
 for(let i=0;i<n;i++)x[perm[i]]=y[i];return x;
}
function pointValues(e:SketchEntity):Vec2[] { return e.type==='point'?[e.position]:e.type==='line'?[e.start,e.end]:[e.center]; }
function buildSystem(sketch:Sketch){
 const all=sketch.entities.flatMap(pointValues),origin:Vec2=all[0]??[0,0];
 const lengths=sketch.entities.flatMap(e=>e.type==='line'?[Math.hypot(e.end[0]-e.start[0],e.end[1]-e.start[1])]:(e.type==='circle'||e.type==='arc')?[e.radius]:[]);
 const spreads=all.map(p=>Math.hypot(p[0]-origin[0],p[1]-origin[1]));
 const scale=Math.max(1e-6,Math.min(1e3,Math.max(...lengths,...spreads,1e-6)));
 if(lengths.some(length=>length<scale*1e-5))throw new Error('Feature scale is too small relative to the sketch for this numerical solver');
 const offsets=new Map<string,number>(),x:number[]=[];
 for(const e of sketch.entities){offsets.set(e.id,x.length);for(const p of pointValues(e))x.push((p[0]-origin[0])/scale,(p[1]-origin[1])/scale);if(e.type==='circle'||e.type==='arc')x.push(e.radius/scale);if(e.type==='arc')x.push(e.startAngle,e.sweep);}
 const entities=new Map(sketch.entities.map(e=>[e.id,e]));
 function point(v:number[],ref:PointRef):Vec2 {const e=entities.get(ref.entityId)!,i=offsets.get(ref.entityId)!+(e.type==='line'&&ref.point==='end'?2:0);return [v[i],v[i+1]];}
 function line(v:number[],id:string):Vec2 {const i=offsets.get(id)!;return [v[i+2]-v[i],v[i+3]-v[i+1]];}
 function len(v:Vec2){return Math.hypot(...v)}
 function target(p:Vec2):Vec2{return [(p[0]-origin[0])/scale,(p[1]-origin[1])/scale]}
 function residual(v:number[]):number[]{
  const out:number[]=[];
  for(const c of sketch.constraints){if(!c.enabled)continue;
   switch(c.type){
    case 'coincident':{const a=point(v,c.a),b=point(v,c.b);out.push(a[0]-b[0],a[1]-b[1]);break;}
    case 'horizontal':out.push(line(v,c.lineId)[1]);break;
    case 'vertical':out.push(line(v,c.lineId)[0]);break;
    case 'fixed-point':{const p=point(v,c.point),t=target(c.target);out.push(p[0]-t[0],p[1]-t[1]);break;}
    case 'fixed-line':{const i=offsets.get(c.lineId)!,a=target(c.start),b=target(c.end);out.push(v[i]-a[0],v[i+1]-a[1],v[i+2]-b[0],v[i+3]-b[1]);break;}
    case 'horizontal-distance':case 'vertical-distance':case 'distance':{const a=point(v,c.a),b=point(v,c.b),dx=b[0]-a[0],dy=b[1]-a[1];out.push((c.type==='horizontal-distance'?dx:c.type==='vertical-distance'?dy:Math.hypot(dx,dy))-c.metres/scale);break;}
    case 'line-length':out.push(len(line(v,c.lineId))-c.metres/scale);break;
    case 'radius':case 'diameter':out.push(v[offsets.get(c.circleId)!+2]*(c.type==='radius'?1:2)-c.metres/scale);break;
    case 'parallel':case 'perpendicular':case 'equal-length':case 'angle':{const a=line(v,c.lineA),b=line(v,c.lineB),la=len(a),lb=len(b);if(la*scale<=LENGTH_EPSILON_METRES||lb*scale<=LENGTH_EPSILON_METRES)throw new Error('Degenerate line in constraint');
     const dot=a[0]*b[0]+a[1]*b[1],cross=a[0]*b[1]-a[1]*b[0];out.push(c.type==='parallel'?cross/(la*lb):c.type==='perpendicular'?dot/(la*lb):c.type==='angle'?wrap(Math.atan2(cross,dot)-c.radians):la-lb);break;}
   }
  }
  if(out.some(n=>!Number.isFinite(n)))throw new Error('Nonfinite residual');return out;
 }
 function unpack(v:number[]):Sketch {let i=0;const entities=sketch.entities.map(e=>{
   const p=():Vec2=>[coordinate(origin[0]+v[i++]*scale),coordinate(origin[1]+v[i++]*scale)];
   if(e.type==='point')return {...e,position:p()};if(e.type==='line')return {...e,start:p(),end:p()};const center=p(),radius=coordinate(v[i++]*scale);if(e.type==='circle')return {...e,center,radius};return {...e,center,radius,startAngle:v[i++],sweep:v[i++]};
  });const out={...sketch,entities};validateSketch(out);return out;}
 return {x,residual,unpack,scale};
}
function jacobian(x:number[],evalResidual:(v:number[])=>number[],r:number[]):number[][] {
 const out=Array.from({length:r.length},()=>Array<number>(x.length).fill(0));
 for(let j=0;j<x.length;j++){const h=1e-6*Math.max(1,Math.abs(x[j]));const a=[...x],b=[...x];a[j]+=h;b[j]-=h;const f=evalResidual(a),g=evalResidual(b);for(let i=0;i<r.length;i++)out[i][j]=(f[i]-g[i])/(2*h);}
 return out;
}
/** Experimental numerical solver; does not mutate input or claim globally unique solutions. */
export function solveSketch(input:Sketch):SolveResult {
 const fail=(message:string,iterations=0,maxResidual=Infinity):SolveResult=>({status:'uncertain',dof:null,rank:null,iterations,maxResidual,diagnostics:[message],conflictingConstraintIds:[],sketch:null});
 try{validateSketch(input)}catch(e){return fail(e instanceof Error?e.message:'Invalid sketch');}
 const conflicts=directConflicts(input.constraints);if(conflicts.length)return {status:'inconsistent',dof:null,rank:null,iterations:0,maxResidual:Infinity,diagnostics:['Conflicting values target the same constraint.'],conflictingConstraintIds:conflicts,sketch:null};
 let iterations=0,maxResidual=Infinity;
 try {
  const sys=buildSystem(input);let x=[...sys.x],r=sys.residual(x),lambda=1e-3;
  if(x.length>64||r.length>128)return fail('Experimental solver limit exceeded (64 variables / 128 equations).');
  const tolerance=Math.min(1e-9,1e-9/sys.scale);const norm=(values:number[])=>values.reduce((s,v)=>s+v*v,0);
  for(;iterations<MAX_ITERATIONS;iterations++){
   maxResidual=Math.max(0,...r.map(Math.abs));if(maxResidual<=tolerance)break;
   if(x.length===0)break;
   const j=jacobian(x,sys.residual,r),A=[...j,...Array.from({length:x.length},(_,i)=>Array.from({length:x.length},(_,k)=>i===k?Math.sqrt(lambda):0))],b=[...r.map(v=>-v),...Array<number>(x.length).fill(0)];
   const delta=leastSquares(A,b,x.length);const candidate=x.map((v,i)=>v+delta[i]);
   let nr:number[];try{sys.unpack(candidate);nr=sys.residual(candidate);}catch{lambda*=10;if(lambda>1e16)break;continue;}
   if(norm(nr)<norm(r)){x=candidate;r=nr;lambda=Math.max(lambda/3,1e-12);}else lambda*=10;
   if(lambda>1e16)break;
  }
  maxResidual=Math.max(0,...r.map(Math.abs));
  if(maxResidual>tolerance)return fail('Solver did not converge; the system may be inconsistent or numerically singular.',iterations,maxResidual);
  const solved=sys.unpack(x),j=jacobian(x,sys.residual,r),rank=estimateRank(j,x.length);
  if(rank.uncertain)return {status:'uncertain',dof:null,rank:rank.rank,iterations,maxResidual,diagnostics:['Jacobian rank is numerically uncertain.'],conflictingConstraintIds:[],sketch:null};
  const dof=x.length-rank.rank, redundant=j.length>rank.rank;
  return {status:redundant?'redundant':dof===0?'fully-constrained':'underconstrained',dof,rank:rank.rank,iterations,maxResidual,diagnostics:redundant?['Constraint equations are linearly dependent at this solution; redundancy is not localized.']:[],conflictingConstraintIds:[],sketch:solved};
 } catch(e){return fail(e instanceof Error?e.message:'Solver failed',iterations,maxResidual)}
}
/** Reject invalid or uncertain changes, preserving the last committed sketch. */
export function tryConstraintChange(original:Sketch, constraints:SketchConstraint[]):{accepted:boolean; sketch:Sketch; result:SolveResult} {
 const result=solveSketch({...original,constraints});
 if(!result.sketch)return {accepted:false,sketch:original,result};
 return {accepted:true,sketch:result.sketch,result};
}

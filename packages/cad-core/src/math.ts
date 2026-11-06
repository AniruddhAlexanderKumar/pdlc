/** Native CAD numerics: metres internally; row-major matrices, column vectors. */
export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Matrix = readonly (readonly number[])[];
export const MAX_COORDINATE_METRES = 1e6;
export const LENGTH_EPSILON_METRES = 1e-10;
export function finiteNumber(n: number, name = 'number'): number {
  if (!Number.isFinite(n)) throw new RangeError(`${name} must be finite`);
  return n;
}
export function coordinate(n: number): number {
  finiteNumber(n, 'coordinate');
  if (Math.abs(n) > MAX_COORDINATE_METRES) throw new RangeError('coordinate exceeds bound');
  return Object.is(n, -0) ? 0 : n;
}
export const mmToMetres = (n:number):number => coordinate(finiteNumber(n, 'millimetres') / 1000);
export const metresToMm = (n:number):number => coordinate(n) * 1000;
function v2(a:Vec2):void { if(!Array.isArray(a)||a.length!==2)throw new RangeError('Expected a 2D vector');a.forEach(x=>finiteNumber(x,'vector element')); }
function v3(a:Vec3):void { if(!Array.isArray(a)||a.length!==3)throw new RangeError('Expected a 3D vector');a.forEach(x=>finiteNumber(x,'vector element')); }
const r2=(x:number,y:number):Vec2=>[finiteNumber(x,'vector result'),finiteNumber(y,'vector result')];
const r3=(x:number,y:number,z:number):Vec3=>[finiteNumber(x,'vector result'),finiteNumber(y,'vector result'),finiteNumber(z,'vector result')];
export function add2(a:Vec2,b:Vec2):Vec2 { v2(a);v2(b);return r2(a[0]+b[0],a[1]+b[1]); }
export function sub2(a:Vec2,b:Vec2):Vec2 { v2(a);v2(b);return r2(a[0]-b[0],a[1]-b[1]); }
export function scale2(a:Vec2,s:number):Vec2 { v2(a);finiteNumber(s);return r2(a[0]*s,a[1]*s); }
export function dot2(a:Vec2,b:Vec2):number { v2(a);v2(b);return finiteNumber(a[0]*b[0]+a[1]*b[1]); }
export function cross2(a:Vec2,b:Vec2):number { v2(a);v2(b);return finiteNumber(a[0]*b[1]-a[1]*b[0]); }
export function magnitude2(a:Vec2):number { v2(a);return finiteNumber(Math.hypot(...a)); }
export function distance2(a:Vec2,b:Vec2):number { return magnitude2(sub2(a,b)); }
export function normalize2(a:Vec2):Vec2 { const m=magnitude2(a); if(m<=LENGTH_EPSILON_METRES)throw new RangeError('Cannot normalize degenerate vector');return scale2(a,1/m); }
export function project2(a:Vec2,onto:Vec2):Vec2 { const v=normalize2(onto);return scale2(v,dot2(a,v)); }
export function angle2(a:Vec2,b:Vec2):number { const x=normalize2(a),y=normalize2(b);return Math.atan2(cross2(x,y),dot2(x,y)); }
export function add3(a:Vec3,b:Vec3):Vec3 { v3(a);v3(b);return r3(a[0]+b[0],a[1]+b[1],a[2]+b[2]); }
export function sub3(a:Vec3,b:Vec3):Vec3 { v3(a);v3(b);return r3(a[0]-b[0],a[1]-b[1],a[2]-b[2]); }
export function scale3(a:Vec3,s:number):Vec3 { v3(a);finiteNumber(s);return r3(a[0]*s,a[1]*s,a[2]*s); }
export function dot3(a:Vec3,b:Vec3):number { v3(a);v3(b);return finiteNumber(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]); }
export function cross3(a:Vec3,b:Vec3):Vec3 { v3(a);v3(b);return r3(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]); }
export function magnitude3(a:Vec3):number { v3(a);return finiteNumber(Math.hypot(...a)); }
export function distance3(a:Vec3,b:Vec3):number { return magnitude3(sub3(a,b)); }
export function normalize3(a:Vec3):Vec3 { const m=magnitude3(a);if(m<=LENGTH_EPSILON_METRES)throw new RangeError('Cannot normalize degenerate vector');return scale3(a,1/m); }
export function project3(a:Vec3,onto:Vec3):Vec3 { const v=normalize3(onto);return scale3(v,dot3(a,v)); }
export function angle3(a:Vec3,b:Vec3):number { const x=normalize3(a),y=normalize3(b);return Math.atan2(magnitude3(cross3(x,y)),dot3(x,y)); }
function dimensions(m:Matrix):[number,number] {
  if(!m.length||!m[0].length||m.some(r=>r.length!==m[0].length)) throw new RangeError('Matrix must be nonempty and rectangular');
  for(const row of m)for(const x of row)finiteNumber(x,'matrix element');
  return [m.length,m[0].length];
}
export function multiply(a:Matrix,b:Matrix):number[][] {
  const [ar,ac]=dimensions(a),[br,bc]=dimensions(b);if(ac!==br)throw new RangeError('Incompatible matrix dimensions');
  return Array.from({length:ar},(_,i)=>Array.from({length:bc},(_,j)=>{let sum=0;for(let k=0;k<ac;k++)sum+=a[i][k]*b[k][j];return finiteNumber(sum,'matrix result')}));
}
/** Gauss-Jordan elimination with partial pivoting. Rejects near-singular inputs. */
function eliminate(matrix:Matrix, inverse:boolean):{ determinant:number; inverse:number[][] } {
  const [n,m]=dimensions(matrix);if(n!==m||n<2||n>4)throw new RangeError('Expected square 2x2, 3x3 or 4x4 matrix');
  const a=matrix.map((row,i)=>[...row,...Array.from({length:n},(_,j)=>i===j?1:0)]);
  const max=Math.max(...matrix.flat().map(Math.abs));if(max===0)throw new RangeError('Singular matrix');
  let det=1;
  for(let col=0;col<n;col++){
    let pivot=col;for(let r=col+1;r<n;r++)if(Math.abs(a[r][col])>Math.abs(a[pivot][col]))pivot=r;
    if(Math.abs(a[pivot][col])<=max*1e-14)throw new RangeError('Singular or numerically ill-conditioned matrix');
    if(pivot!==col){[a[pivot],a[col]]=[a[col],a[pivot]];det=-det;}
    const p=a[col][col];det*=p;for(let j=0;j<2*n;j++)a[col][j]/=p;
    for(let i=0;i<n;i++){if(i===col)continue;const f=a[i][col];for(let j=0;j<2*n;j++)a[i][j]-=f*a[col][j];}
  }
  return {determinant:finiteNumber(det,'determinant'),inverse:inverse?a.map(row=>row.slice(n).map(x=>finiteNumber(x,'inverse element'))):[]};
}
export function determinant(m:Matrix):number {
  const [n,cols]=dimensions(m);if(n!==cols||n<2||n>4)throw new RangeError('Expected square 2x2, 3x3 or 4x4 matrix');
  const a=m.map(row=>[...row]);let det=1;
  for(let c=0;c<n;c++){let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
    if(a[pivot][c]===0)return 0;if(pivot!==c){[a[pivot],a[c]]=[a[c],a[pivot]];det=-det;}const p=a[c][c];det*=p;
    for(let r=c+1;r<n;r++){const f=a[r][c]/p;for(let j=c+1;j<n;j++)a[r][j]-=f*a[c][j];}
  }return finiteNumber(det,'determinant');
}
export function invert(m:Matrix):number[][] { return eliminate(m,true).inverse; }
export function rotation2(angle:number):number[][] { finiteNumber(angle,'angle');const c=Math.cos(angle),s=Math.sin(angle);return [[c,-s],[s,c]]; }
export function transform2(angle:number,translation:Vec2):number[][] { v2(translation);const [x,y]=translation;coordinate(x);coordinate(y);const [[c,ns],[s]]=rotation2(angle);return [[c,ns,x],[s,c,y],[0,0,1]]; }
export function translation3(v:Vec3):number[][] { v3(v);const [x,y,z]=v.map(coordinate);return [[1,0,0,x],[0,1,0,y],[0,0,1,z],[0,0,0,1]]; }
export function rotation3(axis:'x'|'y'|'z',angle:number):number[][] {
 finiteNumber(angle,'angle');const c=Math.cos(angle),s=Math.sin(angle);
 if(axis==='x')return [[1,0,0,0],[0,c,-s,0],[0,s,c,0],[0,0,0,1]];
 if(axis==='y')return [[c,0,s,0],[0,1,0,0],[-s,0,c,0],[0,0,0,1]];
 if(axis==='z')return [[c,-s,0,0],[s,c,0,0],[0,0,1,0],[0,0,0,1]];
 throw new RangeError('Invalid rotation axis');
}
export function transformPoint2(m:Matrix,p:Vec2):Vec2 { v2(p);const r=multiply(m,[[coordinate(p[0])],[coordinate(p[1])],[1]]);if(r.length!==3||Math.abs(r[2][0])<1e-14)throw new RangeError('Invalid homogeneous transform');return [coordinate(r[0][0]/r[2][0]),coordinate(r[1][0]/r[2][0])]; }
export function transformPoint3(m:Matrix,p:Vec3):Vec3 { v3(p);const r=multiply(m,[[coordinate(p[0])],[coordinate(p[1])],[coordinate(p[2])],[1]]);if(r.length!==4||Math.abs(r[3][0])<1e-14)throw new RangeError('Invalid homogeneous transform');return [coordinate(r[0][0]/r[3][0]),coordinate(r[1][0]/r[3][0]),coordinate(r[2][0]/r[3][0])]; }

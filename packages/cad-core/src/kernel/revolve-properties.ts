import type {Vec3} from '../math.js';
import {checkRevolution} from './revolve-validation.js';
import type {RevolvedSolid} from './revolve-types.js';
export type RevolutionProperties={method:'analytical-binary64';volumeMetres3:number;surfaceAreaMetres2:number;centroid:Vec3;bounds:{min:Vec3;max:Vec3};faceAreas:Record<string,number>;edgeLengths:Record<string,number>;tolerancePolicy:{lengthMetres:number;areaMetres2:number;volumeMetres3:number};};
/** Analytic integrals of an annular sector; independent of display tessellation. */
export function revolutionProperties(s:RevolvedSolid):RevolutionProperties {
 const diagnostics=checkRevolution(s);if(diagnostics.length)throw new Error(`Invalid revolved B-rep: ${diagnostics[0].message}`);
 const p=s.parameters,{innerRadius:r,outerRadius:R,axialMin:y0,axialMax:y1,startAngle:a,sweep}=p,theta=Math.abs(sweep),height=y1-y0,radialArea=R*R-r*r;
 const volume=theta*radialArea*height/2,curved=theta*(R+r)*height,caps=theta*radialArea,cut=p.full?0:2*(R-r)*height;
 const half=sweep/2,sinc=Math.sin(half)/half,meanRadius=(2/3)*(R**3-r**3)/radialArea,meanCos=p.full?0:Math.cos(a+half)*sinc,meanSin=p.full?0:Math.sin(a+half)*sinc;
 const centroid:Vec3=[p.axisX+meanRadius*meanCos,(y0+y1)/2,-meanRadius*meanSin];
 const angles=[a,a+sweep],lo=Math.min(a,a+sweep),hi=Math.max(a,a+sweep),step=Math.PI/2;for(let k=Math.ceil(lo/step);k*step<hi;k++)angles.push(k*step);
 const xs=angles.flatMap(t=>[p.axisX+r*Math.cos(t),p.axisX+R*Math.cos(t)]),zs=angles.flatMap(t=>[-r*Math.sin(t),-R*Math.sin(t)]);
 const faceAreas:Record<string,number>={};for(const f of s.faces){const role=f.provenance.role;faceAreas[f.id]=role==='outer'?theta*R*height:role==='inner'?theta*r*height:(role==='top'||role==='bottom')?theta*radialArea/2:(R-r)*height;}
 const edgeLengths:Record<string,number>={};for(const e of s.edges){const c=e.curve;edgeLengths[e.id]=c.kind==='circular-arc'?c.radius*Math.abs(c.sweep):Math.hypot(...c.end.map((x,i)=>x-c.start[i]));}
 return {method:'analytical-binary64',volumeMetres3:volume,surfaceAreaMetres2:curved+caps+cut,centroid,bounds:{min:[Math.min(...xs),y0,Math.min(...zs)],max:[Math.max(...xs),y1,Math.max(...zs)]},faceAreas,edgeLengths,tolerancePolicy:{lengthMetres:s.tolerance.lengthMetres,areaMetres2:s.tolerance.areaMetres2,volumeMetres3:s.tolerance.areaMetres2*s.tolerance.scaleMetres}};
}

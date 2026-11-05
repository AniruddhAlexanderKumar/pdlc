// Narrow single-process microbenchmarks: not a production performance guarantee.
import {performance} from 'node:perf_hooks';
import os from 'node:os';
import {rectangleGeometry} from '../src/editor.js';
import {revolveSketch} from '../src/kernel/revolve.js';
import {checkRevolution} from '../src/kernel/revolve-validation.js';
import {revolutionProperties} from '../src/kernel/revolve-properties.js';
import {tessellateRevolution} from '../src/kernel/revolve-tessellation.js';
import {extrudeSketch} from '../src/kernel/extrude.js';
import {booleanBoxes} from '../src/kernel/boolean-box.js';
import type {Sketch} from '../src/sketch.js';
function sketch(id:string,a:readonly [number,number],b:readonly [number,number]):Sketch{let i=0;const g=rectangleGeometry(a,b,e=>({id:e,ownerId:'bench',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true}),()=>`${id}-${i++}`);return {schemaVersion:1,id,revision:1,plane:'XY',units:'m',...g};}
const profile=sketch('profile',[.002,0],[.003,.002]),input={sketch:profile,operationId:'rev',axis:{origin:[0,0,0] as const,direction:[0,1,0] as const},startAngle:0,sweep:2*Math.PI};
const r=revolveSketch(input);if(!r.ok)throw Error(JSON.stringify(r.diagnostics));const s=r.value.solid;
const pa=extrudeSketch({sketch:sketch('a',[0,0],[.01,.02]),operationId:'a',distanceMetres:.005,mode:'blind'}),pb=extrudeSketch({sketch:sketch('b',[.005,0],[.015,.02]),operationId:'b',distanceMetres:.005,mode:'blind'});if(!pa.ok||!pb.ok)throw Error('Extrusion failed');
function measure(label:string,fn:()=>unknown){const samples:number[]=[];let failures=0;const before=process.memoryUsage().heapUsed;for(let i=0;i<50;i++){const t=performance.now();try{fn()}catch{failures++}const d=performance.now()-t;if(i>=10)samples.push(d);}samples.sort((a,b)=>a-b);const q=(x:number)=>samples[Math.ceil(samples.length*x)-1].toFixed(3);return {label,samples:samples.length,p50Ms:q(.5),p95Ms:q(.95),failures,heapDeltaBytes:process.memoryUsage().heapUsed-before};}
const output=[measure('revolution',()=>{const x=revolveSketch(input);if(!x.ok)throw Error('failed')}),measure('validation',()=>{if(checkRevolution(s).length)throw Error('failed')}),measure('analytical properties',()=>revolutionProperties(s))];
for(const d of [.0001,.00001,.000001]){const opts={linearDeflectionMetres:d,angularDeflectionRadians:.2,maxSegments:4096,maxTriangles:100000};const mesh=tessellateRevolution(s,opts);if(!mesh.ok)throw Error('mesh failed');output.push({...measure(`tessellation deflection ${d}m`,()=>{const x=tessellateRevolution(s,opts);if(!x.ok)throw Error('mesh failed')}),...{triangles:mesh.value.triangles.length,segments:mesh.value.angularSegments}});}
output.push(measure('box intersection',()=>{const x=booleanBoxes('intersection',pa.value.solid,pb.value.solid,'bench');if(!x.ok)throw Error('boolean failed')}));
console.log(JSON.stringify({node:process.version,platform:`${process.platform}/${process.arch}`,cpu:os.cpus()[0]?.model,warmup:10,faces:s.faces.length,edges:s.edges.length,iterations:'not applicable',numericalResidual:'not measured',heapCaveat:'heap delta is not peak memory and includes garbage collection effects',benchmarks:output},null,2));

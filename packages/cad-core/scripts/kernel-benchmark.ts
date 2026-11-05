// Controlled microbenchmark of a single isolated rectangular extrusion; not a general performance guarantee.
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {rectangleGeometry} from '../src/editor.js';
import {extrudeSketch} from '../src/kernel/extrude.js';
import {tessellatePlanar} from '../src/kernel/tessellation.js';
import type {Sketch} from '../src/sketch.js';
let n=0;const g=rectangleGeometry([0,0],[.01,.02],id=>({id,ownerId:'bench',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true}),()=>String(n++));
const sketch:Sketch={id:'bench',schemaVersion:1,plane:'XY',units:'m',revision:1,...g};const samples:number[]=[];
for(let i=0;i<120;i++){const start=performance.now();const r=extrudeSketch({sketch,operationId:'bench',distanceMetres:.005,mode:'blind'});if(!r.ok)throw Error(JSON.stringify(r.diagnostics));if(!tessellatePlanar(r.value.solid).ok)throw Error('Tessellation failed');const elapsed=performance.now()-start;if(i>=20)samples.push(elapsed);}
samples.sort((a,b)=>a-b);const q=(x:number)=>samples[Math.ceil(x*samples.length)-1].toFixed(3);console.log(JSON.stringify({node:process.version,platform:`${process.platform}/${process.arch}`,cpu:os.cpus()[0]?.model,warmup:20,samples:100,operation:'solve, extrude, validate, properties, tessellate rectangle',p50Ms:q(.5),p95Ms:q(.95),maxMs:q(1)},null,2));

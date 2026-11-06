// A single-process, deliberately narrow microbenchmark, not an interactive latency guarantee.
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { solveSketch } from '../src/solver.js';
import type { Sketch, SketchConstraint, PointRef } from '../src/sketch.js';
const meta=(id:string)=>({id,ownerId:'benchmark',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true});
const ref=(entityId:string,point:PointRef['point']):PointRef=>({entityId,point});
const c=(id:string,x:object)=>({id,enabled:true,...x});
const s:Sketch={schemaVersion:1,id:'bench',plane:'XY',units:'m',revision:0,entities:[
 {...meta('a'),type:'line',start:[0.001,0.001],end:[0.012,0.002]},
 {...meta('b'),type:'line',start:[0.011,0.002],end:[0.011,0.021]},
 {...meta('c'),type:'line',start:[0.011,0.021],end:[0.001,0.021]},
 {...meta('d'),type:'line',start:[0.001,0.021],end:[0.001,0.001]},
],constraints:[
 c('ab',{type:'coincident',a:ref('a','end'),b:ref('b','start')}),c('bc',{type:'coincident',a:ref('b','end'),b:ref('c','start')}),c('cd',{type:'coincident',a:ref('c','end'),b:ref('d','start')}),c('da',{type:'coincident',a:ref('d','end'),b:ref('a','start')}),
 c('h1',{type:'horizontal',lineId:'a'}),c('v1',{type:'vertical',lineId:'b'}),c('h2',{type:'horizontal',lineId:'c'}),c('v2',{type:'vertical',lineId:'d'}),c('origin',{type:'fixed-point',point:ref('a','start'),target:[0,0]}),c('w',{type:'line-length',lineId:'a',metres:0.01}),c('h',{type:'line-length',lineId:'b',metres:0.02}),
] as SketchConstraint[]};
const samples:number[]=[];for(let i=0;i<110;i++){const start=performance.now();const r=solveSketch(s);const duration=performance.now()-start;if(r.status!=='fully-constrained'||r.dof!==0)throw new Error('Benchmark solve failed: '+r.diagnostics.join());if(i>=10)samples.push(duration);}
samples.sort((a,b)=>a-b);const percentile=(p:number)=>samples[Math.ceil(p*samples.length)-1].toFixed(3);
console.log(JSON.stringify({node:process.version,platform:`${process.platform}/${process.arch}`,cpu:os.cpus()[0]?.model,warmup:10,samples:samples.length,variables:16,equations:16,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:samples.at(-1)!.toFixed(3)},null,2));

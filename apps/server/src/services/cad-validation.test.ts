import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {cadSourceSchema,solveCadSource} from './cad-validation.js';
import type {Sketch} from '@sv/cad-core';
const id=randomUUID(),owner=randomUUID(),line=randomUUID();
const source:Sketch={id,schemaVersion:1,plane:'XY',units:'m',revision:1,entities:[{type:'line',id:line,ownerId:owner,createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true,start:[0,0],end:[0.01,0]}],constraints:[]};
test('CAD API schema rejects untrusted, invalid, dangling, duplicate and unknown source',()=>{
 assert(cadSourceSchema.safeParse(source).success);assert(!cadSourceSchema.safeParse({...source,revision:-1}).success);assert(!cadSourceSchema.safeParse({...source,plane:'XZ'}).success);
 assert(!cadSourceSchema.safeParse({...source,unknown:true}).success);assert(!cadSourceSchema.safeParse({...source,entities:[source.entities[0],source.entities[0]]}).success);
 assert(!cadSourceSchema.safeParse({...source,entities:[{...source.entities[0],type:'arc'}]}).success);assert(!cadSourceSchema.safeParse({...source,entities:[{...source.entities[0],start:[NaN,0]}]}).success);
 assert(!cadSourceSchema.safeParse({...source,constraints:[{type:'horizontal',id:randomUUID(),enabled:true,lineId:randomUUID()}]}).success);
 assert(!cadSourceSchema.safeParse({...source,entities:[{...source.entities[0],end:[0,0]}]}).success);
 assert(!cadSourceSchema.safeParse({...source,entities:Array.from({length:9},()=>({...source.entities[0],id:randomUUID()}))}).success);
});
test('CAD validation refuses directly conflicting dimensions without modifying input',()=>{
 const s:Sketch={...source,constraints:[{id:randomUUID(),enabled:true,type:'line-length',lineId:line,metres:0.01},{id:randomUUID(),enabled:true,type:'line-length',lineId:line,metres:0.02}]};
 assert(cadSourceSchema.safeParse(s).success);const before=JSON.stringify(s);assert.throws(()=>solveCadSource(s),/inconsistent/);assert.equal(JSON.stringify(s),before);
});

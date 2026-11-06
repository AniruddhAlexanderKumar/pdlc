import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { diagramSourceSchema } from './design-validation.js';
test('diagram source rejects duplicate IDs, dangling and self edges, unknown versions and invalid coordinates',()=>{
 const a=randomUUID(),b=randomUUID(),e=randomUUID();const source={schemaVersion:1,nodes:[{id:a,label:'A',x:0,y:0},{id:b,label:'B',x:100,y:100}],edges:[{id:e,from:a,to:b,label:'link'}]};
 assert(diagramSourceSchema.safeParse(source).success);
 assert(!diagramSourceSchema.safeParse({...source,schemaVersion:2}).success);
 assert(!diagramSourceSchema.safeParse({...source,nodes:[source.nodes[0],source.nodes[0]]}).success);
 assert(!diagramSourceSchema.safeParse({...source,edges:[{...source.edges[0],to:randomUUID()}]}).success);
 assert(!diagramSourceSchema.safeParse({...source,edges:[{...source.edges[0],to:a}]}).success);
 assert(!diagramSourceSchema.safeParse({...source,nodes:[{...source.nodes[0],x:-1}]}).success);
 assert(!diagramSourceSchema.safeParse({...source,arbitrary:'unexpected'}).success);
});

import type { Sketch } from './sketch.js';

/** Wire contract for the experimental, workspace-scoped sketch document API. */
export interface CadDocument {
 id:string; workspaceId:string; ownerId:string|null; name:string; headRevision:number;
 createdAt:string; updatedAt:string; archivedAt:string|null; canEdit:boolean;
}
export interface CadDetail { document:CadDocument; source:Sketch }

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../automation/Code.gs',import.meta.url),'utf8');
function publisher(catalog={version:1,entries:[]}){
 const commits=[],uploads=[];
 const context=vm.createContext({
  Utilities:{DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()],base64Encode:b=>Buffer.from(b).toString('base64')},
  DriveApp:{getFileById:id=>({getMimeType:()=>id==='bad'?'application/pdf':'image/png',getSize:()=>100,getBlob:()=>({getBytes:()=>[1,2,3]})})}
 });
 vm.runInContext(source,context);
 context.loadCatalog_=()=>({head:'head',tree:'tree',catalog:structuredClone(catalog)});
 context.github_=(method,path,payload)=>{uploads.push({method,path,payload});return {sha:'blob'};};
 context.commitCatalog_=(state,tree,message)=>commits.push({state,tree,message});
 return {run:r=>context.publishRow_(r),commits,uploads};
}
const row={Title:'Example film',Type:'Movie',Year:'1986','Submission ID':'response-private-id','File IDs (private)':'drive-private-id',Caption:'A sousaphone in the parade',Instruments:'Sousaphone',Genres:'Comedy',Credit:'Friend','Contact email (private)':'private@example.com'};
test('simplified form captures renamed email privately and publishes without a type answer',()=>{
 const context=vm.createContext({SpreadsheetApp:{newRichTextValue:()=>({setText(){return this;},setLinkUrl(){return this;},build(){return {};}})}});vm.runInContext(source,context);
 let captured;
 context.sheet_=()=>({getDataRange:()=>({getValues:()=>[vm.runInContext('SAE.headers',context)]}),getMaxRows:()=>100,getRange:()=>({setValues:values=>{captured=values[0];},insertCheckboxes:()=>{},setRichTextValue:()=>{}})});
 const answers={Title:'Example film',Caption:'A bell in the background',Credit:'Friend','Contact email':'private@example.com','Anything else?':'Episode 2, around 12:30'};
 const responses=Object.entries(answers).map(([title,value])=>({getItem:()=>({getType:()=> 'TEXT',getTitle:()=>title}),getResponse:()=>value}));
 responses.push({getItem:()=>({getType:()=> 'FILE_UPLOAD'}),getResponse:()=>['drive-private-id']});
 context.captureResponse_({getId:()=> 'simplified-response',getTimestamp:()=>new Date('2026-10-22T00:00:00Z'),getItemResponses:()=>responses});
 const headers=vm.runInContext('SAE.headers',context),record=Object.fromEntries(headers.map((h,i)=>[h,captured[i]]));
 assert.equal(record.Type,undefined);assert.equal(record['Contact email'],'private@example.com');assert.equal(record['Anything else?'],'Episode 2, around 12:30');
 const p=publisher();p.run(record);assert.equal(p.commits[0].state.catalog.entries[0].type,'other');assert.ok(!JSON.stringify(p.commits).includes('private@example.com'));
});
test('review sheet migration preserves published state, identity, media and private contact',()=>{
 const context=vm.createContext({});vm.runInContext(source,context);
 const headers=['Approved','Status','Submission ID','Title','Contact email (private)','Source note','File IDs (private)','Published URL'];
 const values=[true,'Published','stable-response','Example film','private@example.com','Episode 2','drive-id','https://shaunalynn.org/tubas/#sighting=stable'];
 const migrated=context.reviewRecord_(headers,values);
 assert.equal(migrated.Approved,true);assert.equal(migrated.Status,'Published');assert.equal(migrated['Submission ID'],'stable-response');assert.equal(migrated['File IDs (private)'],'drive-id');assert.equal(migrated['Contact email'],'private@example.com');assert.equal(migrated['Anything else?'],'Episode 2');assert.equal(migrated['Images or clips'],'File 1');
});
test('publisher reads shifted submission-ID column and skips already-published rows',()=>{
 const context=vm.createContext({LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},SpreadsheetApp:{flush:()=>{}}});vm.runInContext(source,context);
 const headers=vm.runInContext('SAE.headers',context);
 const make=r=>headers.map(h=>r[h]??'');
 context.sheet_=()=>({getDataRange:()=>({getValues:()=>[headers,make({Approved:true,Status:'Published',Title:'Already done','Submission ID':'old'}),make({Approved:true,Status:'Awaiting review',Title:'New','Submission ID':'new'}),make({Approved:true,Title:'No identity'})]})});
 let published=0;context.write_=()=>{};context.publishRow_=r=>{assert.equal(r['Submission ID'],'new');published++;return 'https://shaunalynn.org/tubas/';};
 context.publishApproved();assert.equal(published,1);
});
test('publication commits text and attachments together, excluding private fields',()=>{
 const p=publisher();const url=p.run(row);assert.match(url,/#sighting=s-/);assert.equal(p.commits.length,1);
 const commit=p.commits[0];assert.equal(commit.tree.length,1);assert.equal(commit.state.catalog.entries[0].sightings[0].media[0].url,commit.tree[0].path);
 const json=JSON.stringify(commit);for(const value of ['private@example.com','drive-private-id','response-private-id'])assert.ok(!json.includes(value));
 assert.equal(commit.state.catalog.entries[0].title,'Example film');
});
test('retry after successful commit creates no duplicate or uploads',()=>{
 const first=publisher();first.run(row);const retry=publisher(first.commits[0].state.catalog);retry.run(row);assert.equal(retry.commits.length,0);assert.equal(retry.uploads.length,0);
});
test('private leads and unsupported files cannot publish',()=>{
 for(const files of ['', 'bad']){const p=publisher();assert.throws(()=>p.run({...row,'File IDs (private)':files}));assert.equal(p.commits.length,0);assert.equal(p.uploads.length,0);}
});
test('another submission adds to the same title; a remake gets a distinct entry',()=>{
 const first=publisher();first.run(row);const catalog=first.commits[0].state.catalog;
 const second=publisher(catalog);second.run({...row,'Submission ID':'second-response'});assert.equal(second.commits[0].state.catalog.entries.length,1);assert.equal(second.commits[0].state.catalog.entries[0].sightings.length,2);
 const remake=publisher(catalog);remake.run({...row,'Submission ID':'remake',Year:'2020'});assert.equal(remake.commits[0].state.catalog.entries.length,2);
});
test('ambiguous title metadata asks for explicit matching rather than duplicating',()=>{
 const first=publisher();first.run(row);const catalog=first.commits[0].state.catalog;const p=publisher(catalog);
 assert.throws(()=>p.run({...row,'Submission ID':'second',Year:''}),/Possible duplicate/);assert.equal(p.commits.length,0);
 const merged=publisher(catalog);merged.run({...row,'Submission ID':'second',Year:'','Existing entry ID':catalog.entries[0].id});assert.equal(merged.commits[0].state.catalog.entries.length,1);
});

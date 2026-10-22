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

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,flatten,filterSightings} from '../app.js';
const entries=[{id:'a',title:'Example Film',type:'movie',year:1986,genres:['Comedy'],sightings:[{id:'1',caption:'A parade',instruments:['Sousaphone'],media:[{kind:'image',url:'media/test.jpg'}]},{id:'2',caption:'Another scene',instruments:['Tuba'],media:[{kind:'image',url:'media/other.jpg'}]}]},{id:'b',title:'Private lead',sightings:[{id:'3',media:[]}]}];
const filters={search:''};
test('unsafe protocols never reach image or source elements',()=>{assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('data:text/html,test'),'');assert.equal(safeUrl(''),'');assert.ok(safeUrl('media/image.jpg').startsWith('https:'));});
test('sightings retain their shared title record; leads never become cards',()=>{const list=flatten(entries);assert.equal(list.length,2);assert.equal(list[0].entry,list[1].entry);});
test('text search finds titles and captions without case sensitivity',()=>{const list=flatten(entries);assert.equal(filterSightings(list,{search:' PARADE '}).length,1);assert.equal(filterSightings(list,{search:'example film'}).length,2);assert.equal(filterSightings(list,{search:'missing'}).length,0);assert.equal(filterSightings(list,filters).length,2);});

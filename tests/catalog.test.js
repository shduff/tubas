import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,flatten,filterSightings} from '../app.js';
const entries=[{id:'a',title:'Example Film',type:'movie',year:1986,genres:['Comedy'],sightings:[{id:'1',caption:'A parade',instruments:['Sousaphone'],media:[{kind:'image',url:'media/test.jpg'}]},{id:'2',caption:'Another scene',instruments:['Tuba'],media:[{kind:'image',url:'media/other.jpg'}]}]},{id:'b',title:'Private lead',sightings:[{id:'3',media:[]}]}];
const filters={search:'',type:'',genre:'',instrument:'',decade:''};
test('unsafe protocols never reach image or source elements',()=>{assert.equal(safeUrl('javascript:alert(1)'),'');assert.equal(safeUrl('data:text/html,test'),'');assert.equal(safeUrl(''),'');assert.ok(safeUrl('media/image.jpg').startsWith('https:'));});
test('sightings retain their shared title record; leads never become cards',()=>{const list=flatten(entries);assert.equal(list.length,2);assert.equal(list[0].entry,list[1].entry);});
test('filters intersect and search covers captions without case sensitivity',()=>{const list=flatten(entries);assert.equal(filterSightings(list,{...filters,search:'PARADE',genre:'Comedy',decade:'1980',instrument:'Sousaphone'}).length,1);assert.equal(filterSightings(list,{...filters,type:'tv'}).length,0);assert.equal(filterSightings(list,{...filters,search:'PARADE',instrument:'Tuba'}).length,0);});

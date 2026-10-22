/** Sousaphones Are Everywhere — private Google Sheets review and GitHub publisher.
 * Keep this script bound to the private review spreadsheet. Never publish it as a web app.
 * Store GITHUB_TOKEN in Script Properties, not in source code or a spreadsheet cell.
 */
const SAE = {
  repo: 'shduff/tubas', branch: 'main', site: 'https://shaunalynn.org/tubas/',
  sheet: 'Review queue', catalog: 'data/catalog.json', maxFileBytes: 10 * 1024 * 1024,
  maxSubmissionBytes: 20 * 1024 * 1024,
  headers: ['Approved', 'Status', 'Submission ID', 'Submitted', 'Title', 'Type', 'Year',
    'Season', 'Episode', 'Episode title', 'Genres', 'Instruments', 'Timestamp', 'Caption',
    'Credit', 'Contact email (private)', 'Source note', 'Source URL', 'File IDs (private)',
    'Existing entry ID', 'Published URL', 'Last error'],
  genres: ['Action', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Fantasy',
    'Horror', 'Musical', 'Mystery', 'Romance', 'Science fiction', 'Thriller', 'Western', 'Other'],
  instruments: ['Sousaphone', 'Tuba', 'Euphonium', 'Baritone horn', 'Uncertain']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Sousaphones')
    .addItem('Set up form and review queue', 'setup')
    .addItem('Publish approved submissions', 'publishApproved')
    .addItem('Connect form link to website', 'publishFormLink')
    .addItem('Import missed form responses', 'importResponses')
    .addToUi();
}

function props_() { return PropertiesService.getScriptProperties(); }
function sheet_() {
  const id = props_().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Run setup first.');
  return SpreadsheetApp.openById(id).getSheetByName(SAE.sheet);
}
function write_(sheet, row, column, value) {
  sheet.getRange(row, SAE.headers.indexOf(column) + 1).setValue(value);
}
function plainCell_(value) {
  const text = String(value == null ? '' : value);
  // Prevent form-supplied spreadsheet formulas from executing.
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function setup() {
  const p = props_(), ss = SpreadsheetApp.getActiveSpreadsheet();
  p.setProperty('SPREADSHEET_ID', ss.getId());
  let sheet = ss.getSheetByName(SAE.sheet);
  if (!sheet) {
    sheet = ss.insertSheet(SAE.sheet);
    sheet.getRange(1, 1, 1, SAE.headers.length).setValues([SAE.headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SAE.headers.length).setBackground('#222b21').setFontColor('#f2efdf').setFontWeight('bold');
    sheet.getRange(2, 3, sheet.getMaxRows() - 1, SAE.headers.length - 2).setNumberFormat('@');
    sheet.setColumnWidths(1, SAE.headers.length, 150);
    sheet.setColumnWidth(5, 230); sheet.setColumnWidth(14, 320);
  }
  // Also configure a review queue imported from the prepared workbook.
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build());
  let form;
  if (p.getProperty('FORM_ID')) { form = FormApp.openById(p.getProperty('FORM_ID')); }
  else {
    form = FormApp.create('Sousaphones Are Everywhere');
    p.setProperty('FORM_ID', form.getId());
    form.setDescription('Spotted a sousaphone, tuba, euphonium, or baritone on screen? Submit a sighting!\n\nFile uploads require a Google sign-in.');
    form.setCollectEmail(false).setLimitOneResponsePerUser(false);
    form.setConfirmationMessage('Thanks for keeping your eyes open! Your sighting is in the private review queue.');
    form.addTextItem().setTitle('Title').setHelpText('Movie title, or show name for television.').setRequired(true);
    form.addParagraphTextItem().setTitle('Caption').setHelpText('Where is the instrument? Context, commentary, and jokes welcome.');
    form.addTextItem().setTitle('Credit').setHelpText('Optional name or handle to show publicly.');
    form.addTextItem().setTitle('Email').setHelpText('Only if you want us to be able to follow up.');
    form.addParagraphTextItem().setTitle('Anything else?').setHelpText('A timestamp, an episode name, a link to the scene, or a detail we should look for?');
  }
  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (!existing.includes('captureSubmission')) ScriptApp.newTrigger('captureSubmission').forForm(form).onFormSubmit().create();
  if (!existing.includes('reviewEdited')) ScriptApp.newTrigger('reviewEdited').forSpreadsheet(ss).onEdit().create();
  console.log('Review queue ready. Form editor:\n' + form.getEditUrl() +
    '\n\nAdd a required File upload question named “Images or clips”. Allow multiple images and short videos, up to 10 MB per file. Google requires this question to be added in the form editor.\n\nStore a repository-scoped GitHub token as GITHUB_TOKEN in Script Properties, with Contents: read and write for shduff/tubas. Then choose “Connect form link to website”.');
}

function captureSubmission(event) {
  if (!event || !event.response) throw new Error('Triggered by a Google Form submission; use Import missed form responses for manual recovery.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { captureResponse_(event.response); } finally { lock.releaseLock(); }
}
function captureResponse_(response) {
  const sheet = sheet_(), id = String(response.getId());
  const rows = sheet.getDataRange().getValues();
  if (rows.slice(1).some(r => String(r[2]) === id)) return;
  const answers = {}, files = [];
  response.getItemResponses().forEach(r => {
    if (r.getItem().getType().toString() === 'FILE_UPLOAD') {
      const result = r.getResponse();
      (Array.isArray(result) ? result : [result]).filter(Boolean).forEach(f => files.push(String(f)));
    } else { const v = r.getResponse(); answers[r.getItem().getTitle()] = Array.isArray(v) ? v.join(', ') : String(v || ''); }
  });
  answers.Type = answers.Type || 'Other';
  answers['Contact email (private)'] = answers.Email || answers['Contact email (private)'] || '';
  answers['Source note'] = answers['Anything else?'] || answers['Source note'] || '';
  answers['Submission ID'] = id; answers.Submitted = response.getTimestamp().toISOString();
  answers['File IDs (private)'] = files.join(', ');
  answers.Status = files.length ? 'Awaiting review' : 'Needs media';
  const row = SAE.headers.map(h => h === 'Approved' ? false : plainCell_(answers[h] || ''));
  // Checkbox formatting can occupy blank rows; find actual last submission using the ID column.
  let target = 2; while (target <= rows.length && rows[target - 1][2]) target++;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  sheet.getRange(target, 1, 1, row.length).setValues([row]);
  sheet.getRange(target, 1).insertCheckboxes();
}
function importResponses() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { FormApp.openById(props_().getProperty('FORM_ID')).getResponses().forEach(captureResponse_); }
  finally { lock.releaseLock(); }
}
function reviewEdited(event) {
  if (!event || !event.range || event.range.getSheet().getName() !== SAE.sheet) return;
  if (event.range.getColumn() <= 1 && event.range.getLastColumn() >= 1) publishApproved();
}

function github_(method, path, body) {
  const token = props_().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN is missing from Script Properties.');
  const options = { method: method.toLowerCase(), headers: {
    Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'
  }, muteHttpExceptions: true };
  if (body !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  const r = UrlFetchApp.fetch('https://api.github.com/repos/' + SAE.repo + '/' + path, options);
  if (r.getResponseCode() < 200 || r.getResponseCode() >= 300) {
    // Do not include response bodies, tokens, or submission text in logs or sheet errors.
    throw new Error('GitHub returned ' + r.getResponseCode() + ' for ' + method + ' ' + path.split('?')[0] + '. Retry after checking access and repository changes.');
  }
  return JSON.parse(r.getContentText());
}
function loadCatalog_() {
  const head = github_('GET', 'git/ref/heads/' + SAE.branch).object.sha;
  const commit = github_('GET', 'git/commits/' + head);
  const file = github_('GET', 'contents/' + SAE.catalog + '?ref=' + head);
  const catalog = JSON.parse(Utilities.newBlob(Utilities.base64Decode(file.content.replace(/\s/g, ''))).getDataAsString('UTF-8'));
  if (catalog.version !== 1 || !Array.isArray(catalog.entries)) throw new Error('Unexpected catalog format.');
  return { head: head, tree: commit.tree.sha, catalog: catalog };
}
function commitCatalog_(state, mediaTree, message) {
  const entries = mediaTree.concat([{path:SAE.catalog,mode:'100644',type:'blob',content:JSON.stringify(state.catalog, null, 2) + '\n'}]);
  const tree = github_('POST', 'git/trees', {base_tree:state.tree,tree:entries});
  const commit = github_('POST', 'git/commits', {message:message,tree:tree.sha,parents:[state.head]});
  // No force: concurrent repository edits fail safely and can be retried.
  github_('PATCH', 'git/refs/heads/' + SAE.branch, {sha:commit.sha,force:false});
}
function list_(value) { return String(value || '').split(',').map(v => v.trim()).filter(Boolean); }
function safeSource_(value) { return /^https?:\/\/[^\s]+$/i.test(String(value || '')) ? String(value) : ''; }
function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('').slice(0, 20);
}
function canonical_(r) {
  return [String(r.Title || '').normalize('NFKC').trim().toLowerCase(), r.Type, r.Year,
    r.Season, r.Episode, String(r['Episode title'] || '').trim().toLowerCase()].join('|');
}
function publishApproved() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const sheet = sheet_(), values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] !== true || !values[i][2] || values[i][1] === 'Published') continue;
      const row = i + 1, r = {};
      SAE.headers.forEach((h,j) => r[h] = values[i][j]);
      try {
        write_(sheet, row, 'Status', 'Publishing'); SpreadsheetApp.flush();
        const url = publishRow_(r);
        write_(sheet, row, 'Status', 'Published'); write_(sheet, row, 'Published URL', url); write_(sheet, row, 'Last error', '');
      } catch (err) {
        write_(sheet, row, 'Approved', false);
        write_(sheet, row, 'Status', list_(r['File IDs (private)']).length ? 'Needs attention' : 'Needs media');
        write_(sheet, row, 'Last error', plainCell_(err.message));
      }
    }
  } finally { lock.releaseLock(); }
}
function publishRow_(r) {
  if (!String(r.Title || '').trim()) throw new Error('A title is required.');
  const types = {'Movie':'movie','TV episode':'tv','Other':'other'};
  const type = types[r.Type]; if (!type) throw new Error('Choose Movie, TV episode, or Other in Type.');
  if (type === 'tv' && !String(r.Episode || '').trim() && !String(r['Episode title'] || '').trim()) throw new Error('Identify the episode with an episode title or number before publishing.');
  const year = String(r.Year || '').trim();
  if (year && !/^\d{4}$/.test(year)) throw new Error('Year must be four digits or blank.');
  const id = 's-' + hash_(String(r['Submission ID'])), state = loadCatalog_();
  // If the commit succeeded but the sheet update failed, retry without duplicate media or sightings.
  if (state.catalog.entries.some(e => (e.sightings || []).some(s => s.id === id))) return SAE.site + '#sighting=' + id;
  const fileIds = list_(r['File IDs (private)']);
  if (!fileIds.length) throw new Error('Add an image, GIF, or clip before publishing.');
  const entryId = String(r['Existing entry ID'] || '').trim() || 'e-' + hash_(canonical_(r));
  let entry = state.catalog.entries.find(e => e.id === entryId);
  if (r['Existing entry ID'] && !entry) throw new Error('Existing entry ID was not found.');
  if (!entry) {
    const sameTitle = state.catalog.entries.find(e => e.title.toLowerCase().trim() === String(r.Title).toLowerCase().trim() && e.type === type && (!year || !e.year || String(e.year) === year) && (type !== 'tv' || (String(e.season||'') === String(r.Season||'') && String(e.episode||'') === String(r.Episode||'') && String(e.episodeTitle||'').toLowerCase() === String(r['Episode title']||'').toLowerCase())));
    if (sameTitle) throw new Error('Possible duplicate title. To merge, set Existing entry ID to ' + sameTitle.id + '. For a distinct remake or episode, adjust identifying details.');
    entry = {id:entryId,title:String(r.Title).trim(),type:type,year:year,season:String(r.Season||''),episode:String(r.Episode||''),episodeTitle:String(r['Episode title']||''),genres:list_(r.Genres).filter(g=>SAE.genres.includes(g)),sightings:[]};
    state.catalog.entries.push(entry);
  }
  let total = 0;
  const mimeExtensions = {'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
  // Validate the entire batch before uploading any blobs.
  const files = fileIds.map(fileId => {
    const file = DriveApp.getFileById(fileId), mime = file.getMimeType();
    if (!mimeExtensions[mime]) throw new Error('Use JPG, PNG, GIF, WebP, MP4, or WebM. Convert HEIC or MOV before publishing.');
    total += file.getSize();
    if (file.getSize() > SAE.maxFileBytes || total > SAE.maxSubmissionBytes) throw new Error('Keep each file under 10 MB and the submission under 20 MB.');
    return {file:file,mime:mime};
  });
  const media = [], tree = [];
  files.forEach((f,i) => {
    const path = 'media/' + id + '/' + String(i+1).padStart(2,'0') + '.' + mimeExtensions[f.mime];
    const blob = github_('POST','git/blobs',{content:Utilities.base64Encode(f.file.getBlob().getBytes()),encoding:'base64'});
    tree.push({path:path,mode:'100644',type:'blob',sha:blob.sha});
    media.push({kind:f.mime.startsWith('video/')?'video':'image',url:path,alt:String(r.Caption||('Low brass spotted in '+r.Title))});
  });
  // Explicit allowlist: no private email, Drive IDs, raw form IDs, or review notes enter the public catalog.
  entry.sightings.push({id:id,instruments:list_(r.Instruments).filter(v=>SAE.instruments.includes(v)),timestamp:String(r.Timestamp||''),caption:String(r.Caption||''),credit:String(r.Credit||''),sourceNote:String(r['Source note']||''),sourceUrl:safeSource_(r['Source URL']),media:media});
  commitCatalog_(state, tree, 'Publish approved sighting: ' + String(r.Title).replace(/[\r\n]/g,' ').slice(0,100));
  return SAE.site + '#sighting=' + id;
}
function publishFormLink() {
  const form = FormApp.openById(props_().getProperty('FORM_ID'));
  if (!form.getItems().some(i => i.getType().toString() === 'FILE_UPLOAD')) throw new Error('First add the optional Images or clips file-upload question in the form editor.');
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { const state=loadCatalog_();state.catalog.submissionUrl=form.getPublishedUrl();commitCatalog_(state,[],'Connect submission form'); }
  finally { lock.releaseLock(); }
}

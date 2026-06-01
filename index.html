<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RhymeWeave Offline</title>
<style>
body{margin:0;font-family:Arial,sans-serif;background:#09090b;color:#f4f4f5}
.wrap{max-width:1200px;margin:auto;padding:18px}
.card{background:#18181b;border:1px solid #27272a;border-radius:18px;padding:16px;margin:12px 0}
button,input,textarea,select{border-radius:12px;border:1px solid #3f3f46;background:#09090b;color:#f4f4f5;padding:10px}
button{background:#4f46e5;border:0;font-weight:800;cursor:pointer;margin:4px}
textarea{width:100%;min-height:160px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.tab{background:#27272a}
.active{background:#4f46e5}
.out{white-space:pre-wrap;background:#09090b;border:1px solid #27272a;border-radius:12px;padding:12px;max-height:420px;overflow:auto}
.pill{display:inline-block;background:#27272a;border-radius:999px;padding:5px 9px;margin:3px}
</style>
</head>
<body>
<div class="wrap">
<h1>RhymeWeave Offline</h1>
<p>Loads your <b>cmudict_rhyme_database.jsonl</b> file. Perfect rhymes, A-Z words, alliteration lines, review sorter, analyzer.</p>

<div class="card">
<h2>1. Load Rhyme DNA JSONL Database</h2>
<input id="dbFile" type="file" accept=".jsonl,.json,.txt">
<button onclick="loadDB()">Load Database</button>
<div id="dbStatus">No database loaded.</div>
</div>

<div class="card">
<button class="tab active" onclick="showTab('finder',this)">Finder</button>
<button class="tab" onclick="showTab('chains',this)">Phrase Chains</button>
<button class="tab" onclick="showTab('lines',this)">Alliteration Lines</button>
<button class="tab" onclick="showTab('prompts',this)">Writing Prompts</button>
<button class="tab" onclick="showTab('review',this)">Review Sorter</button>
<button class="tab" onclick="showTab('analyzer',this)">Text Analyzer</button>
</div>

<div id="finder" class="tabBox">
<div class="grid">
<div class="card">
<h2>Perfect Rhyme Finder</h2>
<input id="wordInput" placeholder="Type word: flame">
<button onclick="findRhymes()">Find Rhymes</button>
<button onclick="showAZButtons()">Show A-Z Buttons</button>
<div id="azButtons"></div>
</div>
<div class="card">
<h2>Results</h2>
<div id="finderOut" class="out">Load database first.</div>
</div>
</div>
</div>

<div id="chains" class="tabBox" style="display:none">
<div class="card">
<h2>Phrase Chain Builder</h2>
<input id="chainLetter" maxlength="1" placeholder="Letter B">
<button onclick="makeChain()">Generate Chain</button>
<div id="chainOut" class="out"></div>
</div>
</div>

<div id="lines" class="tabBox" style="display:none">
<div class="card">
<h2>Alliteration Line Generator</h2>
<input id="lineLetter" maxlength="1" placeholder="Letter S">
<button onclick="makeLine()">Generate Line</button>
<div id="lineOut" class="out"></div>
</div>
</div>

<div id="prompts" class="tabBox" style="display:none">
<div class="card">
<h2>Writing Prompts</h2>
<input id="promptLetter" maxlength="1" placeholder="Letter M">
<button onclick="makePrompt()">Generate Prompt</button>
<div id="promptOut" class="out"></div>
</div>
</div>

<div id="review" class="tabBox" style="display:none">
<div class="card">
<h2>Review Sorter</h2>
<textarea id="reviewInput" placeholder="Paste lines here..."></textarea>
<button onclick="sortReview()">Sort Review</button>
<button onclick="downloadText('APPROVED_LINES.txt', approved.join('\n'))">Download Approved</button>
<button onclick="downloadText('REVIEW_LINES.txt', review.join('\n'))">Download Review</button>
<div class="grid">
<div><h3>Approved</h3><div id="approvedOut" class="out"></div></div>
<div><h3>Review Not Deleted</h3><div id="reviewOut" class="out"></div></div>
</div>
</div>
</div>

<div id="analyzer" class="tabBox" style="display:none">
<div class="card">
<h2>Text Analyzer</h2>
<textarea id="analyzeInput" placeholder="Paste poem, phrase, or paragraph..."></textarea>
<button onclick="analyzeText()">Analyze</button>
<div id="analyzeOut" class="out"></div>
</div>
</div>

</div>

<script>
let words={}, rhymeIndex={}, letterIndex={}, approved=[], review=[];
const letters="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function showTab(id,btn){
 document.querySelectorAll(".tabBox").forEach(x=>x.style.display="none");
 document.getElementById(id).style.display="block";
 document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
 btn.classList.add("active");
}

async function loadDB(){
 const f=document.getElementById("dbFile").files[0];
 if(!f){alert("Choose your cmudict_rhyme_database.jsonl file first.");return;}
 document.getElementById("dbStatus").textContent="Loading database...";
 const text=await f.text();
 words={}; rhymeIndex={}; letterIndex={};
 const lines=text.split(/\r?\n/).filter(Boolean);
 let count=0;
 for(const line of lines){
   try{
     const r=JSON.parse(line);
     const w=(r.word||r.entry||"").toLowerCase();
     if(!w) continue;
     words[w]=r;
     const rk=r.rhyme_key||r.rhyme_key_unstressed||"";
     if(rk){ if(!rhymeIndex[rk]) rhymeIndex[rk]=[]; rhymeIndex[rk].push(w); }
     const fl=(w[0]||"").toUpperCase();
     if(/[A-Z]/.test(fl)){ if(!letterIndex[fl]) letterIndex[fl]=[]; letterIndex[fl].push(w); }
     count++;
   }catch(e){}
 }
 Object.keys(letterIndex).forEach(k=>letterIndex[k].sort());
 document.getElementById("dbStatus").textContent="Loaded "+count+" words.";
 document.getElementById("finderOut").textContent="Database loaded. Type a word and tap Find Rhymes.";
 showAZButtons();
}

function needDB(){ if(!Object.keys(words).length){alert("Load database first.");return false;} return true; }

function findRhymes(){
 if(!needDB())return;
 const w=document.getElementById("wordInput").value.trim().toLowerCase();
 const r=words[w];
 if(!r){document.getElementById("finderOut").textContent=w+" not found.";return;}
 const rk=r.rhyme_key||r.rhyme_key_unstressed||"";
 const rh=(rhymeIndex[rk]||[]).filter(x=>x!==w).slice(0,200);
 document.getElementById("finderOut").textContent=
 "WORD: "+w.toUpperCase()+"\n"+
 "PRONUNCIATION: "+(r.pronunciation||"")+"\n"+
 "SYLLABLES: "+(r.syllables||"")+"\n"+
 "RHYME KEY: "+rk+"\n"+
 "ALLITERATION KEY: "+(r.alliteration_key||"")+"\n\n"+
 "PERFECT RHYMES:\n"+(rh.join(", ")||"None found.");
}

function showAZButtons(){
 const box=document.getElementById("azButtons"); box.innerHTML="";
 letters.forEach(l=>{
   const b=document.createElement("button");
   b.textContent=l+" ("+(letterIndex[l]?.length||0)+")";
   b.onclick=()=>showLetter(l);
   box.appendChild(b);
 });
}

function showLetter(l){
 if(!needDB())return;
 const list=(letterIndex[l]||[]).slice(0,500);
 document.getElementById("finderOut").textContent=l+" WORDS:\n\n"+list.join(", ");
}

function pick(arr,n){
 const pool=[...arr], out=[];
 while(out.length<n && pool.length){
   const i=Math.floor(Math.random()*pool.length);
   out.push(pool.splice(i,1)[0]);
 }
 return out;
}

function makeChain(){
 if(!needDB())return;
 const l=(document.getElementById("chainLetter").value||"B").toUpperCase();
 const p=pick(letterIndex[l]||[],8);
 document.getElementById("chainOut").textContent=p.join(" • ").toUpperCase();
}

function makeLine(){
 if(!needDB())return;
 const l=(document.getElementById("lineLetter").value||"S").toUpperCase();
 const p=pick(letterIndex[l]||[],6);
 document.getElementById("lineOut").textContent=p.length?
 (p.map(x=>x.toUpperCase()).join(" ") + ".") : "No words found.";
}

function makePrompt(){
 if(!needDB())return;
 const l=(document.getElementById("promptLetter").value||"M").toUpperCase();
 const p=pick(letterIndex[l]||[],5).map(x=>x.toUpperCase());
 document.getElementById("promptOut").textContent=
 "Write 4 lines using these words:\n\n"+p.join(", ")+"\n\nRule: keep the first sound strong and end with a rhyme.";
}

function cleanLine(s){
 return String(s).normalize("NFKC").replace(/\s+/g," ").trim().toUpperCase();
}

function sortReview(){
 const raw=document.getElementById("reviewInput").value.split(/\r?\n/);
 approved=[]; review=[];
 const seen=new Set();
 for(const x of raw){
   const line=cleanLine(x);
   if(!line)continue;
   const wordCount=(line.match(/[A-Z]+/g)||[]).length;
   if(wordCount<2 || seen.has(line) || /^\d+$/.test(line.replace(/\s/g,""))){
     review.push(line);
   }else{
     approved.push(line); seen.add(line);
   }
 }
 approved.sort(); review.sort();
 document.getElementById("approvedOut").textContent=approved.join("\n")||"None.";
 document.getElementById("reviewOut").textContent=review.join("\n")||"None.";
}

function analyzeText(){
 const text=document.getElementById("analyzeInput").value;
 const wordsIn=text.toLowerCase().match(/[a-z']+/g)||[];
 const counts={}, endings={};
 wordsIn.forEach(w=>{
   const fl=w[0].toUpperCase();
   counts[fl]=(counts[fl]||0)+1;
   const r=words[w];
   const rk=r?(r.rhyme_key||r.rhyme_key_unstressed):w.slice(-3);
   endings[rk]=(endings[rk]||0)+1;
 });
 const topLetters=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
 const topRhymes=Object.entries(endings).sort((a,b)=>b[1]-a[1]).slice(0,10);
 document.getElementById("analyzeOut").textContent=
 "WORD COUNT: "+wordsIn.length+"\n\n"+
 "TOP STARTING LETTERS:\n"+topLetters.map(x=>x[0]+": "+x[1]).join("\n")+
 "\n\nTOP RHYME KEYS:\n"+topRhymes.map(x=>x[0]+": "+x[1]).join("\n");
}

function downloadText(filename,text){
 const blob=new Blob([text||""],{type:"text/plain"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 a.href=url; a.download=filename;
 document.body.appendChild(a); a.click(); a.remove();
 URL.revokeObjectURL(url);
}
</script>
</body>
</html>

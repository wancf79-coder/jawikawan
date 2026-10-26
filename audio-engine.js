(function(){
"use strict";
const VOICES={
 intro:{file:"RR01-intro-soalan.mp3",path:"audio/voice/RR01-intro-soalan.mp3",count:10},
 correct:{file:"RR02-jawapan-betul.mp3",path:"audio/voice/RR02-jawapan-betul.mp3",count:5},
 wrong:{file:"RR03-jawapan-salah.mp3",path:"audio/voice/RR03-jawapan-salah.mp3",count:5},
 ending:{file:"RR04-penamat.mp3",path:"audio/voice/RR04-penamat.mp3",count:3},
 animals:{file:"RR05-nama-binatang.mp3",path:"audio/voice/RR05-nama-binatang.mp3",count:30}
};
const MUSIC=[1,2,3,4].map(n=>({file:n+".mp3",path:"audio/music/"+n+".mp3"}));
const REQUIRED=[...Object.values(VOICES).map(v=>v.file),...MUSIC.map(v=>v.file)];
const wait=ms=>new Promise(r=>setTimeout(r,ms));

class RRAudioEngine{
 constructor(){
  const saved=JSON.parse(localStorage.getItem("rimbara-audio-settings")||"{}");
  this.voiceOn=saved.voiceOn!==false;this.musicOn=saved.musicOn!==false;
  this.context=null;this.voiceGain=null;this.buffers={};this.segments={};
  this.blobs=new Map();this.musicUrls=[];this.musicIndex=0;this.music=null;
  this.musicNormal=.12;this.musicDuck=.035;this.currentSource=null;
  this.readyVoice=false;this.readyMusic=false;this.loading=null;this.dbPromise=null;
 }
 saveSettings(){localStorage.setItem("rimbara-audio-settings",JSON.stringify({voiceOn:this.voiceOn,musicOn:this.musicOn}))}
 ensureContext(){
  if(!this.context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;this.context=new C();this.voiceGain=this.context.createGain();this.voiceGain.gain.value=1;this.voiceGain.connect(this.context.destination)}
  if(this.context.state==="suspended")this.context.resume();return this.context;
 }
 openDB(){
  if(this.dbPromise)return this.dbPromise;
  this.dbPromise=new Promise((resolve,reject)=>{const q=indexedDB.open("rimbaria-audio",1);q.onupgradeneeded=()=>q.result.createObjectStore("files");q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
  return this.dbPromise;
 }
 async dbGet(name){try{const db=await this.openDB();return await new Promise(r=>{const q=db.transaction("files").objectStore("files").get(name);q.onsuccess=()=>r(q.result||null);q.onerror=()=>r(null)})}catch{return null}}
 async dbPut(name,blob){const db=await this.openDB();return new Promise((r,j)=>{const q=db.transaction("files","readwrite").objectStore("files").put(blob,name);q.onsuccess=()=>r();q.onerror=()=>j(q.error)})}
 async getBlob(file,path){
  if(this.blobs.has(file))return this.blobs.get(file);
  let blob=await this.dbGet(file);
  if(!blob){try{const r=await fetch(path,{cache:"no-store"});if(r.ok)blob=await r.blob()}catch{}}
  if(blob)this.blobs.set(file,blob);return blob;
 }
 async install(fileList){
  const files=[...fileList],accepted=[];
  for(const f of files){if(REQUIRED.includes(f.name)){try{await this.dbPut(f.name,f)}catch{}this.blobs.set(f.name,f);accepted.push(f.name)}}
  this.buffers={};this.segments={};this.readyVoice=false;this.readyMusic=false;
  this.stopMusic();await this.init(true);
  return {accepted,missing:REQUIRED.filter(n=>!accepted.includes(n)&&!this.blobs.has(n))};
 }
 async init(force=false){
  if(!force&&this.readyVoice&&this.readyMusic)return this.status();
  if(this.loading&&!force)return this.loading;
  this.loading=(async()=>{
   this.ensureContext();
   let voiceCount=0;
   for(const [key,v] of Object.entries(VOICES)){if(await this.loadVoice(key,v))voiceCount++}
   this.readyVoice=voiceCount===Object.keys(VOICES).length;
   this.readyMusic=(await this.loadMusic()).length>0;
   window.dispatchEvent(new CustomEvent("rraudiochange",{detail:this.status()}));
   return this.status();
  })();
  const result=await this.loading;this.loading=null;return result;
 }
 status(){return {voice:this.readyVoice,music:this.readyMusic,voiceOn:this.voiceOn,musicOn:this.musicOn}}
 async loadVoice(key,config){
  if(this.buffers[key])return true;
  const blob=await this.getBlob(config.file,config.path);if(!blob||!this.ensureContext())return false;
  try{const buffer=await this.context.decodeAudioData(await blob.arrayBuffer());this.buffers[key]=buffer;this.segments[key]=this.findSegments(buffer,config.count);return true}catch{return false}
 }
 findSegments(buffer,expected){
  const data=buffer.getChannelData(0),sr=buffer.sampleRate,hop=Math.max(1,Math.floor(sr*.02)),energy=[];
  let peak=0;
  for(let i=0;i<data.length;i+=hop){let sum=0,n=Math.min(hop,data.length-i);for(let j=0;j<n;j++){const x=data[i+j];sum+=x*x}const rms=Math.sqrt(sum/n);energy.push(rms);if(rms>peak)peak=rms}
  const threshold=Math.max(.004,peak*.075),active=energy.map(v=>v>threshold);
  let first=active.indexOf(true),last=active.lastIndexOf(true);if(first<0)return Array.from({length:expected},(_,i)=>({start:i*buffer.duration/expected,end:(i+1)*buffer.duration/expected}));
  const gaps=[];let i=first;
  while(i<=last){if(active[i]){i++;continue}const s=i;while(i<=last&&!active[i])i++;const e=i-1,d=(e-s+1)*.02;if(d>=.48)gaps.push({s,e,d})}
  const cuts=gaps.sort((a,b)=>b.d-a.d).slice(0,expected-1).sort((a,b)=>a.s-b.s).map(g=>(g.s+g.e)*.01);
  if(cuts.length!==expected-1){return Array.from({length:expected},(_,n)=>({start:n*buffer.duration/expected,end:(n+1)*buffer.duration/expected}))}
  const bounds=[0,...cuts,buffer.duration],segments=[];
  for(let n=0;n<expected;n++){let s=bounds[n],e=bounds[n+1],fs=Math.floor(s/.02),fe=Math.min(energy.length-1,Math.ceil(e/.02));while(fs<fe&&!active[fs])fs++;while(fe>fs&&!active[fe])fe--;segments.push({start:Math.max(0,fs*.02-.05),end:Math.min(buffer.duration,(fe+1)*.02+.08)})}
  return segments;
 }
 async loadMusic(){
  const found=[];
  for(const m of MUSIC){const blob=await this.getBlob(m.file,m.path);if(blob)found.push({name:m.file,url:URL.createObjectURL(blob)})}
  this.musicUrls.forEach(x=>URL.revokeObjectURL(x.url));this.musicUrls=found;return found;
 }
 async startMusic(){
  if(!this.musicOn)return;await this.init();if(!this.musicUrls.length||this.music)return;
  this.musicIndex%=this.musicUrls.length;this.music=new Audio(this.musicUrls[this.musicIndex].url);this.music.preload="auto";this.music.volume=0;
  this.music.onended=()=>{this.music=null;this.musicIndex=(this.musicIndex+1)%this.musicUrls.length;this.startMusic()};
  try{await this.music.play();this.fadeMusic(this.musicNormal,700)}catch{}
 }
 stopMusic(){if(this.music){this.music.pause();this.music.src="";this.music=null}}
 fadeMusic(target,duration=300){
  if(!this.music)return;const a=this.music,from=a.volume,start=performance.now();
  const tick=now=>{if(a!==this.music)return;const p=Math.min(1,(now-start)/duration);a.volume=Math.max(0,Math.min(1,from+(target-from)*p));if(p<1)requestAnimationFrame(tick)};requestAnimationFrame(tick);
 }
 duck(on){this.fadeMusic(on?this.musicDuck:this.musicNormal,on?180:500)}
 stopVoice(){if(this.currentSource){try{this.currentSource.stop()}catch{}this.currentSource=null}}
 async playBuffer(key,index){
  if(!this.voiceOn)return false;await this.init();const b=this.buffers[key],list=this.segments[key];if(!b||!list?.length)return false;
  this.ensureContext();this.stopVoice();const seg=list[Math.max(0,Math.min(list.length-1,index))];
  return new Promise(resolve=>{const src=this.context.createBufferSource();src.buffer=b;src.connect(this.voiceGain);src.onended=()=>{if(this.currentSource===src)this.currentSource=null;resolve(true)};this.currentSource=src;src.start(0,seg.start,Math.max(.1,seg.end-seg.start))});
 }
 async withDuck(fn){this.duck(true);document.querySelector(".audio-meter")?.classList.add("talking");try{return await fn()}finally{document.querySelector(".audio-meter")?.classList.remove("talking");this.duck(false)}}
 async playWorldIntro(worldId){if(!this.voiceOn)return;const map={farm:2,jungle:3,ocean:4};await this.withDuck(async()=>{await this.playBuffer("intro",map[worldId]??1);await wait(180);await this.playBuffer("intro",5+Math.floor(Math.random()*5))})}
 async playQuestion(){if(!this.voiceOn)return;await this.withDuck(()=>this.playBuffer("intro",5+Math.floor(Math.random()*5)))}
 async playFeedback(ok,animalIndex){if(!this.voiceOn)return;await this.withDuck(async()=>{await this.playBuffer(ok?"correct":"wrong",Math.floor(Math.random()*5));await wait(150);await this.playBuffer("animals",animalIndex)})}
 async playAnimal(animalIndex){if(!this.voiceOn)return;await this.withDuck(()=>this.playBuffer("animals",animalIndex))}
 async playEnding(score){if(!this.voiceOn)return;const i=score>=9?1:score>=6?0:2;await this.withDuck(()=>this.playBuffer("ending",i))}
 toggleVoice(){this.voiceOn=!this.voiceOn;if(!this.voiceOn)this.stopVoice();this.saveSettings();window.dispatchEvent(new CustomEvent("rraudiochange",{detail:this.status()}))}
 toggleMusic(){this.musicOn=!this.musicOn;this.saveSettings();if(this.musicOn)this.startMusic();else this.stopMusic();window.dispatchEvent(new CustomEvent("rraudiochange",{detail:this.status()}))}
}
window.RR_AUDIO=new RRAudioEngine();
window.RR_AUDIO_FILES=REQUIRED;
})();

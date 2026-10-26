(function(){
"use strict";
const audio=window.RR_AUDIO;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let firstQuestion=false;

function setupAudioUI(){
 const stats=document.querySelector(".stats");
 if(stats&&!document.querySelector(".sound-controls")){
  const controls=document.createElement("div");controls.className="sound-controls";
  controls.innerHTML='<button class="sound-btn" id="musicToggle" aria-label="Buka atau tutup muzik">🎵</button><button class="sound-btn" id="voiceToggle" aria-label="Buka atau tutup suara">🗣️</button>';
  stats.prepend(controls);
 }
 if(!document.querySelector("#rrAudioPicker")){
  const input=document.createElement("input");input.id="rrAudioPicker";input.type="file";input.accept="audio/mpeg,audio/mp3";input.multiple=true;input.hidden=true;document.body.append(input);
  input.addEventListener("change",async()=>{if(!input.files.length)return;toast("Sedang memasang audio…");const result=await audio.install(input.files);updateSoundUI();renderAudioBanner();toast(result.accepted.length+" fail audio diterima");input.value=""});
 }
 if(!document.querySelector(".audio-meter")){const meter=document.createElement("div");meter.className="audio-meter";meter.innerHTML="<i></i><i></i><i></i><i></i>";document.body.append(meter)}
 document.querySelector("#musicToggle")?.addEventListener("click",e=>{e.stopPropagation();audio.ensureContext();audio.toggleMusic();updateSoundUI()});
 document.querySelector("#voiceToggle")?.addEventListener("click",e=>{e.stopPropagation();audio.ensureContext();audio.toggleVoice();updateSoundUI()});
 document.addEventListener("click",e=>{if(e.target.closest("[data-install-audio]"))document.querySelector("#rrAudioPicker").click()});
 document.addEventListener("pointerdown",()=>{audio.ensureContext();audio.startMusic()},{once:true});
 window.addEventListener("rraudiochange",()=>{updateSoundUI();renderAudioBanner()});
 updateSoundUI();
}
function updateSoundUI(){
 const m=document.querySelector("#musicToggle"),v=document.querySelector("#voiceToggle");
 if(m){m.classList.toggle("off",!audio.musicOn);m.textContent=audio.musicOn?"🎵":"🔇";m.title=audio.musicOn?"Tutup muzik":"Buka muzik"}
 if(v){v.classList.toggle("off",!audio.voiceOn);v.textContent=audio.voiceOn?"🗣️":"🔕";v.title=audio.voiceOn?"Tutup suara":"Buka suara"}
}
function renderAudioBanner(){
 const old=document.querySelector(".audio-banner");if(old)old.remove();
 if(!document.querySelector(".hero"))return;
 const status=audio.status(),banner=document.createElement("div");
 banner.className="audio-banner "+(status.voice&&status.music?"audio-ready":"");
 if(status.voice&&status.music)banner.innerHTML='<span class="audio-icon">✅</span><span><b>Audio RimbaRia sudah aktif</b><small>Suara dan 4 lagu latar sedia dimainkan.</small></span>';
 else banner.innerHTML='<span class="audio-icon">🎧</span><span><b>Pasang audio RimbaRia</b><small>Pilih kesemua 9 fail MP3 sekali sahaja pada peranti ini.</small></span><button data-install-audio>Pilih 9 fail</button>';
 document.querySelector(".hero").after(banner);
}
function decorateHero(){
 const hero=document.querySelector(".hero");if(!hero||hero.querySelector(".hero-orb"))return;
 hero.insertAdjacentHTML("beforeend",'<i class="hero-orb one"></i><i class="hero-orb two"></i>');
}
function confetti(count=32){
 const colors=["#ffd447","#ff735c","#55bde8","#20ba7c","#a66cff"];
 for(let i=0;i<count;i++){const p=document.createElement("i");p.className="confetti-piece";p.style.left=Math.random()*100+"vw";p.style.background=colors[i%colors.length];p.style.setProperty("--fall",(1.25+Math.random()*1.1)+"s");p.style.setProperty("--drift",(-100+Math.random()*200)+"px");p.style.setProperty("--spin",(360+Math.random()*700)+"deg");document.body.append(p);setTimeout(()=>p.remove(),2600)}
}
function sparks(card){
 if(!card)return;for(let i=0;i<10;i++){const s=document.createElement("i");s.className="spark";s.textContent=i%2?"✨":"⭐";s.style.left="50%";s.style.top="48%";const a=Math.PI*2*i/10,r=70+Math.random()*75;s.style.setProperty("--x",Math.cos(a)*r+"px");s.style.setProperty("--y",Math.sin(a)*r+"px");card.append(s);setTimeout(()=>s.remove(),900)}
}

const baseHome=renderHome;
renderHome=function(){baseHome();decorateHero();renderAudioBanner()};
const baseStart=startQuiz;
startQuiz=function(worldId){firstQuestion=true;audio.ensureContext();audio.startMusic();baseStart(worldId)};
const baseQuestion=renderQuestion;
renderQuestion=function(){
 baseQuestion();
 requestAnimationFrame(()=>document.querySelector(".picture-card")?.classList.add("shown"));
 if(firstQuestion){firstQuestion=false;audio.playWorldIntro(quiz.world.id)}else audio.playQuestion();
};

answer=async function(id){
 if(quiz.locked)return;quiz.locked=true;
 const q=quiz.questions[quiz.index],ok=id===q.target.id;
 state.attempts++;
 if(ok){quiz.score++;state.correct++;state.stars++;state.xp+=10;if(!state.unlocked.includes(q.target.id))state.unlocked.push(q.target.id)}
 else quiz.hearts=Math.max(0,quiz.hearts-1);
 document.querySelectorAll(".answer").forEach(b=>{if(b.dataset.answer===q.target.id)b.classList.add("correct");else if(b.dataset.answer===id)b.classList.add("wrong");else b.classList.add("dim")});
 const card=document.querySelector(".picture-card");
 card?.classList.add(ok?"correct-burst":"wrong-wobble");
 if(ok){confetti(22);sparks(card)}else chime(false);
 const praise=["Hebat! Jawapan kamu betul!","Bagus sekali!","Pandainya kamu!","Syabas! Teruskan!","Wah, tepat sekali!"];
 const gentle=["Hampir betul. Jangan risau ya!","Tidak mengapa. Mari kita cuba lagi!","Oops, belum tepat. Kamu pasti boleh!","Jangan putus asa. Teruskan mencuba!","Mari cuba soalan seterusnya!"];
 const box=document.querySelector("#feedback");box.className="feedback "+(ok?"good":"bad");
 box.innerHTML='<h3>'+(ok?praise[Math.floor(Math.random()*praise.length)]:gentle[Math.floor(Math.random()*gentle.length)])+'</h3><p>'+q.target.emoji+" "+q.target.ms+" · "+q.target.en+'</p><button class="listen" data-listen="'+q.target.id+'">🔊 Dengar nama</button>';
 save();
 const animalIndex=ALL.findIndex(a=>a.id===q.target.id);
 if(!audio.readyVoice&&ok)chime(true);
 await Promise.all([audio.playFeedback(ok,animalIndex),delay(audio.readyVoice?1500:1900)]);
 await delay(250);
 quiz.index++;quiz.locked=false;
 if(quiz.index>=quiz.questions.length||quiz.hearts===0)finishQuiz();else renderQuestion();
};

const baseFinish=finishQuiz;
finishQuiz=function(){const score=quiz.score;baseFinish();if(score>=6){confetti(score>=9?55:36);sparks(document.querySelector(".result-card"))}audio.playEnding(score)};
listenAnimal=function(id){const index=ALL.findIndex(a=>a.id===id);if(index<0)return;audio.playAnimal(index).then(ok=>{if(!ok)toast("Pasang fail audio dahulu")})};

setupAudioUI();
renderHome();
audio.init().then(()=>{updateSoundUI();renderAudioBanner()});
})();

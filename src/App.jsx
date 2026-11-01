import React, { useEffect, useMemo, useState } from 'react';
import { Heart, MapPin, MessageCircle, UserRound, Compass, LogOut, Camera, X, Check, LoaderCircle, ShieldAlert } from 'lucide-react';
import { supabase, isConfigured } from './supabase';

const blank = { display_name:'', age:'', city:'', bio:'', photo_url:'' };
function App() {
  const [session,setSession] = useState(null);
  const [tab,setTab] = useState('discover');
  const [profile,setProfile] = useState(blank);
  const [profiles,setProfiles] = useState([]);
  const [likes,setLikes] = useState([]);
  const [matches,setMatches] = useState([]);
  const [activeMatch,setActiveMatch] = useState(null);
  const [messages,setMessages] = useState([]);
  const [message,setMessage] = useState('');
  const [authMode,setAuthMode] = useState('signup');
  const [auth,setAuth] = useState({email:'',password:''});
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const [cityFilter,setCityFilter] = useState('all');
  const [ageFilter,setAgeFilter] = useState('all');
  const [photoFile,setPhotoFile] = useState(null);
  const [editing,setEditing] = useState(false);
  const [reportTarget,setReportTarget] = useState(null);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(session) loadAll(); },[session]);
  useEffect(()=>{ if(activeMatch && session) loadMessages(activeMatch); },[activeMatch,session]);

  async function loadAll(){
    const uid = session.user.id;
    const {data:mine} = await supabase.from('profiles').select('*').eq('id',uid).maybeSingle();
    if(mine){ setProfile({...blank,...mine}); setEditing(false); } else { setProfile({...blank, id:uid}); setEditing(true); }
    const {data:others} = await supabase.from('profiles').select('*').neq('id',uid).order('created_at',{ascending:false});
    setProfiles(others||[]);
    const {data:myLikes} = await supabase.from('likes').select('liked_id').eq('liker_id',uid);
    setLikes((myLikes||[]).map(x=>x.liked_id));
    const {data:myMatches} = await supabase.from('matches').select('id,user_a,user_b,created_at');
    const relevant=(myMatches||[]).filter(m=>m.user_a===uid||m.user_b===uid);
    const ids=[...new Set(relevant.map(m=>m.user_a===uid?m.user_b:m.user_a))];
    const {data:matchProfiles}=ids.length?await supabase.from('profiles').select('*').in('id',ids):{data:[]};
    setMatches(relevant.map(m=>({...m,person:(matchProfiles||[]).find(p=>p.id===(m.user_a===uid?m.user_b:m.user_a))})).filter(m=>m.person));
  }
  async function loadMessages(match){
    const {data}=await supabase.from('messages').select('*').eq('match_id',match.id).order('created_at',{ascending:true});
    setMessages(data||[]);
    const channel=supabase.channel('messages-'+match.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`match_id=eq.${match.id}`},payload=>{
      setMessages(old=>old.some(m=>m.id===payload.new.id)?old:[...old,payload.new]);
    }).subscribe();
    return ()=>supabase.removeChannel(channel);
  }
  async function submitAuth(e){
    e.preventDefault(); setBusy(true); setNotice('');
    const fn=authMode==='signup'?supabase.auth.signUp({email:auth.email,password:auth.password}):supabase.auth.signInWithPassword({email:auth.email,password:auth.password});
    const {error}=await fn;
    setNotice(error?.message || (authMode==='signup'?'Compte créé. Vérifie ton e-mail si une confirmation est demandée.':'Connexion réussie.'));
    setBusy(false);
  }
  async function saveProfile(e){
    e?.preventDefault(); if(!session) return;
    if(Number(profile.age)<18){setNotice('Élyssia est réservé aux personnes de 18 ans et plus.');return;}
    setBusy(true);setNotice('');
    let photo_url=profile.photo_url||'';
    if(photoFile){
      const ext=(photoFile.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path=`${session.user.id}/${Date.now()}.${ext}`;
      const {error:upErr}=await supabase.storage.from('profile-photos').upload(path,photoFile,{upsert:true,contentType:photoFile.type});
      if(upErr){setNotice('Photo non envoyée : '+upErr.message);setBusy(false);return;}
      photo_url=supabase.storage.from('profile-photos').getPublicUrl(path).data.publicUrl;
    }
    const payload={id:session.user.id,display_name:profile.display_name.trim(),age:Number(profile.age),city:profile.city.trim(),bio:profile.bio.trim(),photo_url};
    const {error}=await supabase.from('profiles').upsert(payload);
    setBusy(false);
    if(error){setNotice('Enregistrement impossible : '+error.message);return;}
    setProfile({...profile,...payload});setEditing(false);setNotice('Ton profil est enregistré 💜');loadAll();
  }
  async function like(person){
    if(likes.includes(person.id)) return;
    const {error}=await supabase.from('likes').insert({liker_id:session.user.id,liked_id:person.id});
    if(error){setNotice('Impossible d’envoyer le like : '+error.message);return;}
    setLikes(old=>[...old,person.id]);
    const {data:reciprocal}=await supabase.from('likes').select('id').eq('liker_id',person.id).eq('liked_id',session.user.id).maybeSingle();
    if(reciprocal){ setNotice(`C’est un match avec ${person.display_name} ! 💜`); }
    else setNotice(`Like envoyé à ${person.display_name}.`);
    loadAll();
  }
  async function sendMessage(e){
    e.preventDefault(); if(!message.trim()||!activeMatch)return;
    const body=message.trim();setMessage('');
    const {error}=await supabase.from('messages').insert({match_id:activeMatch.id,sender_id:session.user.id,body});
    if(error)setNotice('Message non envoyé : '+error.message);
    else loadMessages(activeMatch);
  }
  async function report(){
    if(!reportTarget)return;
    const {error}=await supabase.from('reports').insert({reporter_id:session.user.id,reported_id:reportTarget,reason:'Signalement envoyé depuis le profil'});
    setNotice(error?'Impossible d’envoyer le signalement.':'Signalement envoyé. Merci de contribuer à la sécurité de Élyssia.');
    setReportTarget(null);
  }

  const cities=useMemo(()=>[...new Set(profiles.map(p=>p.city).filter(Boolean))].sort(),[profiles]);
  const visible=profiles.filter(p=>!likes.includes(p.id)&&(cityFilter==='all'||p.city===cityFilter)&&(ageFilter==='all'||(Number(p.age)>=Number(ageFilter)&&Number(p.age)<=Number(ageFilter)+9)));
  if(!isConfigured) return <SetupScreen/>;
  if(!session) return <main className="auth-page"><div className="brand"><span className="brand-icon"><Heart fill="white"/></span><span>Élyssia</span></div><section className="auth-card"><span className="eyebrow">DES RENCONTRES, NATURELLEMENT</span><h1>{authMode==='signup'?'Bienvenue sur Élyssia 💜':'Heureux de te revoir !'}</h1><p>Crée ton compte pour rencontrer de nouvelles personnes.</p><form onSubmit={submitAuth}><label>E-mail<input type="email" required value={auth.email} onChange={e=>setAuth({...auth,email:e.target.value})} placeholder="toi@exemple.com"/></label><label>Mot de passe<input type="password" minLength="8" required value={auth.password} onChange={e=>setAuth({...auth,password:e.target.value})} placeholder="8 caractères minimum"/></label><button className="primary full" disabled={busy}>{busy?<LoaderCircle className="spin"/>:authMode==='signup'?'Créer mon compte':'Me connecter'}</button></form><p className="switch">{authMode==='signup'?'Déjà un compte ?':'Pas encore de compte ?'} <button className="text-button" onClick={()=>setAuthMode(authMode==='signup'?'login':'signup')}>{authMode==='signup'?'Se connecter':'Créer un compte'}</button></p><p className="small">Réservé aux personnes majeures (18+). En créant un compte, tu acceptes les règles de sécurité du site.</p>{notice&&<div className="notice">{notice}</div>}</section></main>;

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon"><Heart fill="white"/></span><span>Élyssia</span></div><div className="header-actions"><span className="online"><i/> Espace découverte</span><button className="icon-button" title="Déconnexion" onClick={()=>supabase.auth.signOut()}><LogOut size={19}/></button></div></header>
    <main className="main">
      <section className="hero"><div><p className="eyebrow">BIENVENUE SUR ÉLYSSIA</p><h1>De belles rencontres,<br/><em>naturellement.</em></h1><p className="subhead">Découvre des personnes qui pourraient te correspondre.</p></div><button className="primary" onClick={()=>{setTab('profile');setEditing(true)}}>Créer mon profil <span>＋</span></button></section>
      {notice&&<div className="notice"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={16}/></button></div>}
      <nav className="tabs"><button className={tab==='discover'?'active':''} onClick={()=>setTab('discover')}><Compass size={18}/> Découverte</button><button className={tab==='matches'?'active':''} onClick={()=>setTab('matches')}><Heart size={18}/> Mes matchs <b>{matches.length}</b></button><button className={tab==='messages'?'active':''} onClick={()=>setTab('messages')}><MessageCircle size={18}/> Messages</button><button className={tab==='profile'?'active':''} onClick={()=>setTab('profile')}><UserRound size={18}/> Mon profil</button></nav>
      {tab==='discover'&&<><div className="filters"><label>Ville<select value={cityFilter} onChange={e=>setCityFilter(e.target.value)}><option value="all">Toutes les villes</option>{cities.map(c=><option key={c}>{c}</option>)}</select></label><label>Âge<select value={ageFilter} onChange={e=>setAgeFilter(e.target.value)}><option value="all">Tous les âges</option>{[18,20,25,30,35,40,45,50].map(a=><option value={a} key={a}>{a}–{a+9} ans</option>)}</select></label></div>
        {!profile.display_name&&<div className="notice">Commence par compléter ton profil dans « Mon profil » pour participer aux rencontres.</div>}
        {visible.length===0?<div className="empty"><div className="empty-icon"><Heart size={28}/></div><h2>Les prochaines belles rencontres commencent ici</h2><p>{profiles.length===0?'Il n’y a pas encore de profils publiés. Reviens bientôt ou invite des amis majeurs.':'Aucun profil ne correspond à ces filtres pour le moment.'}</p><button className="secondary" onClick={()=>{setTab('profile');setEditing(true)}}>Compléter mon profil</button></div>:<div className="profile-grid">{visible.map(p=><article className="person-card" key={p.id}><div className="person-photo">{p.photo_url?<img src={p.photo_url} alt={`Photo de ${p.display_name}`}/>:<div className="avatar-placeholder"><UserRound size={60}/></div>}<span className="age-badge">{p.age} ans</span><button className="report-button" title="Signaler ce profil" onClick={()=>setReportTarget(p.id)}><ShieldAlert size={17}/></button></div><div className="person-info"><h3>{p.display_name}</h3><p className="location"><MapPin size={15}/>{p.city||'Ville non renseignée'}</p><p className="bio">{p.bio||'Prêt(e) à faire de belles rencontres.'}</p><button className="primary full" disabled={likes.includes(p.id)} onClick={()=>like(p)}><Heart size={17}/> {likes.includes(p.id)?'Like envoyé':'Envoyer un like'}</button></div></article>)}</div>}</>}
      {tab==='profile'&&<section className="form-card"><div className="section-heading"><div><p className="eyebrow">TON ESPACE PERSONNEL</p><h2>Mon profil</h2></div>{!editing&&<button className="secondary" onClick={()=>setEditing(true)}>Modifier</button>}</div>{editing?<form className="profile-form" onSubmit={saveProfile}><label>Nom ou prénom affiché<input required maxLength="40" value={profile.display_name||''} onChange={e=>setProfile({...profile,display_name:e.target.value})} placeholder="Ex. Ariane"/></label><label>Âge (18 ans minimum)<input required type="number" min="18" max="110" value={profile.age||''} onChange={e=>setProfile({...profile,age:e.target.value})} placeholder="24"/></label><label>Ville<input maxLength="80" value={profile.city||''} onChange={e=>setProfile({...profile,city:e.target.value})} placeholder="Ex. Cotonou"/></label><label>À propos de toi<textarea maxLength="500" rows="4" value={profile.bio||''} onChange={e=>setProfile({...profile,bio:e.target.value})} placeholder="Parle un peu de toi…"/></label><label className="upload-label"><Camera size={18}/> Ajouter une photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPhotoFile(e.target.files?.[0]||null)}/></label>{photoFile&&<p className="small">Photo choisie : {photoFile.name}</p>}{profile.photo_url&&!photoFile&&<img className="preview" src={profile.photo_url} alt="Photo de profil actuelle"/>}<button className="primary" disabled={busy}>{busy?<LoaderCircle className="spin"/>:<Check size={18}/>} Enregistrer mon profil</button></form>:<div className="my-profile"><div className="my-avatar">{profile.photo_url?<img src={profile.photo_url} alt="Ma photo"/>:<UserRound size={45}/>}</div><div><h3>{profile.display_name}, {profile.age} ans</h3><p className="location"><MapPin size={15}/>{profile.city}</p><p>{profile.bio}</p></div></div>}</section>}
      {(tab==='matches'||tab==='messages')&&<section className="form-card"><div className="section-heading"><div><p className="eyebrow">VOS CONNEXIONS</p><h2>{tab==='matches'?'Mes matchs':'Messagerie'}</h2></div></div>{matches.length===0?<div className="empty compact"><Heart size={28}/><h3>Pas encore de match</h3><p>Quand deux personnes s’envoient un like, leur match apparaîtra ici.</p><button className="secondary" onClick={()=>setTab('discover')}>Découvrir des profils</button></div>:<div className="chat-layout"><div className="match-list">{matches.map(m=><button key={m.id} className={`match-row ${activeMatch?.id===m.id?'selected':''}`} onClick={()=>setActiveMatch(m)}><span className="tiny-avatar">{m.person.photo_url?<img src={m.person.photo_url} alt=""/>:<UserRound size={20}/>}</span><span><strong>{m.person.display_name}</strong><small>{m.person.city}</small></span><MessageCircle size={17}/></button>)}</div><div className="chat-panel">{activeMatch?<><div className="chat-title">💜 Discussion avec {activeMatch.person.display_name}</div><div className="messages">{messages.map(m=><div key={m.id} className={`bubble ${m.sender_id===session.user.id?'mine':'theirs'}`}>{m.body}<small>{new Date(m.created_at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'})}</small></div>)}</div><form className="message-form" onSubmit={sendMessage}><input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Écris un message…" maxLength="2000"/><button className="primary" disabled={!message.trim()}>Envoyer</button></form></>:<div className="empty compact"><MessageCircle size={25}/><p>Choisis un match pour ouvrir la conversation.</p></div>}</div></div>}</section>}
      <footer>© 2026 Élyssia · Fait avec 💜 pour rapprocher les cœurs <span>Prototype en évolution · Sois respectueux et prudent en ligne.</span></footer>
    </main>
    {reportTarget&&<div className="modal-backdrop"><section className="modal"><button className="close" onClick={()=>setReportTarget(null)}><X/></button><ShieldAlert size={30}/><h2>Signaler ce profil ?</h2><p>Notre équipe devra examiner le signalement. Ne signale que les comportements qui te préoccupent.</p><button className="primary full" onClick={report}>Confirmer le signalement</button><button className="secondary full" onClick={()=>setReportTarget(null)}>Annuler</button></section></div>}
  </div>;
}
function SetupScreen(){return <main className="auth-page"><div className="brand"><span className="brand-icon"><Heart fill="white"/></span><span>Élyssia</span></div><section className="auth-card"><h1>Encore une petite étape 💜</h1><p>Le site est prêt à être relié à sa base de données Supabase. Suis le guide dans le fichier <b>DEMARRAGE.md</b> du dossier fourni, puis ajoute les deux clés du projet.</p><div className="notice">Pour des raisons de sécurité, ne partage jamais de clé secrète Supabase ou de mot de passe ici.</div></section></main>}
export default App;
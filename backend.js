(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const config = window.CODEKITA_CONFIG || {};
  const configured = Boolean(
    window.supabase?.createClient &&
    /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/.test(config.supabaseUrl || '') &&
    config.supabaseAnonKey &&
    !String(config.supabaseAnonKey).startsWith('YOUR_')
  );
  const db = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  const app = { db, user: null, profile: null, ready: false, selectedConversation: null, collectionRows: [], conversationMap: new Map() };
  const userKey = id => 'db_' + id;
  const initials = name => String(name || 'CK').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'CK';
  const timeAgo = value => {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return 'baru saja';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' mnt lalu';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' jam lalu';
    return Math.floor(seconds / 86400) + ' hari lalu';
  };
  const fail = error => {
    console.error('[CodeKita]', error);
    toast(error?.message || 'Permintaan gagal. Coba kembali.');
  };
  const requireUser = () => {
    if (!app.user) { openAuth('signin'); return false; }
    if (!app.db) { toast('Hubungkan Supabase terlebih dahulu. Petunjuk tersedia di README.'); return false; }
    return true;
  };
  function setStatus(message, isError = false) {
    let status = $('#backendBanner');
    if (!status) return;
    status.hidden = false;
    status.classList.toggle('backend-error', isError);
    status.innerHTML = message;
  }
  function updateAccountUi() {
    const authButton = $('#authButton');
    const account = $('#accountSummary');
    const profileShortcut = $('#profileShortcut');
    const profileName = $('#profileName');
    const profileBio = $('#profileBio');
    const profileHandle = $('#profileHandle');
    const profileAvatar = $('#profileAvatar');
    if (authButton) authButton.textContent = app.user ? 'Keluar' : 'Masuk';
    if (account) {
      const name = app.profile?.display_name || app.user?.email || 'Belum masuk';
      const handle = app.profile?.username ? '@' + app.profile.username : (app.user ? app.user.email : 'Akun CodeKita');
      account.innerHTML = '<div class="avatar avatar-me">' + escapeHtml(initials(name)) + '</div><div><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(handle) + '</small></div>';
    }
    if (profileName) profileName.textContent = app.profile?.display_name || 'Belum masuk';
    if (profileBio) profileBio.textContent = app.profile?.bio || (app.user ? 'Tambahkan bio untuk memperkenalkan dirimu.' : 'Masuk untuk mengatur profilmu.');
    if (profileHandle) profileHandle.textContent = app.profile?.username ? '@' + app.profile.username : '@akun-belum-terhubung';
    if (profileAvatar) profileAvatar.textContent = initials(app.profile?.display_name || app.user?.email || 'CK');
    if (profileShortcut) profileShortcut.textContent = initials(app.profile?.display_name || app.user?.email || 'CK');
    $('#profileLocation') && ($('#profileLocation').textContent = app.profile?.location || '');
    $('#profileWebsite') && ($('#profileWebsite').textContent = app.profile?.website || '');
    const banner = $('#backendBanner');
    if (!configured) {
      setStatus('<strong>Backend belum terhubung.</strong> Isi Project URL dan publishable/anon key di <code>supabase-config.js</code>, lalu jalankan <code>supabase/schema.sql</code> pada SQL Editor. Baca <a href="README.md" target="_blank" rel="noreferrer">panduan setup</a>.');
    } else if (banner) {
      banner.hidden = app.ready;
      if (!app.ready) setStatus('<strong>Menghubungkan ke CodeKita…</strong> Mengambil status akun dan data dari server.');
    }
  }
  function openPasswordRecovery() {
    if(!db||!app.user)return;
    showModal('Atur kata sandi baru','<div class="field"><label for="newPassword">Kata sandi baru</label><input id="newPassword" type="password" minlength="8" autocomplete="new-password" required></div><p class="muted">Gunakan minimal 8 karakter.</p>','Simpan kata sandi',()=>true);
    $('#modalConfirm').onclick=async()=>{const password=$('#newPassword').value;if(password.length<8){toast('Kata sandi minimal 8 karakter.');return}const {error}=await db.auth.updateUser({password});if(error){fail(error);return}$('#modal').close();toast('Kata sandi berhasil diperbarui.')};
  }
  function openAuth(mode = 'signin') {
    if (!db) {
      showModal('Hubungkan backend', '<p>Autentikasi sungguhan memerlukan proyek Supabase.</p><div class="auth-note">1. Buat proyek di Supabase. 2. Jalankan <code>supabase/schema.sql</code> di SQL Editor. 3. Masukkan Project URL dan publishable/anon key ke <code>supabase-config.js</code>. Lihat README untuk panduan lengkap.</div><p><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Buka Supabase Dashboard ↗</a></p>', 'Mengerti', () => true);
      return;
    }
    renderAuthForm(mode);
    $('#modal').showModal();
  }
  function renderAuthForm(mode) {
    const signup = mode === 'signup';
    $('#modalContent').innerHTML = '<div class="auth-form"><h2>' + (signup ? 'Buat akun CodeKita' : 'Masuk ke CodeKita') + '</h2><p>' + (signup ? 'Buat akun dengan email aktif untuk mulai membagikan proyek.' : 'Masuk untuk menyimpan proyek dan berinteraksi dengan komunitas.') + '</p>' +
      (signup ? '<div class="field"><label for="authName">Nama tampilan</label><input id="authName" maxlength="60" autocomplete="name" required placeholder="Nama kamu"></div>' : '') +
      '<div class="field"><label for="authEmail">Email</label><input id="authEmail" type="email" autocomplete="email" required placeholder="nama@email.com"></div><div class="field"><label for="authPassword">Kata sandi</label><input id="authPassword" type="password" minlength="8" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" required placeholder="Minimal 8 karakter"></div><p id="authError" class="auth-error" hidden></p><button type="button" class="btn btn-primary btn-block" id="authSubmit">' + (signup ? 'Daftar' : 'Masuk') + '</button><button type="button" class="auth-switch" id="authSwitch">' + (signup ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar') + '</button><button type="button" class="auth-switch" id="authReset">Lupa kata sandi?</button></div>';
    $('#authSubmit').onclick = async () => {
      const email = $('#authEmail').value.trim();
      const password = $('#authPassword').value;
      const name = $('#authName')?.value.trim();
      const err = $('#authError');
      err.hidden = true;
      if (!email || !password || (signup && !name)) { err.textContent = 'Lengkapi semua kolom.'; err.hidden = false; return; }
      if (password.length < 8) { err.textContent = 'Kata sandi harus minimal 8 karakter.'; err.hidden = false; return; }
      const button = $('#authSubmit'); button.disabled = true; button.textContent = 'Memproses…';
      try {
        if (signup) {
          const { data, error } = await db.auth.signUp({ email, password, options: { data: { display_name: name } } });
          if (error) throw error;
          if(data?.session){$('#modal').close();toast('Akun berhasil dibuat.');return}
          err.textContent = 'Pendaftaran diterima. Periksa email untuk verifikasi sebelum masuk jika verifikasi email diaktifkan.';
          err.classList.remove('auth-error'); err.classList.add('auth-note'); err.hidden = false;
          button.textContent = 'Email verifikasi dikirim';
        } else {
          const { error } = await db.auth.signInWithPassword({ email, password });
          if (error) throw error;
          $('#modal').close();
          toast('Berhasil masuk.');
        }
      } catch (error) {
        err.classList.add('auth-error'); err.classList.remove('auth-note'); err.textContent = error.message || 'Autentikasi gagal.'; err.hidden = false;
      } finally {
        if (button.isConnected && button.textContent !== 'Email verifikasi dikirim') { button.disabled = false; button.textContent = signup ? 'Daftar' : 'Masuk'; }
      }
    };
    $('#authSwitch').onclick = () => renderAuthForm(signup ? 'signin' : 'signup');
    $('#authReset').onclick = async () => {
      const email = $('#authEmail').value.trim();
      const err = $('#authError');
      if (!email) { err.textContent = 'Isi email terlebih dahulu.'; err.hidden = false; return; }
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) { err.textContent = error.message; err.hidden = false; return; }
      err.textContent = 'Jika email terdaftar, instruksi pemulihan akan dikirim.'; err.classList.remove('auth-error'); err.classList.add('auth-note'); err.hidden = false;
    };
  }
  function normalizeProject(row) {
    const p = row.profiles || {};
    const key = userKey(row.user_id);
    const name = p.display_name || 'Pengguna CodeKita';
    users[key] = { id: row.user_id, name, handle: '@' + (p.username || 'pengguna'), initials: initials(name), color: 'avatar-me', bio: p.bio || '' };
    const created = row.created_at ? timeAgo(row.created_at) : 'baru saja';
    return {
      id: row.id, user: key, userId: row.user_id, title: row.title, description: row.description || '',
      tags: row.tags || [], category: row.category || 'Eksperimen', level: row.level || 'Pemula',
      type: row.category === 'Kalkulator' ? 'calculator' : row.category === 'Mini-game' ? 'game' : row.category === 'Animasi' ? 'animation' : row.category === 'Dashboard' ? 'dashboard' : row.category === 'Portfolio' ? 'portfolio' : 'landing',
      likes: row.project_likes?.length || 0, comments: row.comments?.length || 0, remixes: row.project_reposts?.length || 0,
      created, createdAt: row.created_at, collection: '', status: row.status, visibility: row.visibility,
      parentProjectId: row.parent_project_id,
      code: { html: row.html_code || '', css: row.css_code || '', js: row.js_code || '' }
    };
  }
  async function loadProjects() {
    if (!db) return;
    const select = '*, profiles!projects_user_id_fkey(id,display_name,username,bio,avatar_url), project_likes(user_id), project_reposts(user_id), comments(id)';
    const { data: publicRows, error: publicError } = await db.from('projects').select(select).eq('status','published').eq('visibility','public').order('created_at',{ascending:false}).limit(100);
    if (publicError) throw publicError;
    let ownRows = [];
    if (app.user) {
      const { data, error } = await db.from('projects').select(select).eq('user_id',app.user.id).order('updated_at',{ascending:false}).limit(100);
      if (error) throw error;
      ownRows = data || [];
    }
    const publicMapped = (publicRows || []).map(normalizeProject);
    const ownMapped = ownRows.map(normalizeProject);
    const ownIds = new Set(ownMapped.map(p => p.id));
    projects.splice(0, projects.length, ...publicMapped.filter(p => !ownIds.has(p.id)));
    userProjects.splice(0, userProjects.length, ...ownMapped);
    const liked = app.user ? await db.from('project_likes').select('project_id').eq('user_id',app.user.id) : {data:[]};
    if (liked.error) throw liked.error;
    state.liked.clear(); (liked.data || []).forEach(r => state.liked.add(r.project_id));
    const saved = app.user ? await db.from('bookmarks').select('project_id,collection_id,collections(name)').eq('user_id',app.user.id) : {data:[]};
    if (saved.error) throw saved.error;
    state.saved.clear(); (saved.data || []).forEach(r => { state.saved.add(r.project_id); const project=[...projects,...userProjects].find(p=>p.id===r.project_id); if(project) project.collection=r.collections?.name||''; });
    const followed = app.user ? await db.from('follows').select('following_id').eq('follower_id',app.user.id) : {data:[]};
    if (followed.error) throw followed.error;
    state.followed.clear(); (followed.data || []).forEach(r => state.followed.add(userKey(r.following_id)));
    const reposted = app.user ? await db.from('project_reposts').select('project_id').eq('user_id',app.user.id) : {data:[]};
    if (reposted.error) throw reposted.error;
    app.reposted = new Set((reposted.data || []).map(r => r.project_id));
    state.reposted = new Set(app.reposted);
  }
  async function loadCreators() {
    if(!db){app.creatorProfiles=[];return}
    const query=db.from('profiles').select('id,username,display_name,bio,avatar_url').order('created_at',{ascending:false}).limit(12);
    const {data,error}=await query;if(error)throw error;
    app.creatorProfiles=(data||[]).filter(p=>p.id!==app.user?.id);
    app.creatorProfiles.forEach(p=>{const key=userKey(p.id);users[key]={id:p.id,name:p.display_name||'Pengguna',handle:'@'+p.username,initials:initials(p.display_name),color:'avatar-me',bio:p.bio||''}});
    renderCreators();
  }
  function renderCreators(){
    const wrap=$('#suggestedCreators');if(!wrap)return;
    const people=(app.creatorProfiles||[]).slice(0,6);
    wrap.innerHTML=people.length?people.map(p=>{const key=userKey(p.id),following=state.followed.has(key);return '<div class="creator-row">'+avatar(key)+'<div class="creator-info"><strong>'+escapeHtml(p.display_name||'Pengguna')+'</strong><small>'+escapeHtml('@'+p.username)+'</small></div><button class="follow-btn '+(following?'following':'')+'" data-follow="'+escapeHtml(key)+'">'+(following?'Mengikuti':'Ikuti')+'</button></div>'}).join(''):'<div class="empty-state">Belum ada kreator lain. Akun baru akan muncul di sini setelah mendaftar.</div>';
  }
  async function loadOwnProfile() {
    if (!app.user) { app.profile = null; return; }
    const { data, error } = await db.from('profiles').select('*').eq('id',app.user.id).maybeSingle();
    if (error) throw error;
    app.profile = data;
    users[userKey(app.user.id)] = { id: app.user.id, name: data?.display_name || 'Pengguna CodeKita', handle: '@' + (data?.username || 'pengguna'), initials: initials(data?.display_name), color: 'avatar-me', bio: data?.bio || '' };
  }
  async function loadNotifications() {
    notifications.splice(0, notifications.length);
    if (!app.user) { renderNotifications(); return; }
    const { data, error } = await db.from('notifications').select('*, actor:profiles!notifications_actor_id_fkey(id,display_name,username,bio), projects(title)').eq('recipient_id',app.user.id).order('created_at',{ascending:false}).limit(100);
    if (error) throw error;
    (data || []).forEach(n => {
      const actorKey = n.actor_id ? userKey(n.actor_id) : null;
      if (n.actor) users[actorKey] = {id:n.actor.id,name:n.actor.display_name,handle:'@'+n.actor.username,initials:initials(n.actor.display_name),color:'avatar-me',bio:n.actor.bio||''};
      const templates = { like:'menyukai proyekmu', comment:'mengomentari proyekmu', follow:'mulai mengikutimu', repost:'membagikan ulang proyekmu', message:'mengirimimu pesan', system:'aktivitas sistem' };
      notifications.push({id:n.id,type:n.type,user:actorKey,text:templates[n.type]||'melakukan aktivitas',project:n.projects?.title||'',time:timeAgo(n.created_at),unread:!n.is_read});
    });
    renderNotifications();
  }
  async function loadCollections() {
    app.collectionRows = [];
    if (!app.user) return;
    const { data, error } = await db.from('collections').select('*').eq('user_id',app.user.id).order('created_at',{ascending:true});
    if (error) throw error;
    app.collectionRows = data || [];
    const row = $('.collection-row');
    if (row) {
      row.querySelectorAll('[data-dynamic-collection]').forEach(el=>el.remove());
      app.collectionRows.forEach(c => {
        const btn=document.createElement('button'); btn.className='collection-card'; btn.dataset.collection=c.name; btn.dataset.dynamicCollection='true';
        btn.innerHTML='<span class="collection-icon purple">▣</span><span><strong>'+escapeHtml(c.name)+'</strong><small>Privat · Koleksi</small></span>';
        row.appendChild(btn);
      });
    }
  }
  async function loadConversations() {
    conversations.splice(0, conversations.length);
    app.conversationMap.clear();
    if (!app.user) { renderConversations(); return; }
    const { data, error } = await db.from('messages').select('id,sender_id,recipient_id,body,created_at,read_at').or('sender_id.eq.'+app.user.id+',recipient_id.eq.'+app.user.id).order('created_at',{ascending:false}).limit(500);
    if (error) throw error;
    const latest = new Map();
    (data||[]).forEach(m => {
      const other = m.sender_id === app.user.id ? m.recipient_id : m.sender_id;
      if (!latest.has(other)) latest.set(other,m);
    });
    const otherIds=[...latest.keys()];
    if (otherIds.length) {
      const {data: people,error: peopleError}=await db.from('profiles').select('id,display_name,username,bio').in('id',otherIds);
      if (peopleError) throw peopleError;
      (people||[]).forEach(p=>{users[userKey(p.id)]={id:p.id,name:p.display_name,handle:'@'+p.username,initials:initials(p.display_name),color:'avatar-me',bio:p.bio||''}});
    }
    for (const [other,m] of latest) {
      const key=userKey(other);
      app.conversationMap.set(key,other);
      conversations.push({user:key,last:m.body,time:timeAgo(m.created_at),active:app.selectedConversation===key});
    }
    renderConversations();
    if (app.selectedConversation) await loadChat(app.selectedConversation);
  }
  async function loadChat(key) {
    if (!app.user || !app.conversationMap.has(key)) return;
    app.selectedConversation=key;
    const otherId=app.conversationMap.get(key);
    const {data,error}=await db.from('messages').select('*').or('and(sender_id.eq.'+app.user.id+',recipient_id.eq.'+otherId+'),and(sender_id.eq.'+otherId+',recipient_id.eq.'+app.user.id+')').order('created_at',{ascending:true}).limit(300);
    if(error){fail(error);return}
    const wrap=$('#chatMessages'); if(!wrap)return;
    wrap.innerHTML='';
    if(!(data||[]).length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='Belum ada pesan. Kirim pesan pertama untuk memulai percakapan.';wrap.appendChild(empty);}
    (data||[]).forEach(m=>{
      const b=document.createElement('div');b.className='chat-bubble '+(m.sender_id===app.user.id?'sent':'received');b.textContent=m.body;wrap.appendChild(b);
    });
    wrap.scrollTop=wrap.scrollHeight;
    await db.from('messages').update({read_at:new Date().toISOString()}).eq('recipient_id',app.user.id).eq('sender_id',otherId).is('read_at',null);
    $$('.conversation-item').forEach(el=>el.classList.toggle('active',el.dataset.conversation===key));
  }
  async function loadProfileCounts(){
    if(!app.user||!db){$('#profileFollowerCount').textContent='0';$('#profileFollowingCount').textContent='0';return;}
    const [followers,following]=await Promise.all([
      db.from('follows').select('follower_id',{count:'exact',head:true}).eq('following_id',app.user.id),
      db.from('follows').select('following_id',{count:'exact',head:true}).eq('follower_id',app.user.id)
    ]);
    if(followers.error)throw followers.error;if(following.error)throw following.error;
    $('#profileFollowerCount').textContent=String(followers.count||0);$('#profileFollowingCount').textContent=String(following.count||0);
  }
  async function refreshAll() {
    if (!db) { updateAccountUi(); renderFeed(); renderExplore(); renderSaved(); renderProfile(); renderNotifications(); renderConversations(); return; }
    try {
      await loadOwnProfile();
      await loadProjects();
      await Promise.all([loadNotifications(),loadCollections(),loadConversations(),loadProfileCounts(),loadCreators()]);
      renderFeed(); renderExplore(); renderSaved(); renderProfile(); updateAccountUi();
      app.ready=true;
      const banner=$('#backendBanner'); if(banner)banner.hidden=true;
    } catch(error) {
      updateAccountUi();
      setStatus('<strong>Belum dapat memuat data.</strong> Periksa konfigurasi Supabase dan jalankan skema database sesuai README. Detail: '+escapeHtml(error.message||'koneksi gagal'),true);
    }
  }
  async function onLike(id) {
    if(!requireUser())return;
    const exists=state.liked.has(id);
    try {
      if(exists){const {error}=await db.from('project_likes').delete().eq('project_id',id).eq('user_id',app.user.id);if(error)throw error;state.liked.delete(id)}
      else {const {error}=await db.from('project_likes').insert({project_id:id,user_id:app.user.id});if(error)throw error;state.liked.add(id)}
      await loadProjects(); renderCurrentPage(); 
    } catch(error){fail(error)}
  }
  async function onBookmark(id) {
    if(!requireUser())return;
    const exists=state.saved.has(id);
    try {
      if(exists){const {error}=await db.from('bookmarks').delete().eq('project_id',id).eq('user_id',app.user.id);if(error)throw error;state.saved.delete(id)}
      else {const selectedCollection=app.collectionRows.find(c=>c.name===state.savedCollection);const {error}=await db.from('bookmarks').insert({project_id:id,user_id:app.user.id,collection_id:selectedCollection?.id||null});if(error)throw error;state.saved.add(id)}
      renderCurrentPage();
    } catch(error){fail(error)}
  }
  async function onFollow(key) {
    if(!requireUser())return;
    const target=users[key]?.id;
    if(!target){toast('Profil kreator tidak tersedia.');return}
    if(target===app.user.id){toast('Kamu tidak dapat mengikuti akun sendiri.');return}
    const exists=state.followed.has(key);
    try {
      if(exists){const {error}=await db.from('follows').delete().eq('follower_id',app.user.id).eq('following_id',target);if(error)throw error;state.followed.delete(key)}
      else {const {error}=await db.from('follows').insert({follower_id:app.user.id,following_id:target});if(error)throw error;state.followed.add(key)}
      renderCurrentPage();await loadProfileCounts();renderCreators();
    } catch(error){fail(error)}
  }
  async function onRepost(id) {
    if(!requireUser())return;
    if(!getProject(id)){toast('Proyek tidak ditemukan.');return}
    const exists=app.reposted?.has(id);
    try {
      if(exists){const {error}=await db.from('project_reposts').delete().eq('project_id',id).eq('user_id',app.user.id);if(error)throw error;app.reposted.delete(id)}
      else {const {error}=await db.from('project_reposts').insert({project_id:id,user_id:app.user.id});if(error)throw error;app.reposted.add(id)}
      await loadProjects();renderCurrentPage();toast(exists?'Repost dibatalkan.':'Proyek dibagikan ulang.');
    } catch(error){fail(error)}
  }
  allProjects = function(){ return [...projects, ...userProjects.filter(p=>p.status==='published' && p.visibility==='public')]; };
  getProject = function(id){ return [...userProjects, ...projects].find(p=>p.id===id) || null; };
  renderFeed = function(){ const list=state.feed==='following'?allProjects().filter(p=>state.followed.has(p.user)):allProjects(); $('#feedPosts').innerHTML=list.length?list.slice(0,8).map(postMarkup).join(''):'<div class="empty-state"><strong>Belum ada proyek publik.</strong>Proyek yang dipublikasikan oleh pengguna akan muncul di sini.<br><button class="btn btn-primary" data-page="create" style="margin-top:14px">Buat proyek pertama</button></div>'; renderCreators(); };
  renderExplore = function(){ const query=($('#exploreSearch')?.value||$('#globalSearch')?.value||'').toLowerCase().trim(); const tech=$('#techFilter')?.value||'all'; const level=$('#levelFilter')?.value||'all'; const list=allProjects().filter(p=>(state.category==='Semua'||p.category===state.category||p.tags.includes(state.category))&&(tech==='all'||p.tags.includes(tech))&&(level==='all'||p.level===level)&&(!query||[p.title,p.description,users[p.user]?.name||'',users[p.user]?.handle||'',...p.tags].join(' ').toLowerCase().includes(query))); $('#exploreGrid').innerHTML=list.length?list.map(projectCard).join(''):'<div class="empty-state"><strong>Belum ada proyek yang cocok.</strong>Ubah filter atau kembali lagi setelah ada proyek publik.</div>'; $('#exploreCount').textContent=list.length+' proyek'; };
  renderSaved = function(){ const available=[...projects,...userProjects]; const list=available.filter(p=>state.saved.has(p.id)&&(state.savedCollection==='Semua'||p.collection===state.savedCollection)); $('#savedGrid').innerHTML=list.length?list.map(projectCard).join(''):'<div class="empty-state"><strong>Belum ada proyek tersimpan di koleksi ini.</strong>Simpan proyek yang ingin kamu pelajari nanti.</div>'; $('#savedTotal').textContent=state.saved.size+' proyek'; };
  function renderCurrentPage() {
    if (state.page==='detail') renderDetail();
    else if (state.page==='home') renderFeed();
    else if (state.page==='explore') renderExplore();
    else if (state.page==='saved') renderSaved();
    else renderProfile();
    updateAccountUi();
  }
  async function publish(isDraft=false) {
    if(!requireUser())return;
    const title=$('#projectTitle').value.trim();
    if(!title){toast('Nama proyek wajib diisi.');$('#projectTitle').focus();return}
    const code=templateCode(state.selectedTemplate);
    const visibility=$('input[name="visibility"]:checked')?.value||'public';
    const payload={user_id:app.user.id,title,description:$('#projectDescription').value.trim(),tags:['HTML','CSS','JavaScript',$('#projectCategory').value],category:$('#projectCategory').value,level:$('#projectLevel').value,html_code:code.html,css_code:code.css,js_code:code.js,status:isDraft?'draft':'published',visibility};
    try {
      const {data,error}=await db.from('projects').insert(payload).select('id').single();
      if(error)throw error;
      await loadProjects();
      state.currentProject=data.id;
      $('#projectTitle').value='';$('#projectDescription').value='';
      go('detail');
      renderDetail();
      toast(isDraft?'Draft tersimpan ke database.':'Proyek berhasil dipublikasikan.');
    } catch(error){fail(error)}
  }
  async function addComment() {
    if(!requireUser())return;
    const input=$('#commentInput');const body=input?.value.trim();
    const p=getProject(state.currentProject);
    if(!body||!p)return;
    try {
      const {error}=await db.from('comments').insert({project_id:p.id,user_id:app.user.id,body});
      if(error)throw error;
      input.value='';
      await loadProjects();
      renderDetail();
      toast('Komentar dikirim.');
    } catch(error){fail(error)}
  }
  async function loadComments() {
    const p=getProject(state.currentProject);
    if(!p||!db)return;
    const {data,error}=await db.from('comments').select('id,body,user_id,created_at,profiles!comments_user_id_fkey(id,display_name,username,bio)').eq('project_id',p.id).order('created_at',{ascending:true}).limit(200);
    if(error){console.warn('[CodeKita] comments:',error.message);return}
    const panel=$('.detail-side .panel');
    const form=$('#commentForm');
    if(!panel||!form)return;
    panel.querySelectorAll('[data-live-comment]').forEach(el=>el.remove());
    const empty=panel.querySelector('[data-empty-comments]');
    if(empty)empty.remove();
    if(!(data||[]).length){
      const e=document.createElement('p');e.className='muted';e.dataset.emptyComments='true';e.textContent='Belum ada komentar. Jadilah yang pertama berdiskusi.';panel.insertBefore(e,form);
      return;
    }
    (data||[]).forEach(c=>{
      const person=c.profiles||{};const key=userKey(c.user_id);
      users[key]={id:c.user_id,name:person.display_name||'Pengguna',handle:'@'+(person.username||'pengguna'),initials:initials(person.display_name),color:'avatar-me',bio:person.bio||''};
      const row=document.createElement('div');row.className='comment-row';row.dataset.liveComment='true';
      const av=document.createElement('div');av.className='avatar avatar-me';av.textContent=initials(person.display_name);
      const content=document.createElement('div');content.className='comment-content';
      const text=document.createElement('p');const strong=document.createElement('strong');strong.textContent=person.display_name||'Pengguna';text.append(strong,document.createElement('br'),document.createTextNode(c.body));
      const small=document.createElement('small');small.textContent=timeAgo(c.created_at);content.append(text,small);row.append(av,content);panel.insertBefore(row,form);
    });
  }
  async function saveEditorVersion() {
    if(!requireUser())return;
    const title=$('#projectTitle').value.trim() || (getProject(state.currentProject)?.title || 'Proyek baru');
    const existing=getProject(state.currentProject);
    const payload={user_id:app.user.id,title,description:$('#projectDescription').value.trim()||existing?.description||'',tags:existing?.tags||['HTML','CSS','JavaScript'],category:existing?.category||'Eksperimen',level:existing?.level||'Pemula',html_code:state.editorCode.html||'',css_code:state.editorCode.css||'',js_code:state.editorCode.js||'',status:'published',visibility:'public',parent_project_id:existing&&existing.userId!==app.user.id?existing.id:(existing?.parentProjectId||null)};
    try {
      let result;
      if(existing && existing.userId===app.user.id){
        result=await db.from('projects').update(payload).eq('id',existing.id).eq('user_id',app.user.id).select('id').single();
      } else {
        if(existing){payload.title='Remix: '+existing.title;}
        result=await db.from('projects').insert(payload).select('id').single();
        if(existing) await db.from('project_reposts').upsert({project_id:existing.id,user_id:app.user.id},{onConflict:'project_id,user_id'});
      }
      if(result.error)throw result.error;
      await loadProjects();state.currentProject=result.data.id;go('detail');renderDetail();toast('Proyek tersimpan ke CodeKita.');
    }catch(error){fail(error)}
  }
  async function editProfile() {
    if(!requireUser())return;
    const p=app.profile||{};
    showModal('Edit profil','<div class="field"><label for="editName">Nama tampilan</label><input id="editName" maxlength="60" value="'+escapeHtml(p.display_name||'')+'"></div><div class="field"><label for="editBio">Bio</label><textarea id="editBio" rows="3" maxlength="300">'+escapeHtml(p.bio||'')+'</textarea></div><div class="field"><label for="editLocation">Lokasi (opsional)</label><input id="editLocation" maxlength="80" value="'+escapeHtml(p.location||'')+'"></div><div class="field"><label for="editWebsite">Website (opsional)</label><input id="editWebsite" maxlength="200" type="url" value="'+escapeHtml(p.website||'')+'"></div>','Simpan perubahan',()=>true);
    $('#modalConfirm').onclick=async()=>{
      const display_name=$('#editName').value.trim(),bio=$('#editBio').value.trim(),locationValue=$('#editLocation').value.trim(),website=$('#editWebsite').value.trim();
      if(!display_name){toast('Nama tampilan wajib diisi.');return}
      if(website && !/^https?:\/\//i.test(website)){toast('Website harus diawali http:// atau https://');return}
      const {data,error}=await db.from('profiles').update({display_name,bio,location:locationValue,website}).eq('id',app.user.id).select('*').single();
      if(error){fail(error);return}
      app.profile=data;await loadProjects();updateAccountUi();renderProfile();$('#modal').close();toast('Profil diperbarui.');
    };
  }
  async function createCollection() {
    if(!requireUser())return;
    showModal('Buat koleksi','<div class="field"><label for="collectionName">Nama koleksi</label><input id="collectionName" maxlength="40" placeholder="Contoh: Inspirasi UI"></div>','Buat koleksi',()=>true);
    $('#modalConfirm').onclick=async()=>{
      const name=$('#collectionName').value.trim();if(!name){toast('Masukkan nama koleksi.');return}
      const {error}=await db.from('collections').insert({user_id:app.user.id,name});
      if(error){fail(error);return}
      await loadCollections();$('#modal').close();toast('Koleksi disimpan.');
    };
  }
  async function markNotificationsRead() {
    if(!requireUser())return;
    const {error}=await db.from('notifications').update({is_read:true}).eq('recipient_id',app.user.id);
    if(error){fail(error);return}
    await loadNotifications();toast('Notifikasi ditandai dibaca.');
  }
  async function reportProject(id) {
    if(!requireUser())return;
    showModal('Laporkan proyek','<div class="field"><label for="reportReason">Alasan laporan</label><textarea id="reportReason" rows="3" maxlength="1000" placeholder="Jelaskan masalahnya secara singkat."></textarea></div>','Kirim laporan',()=>true);
    $('#modalConfirm').onclick=async()=>{
      const reason=$('#reportReason').value.trim();if(reason.length<3){toast('Tambahkan alasan laporan yang jelas.');return}
      const {error}=await db.from('reports').insert({reporter_id:app.user.id,project_id:id,reason});
      if(error){fail(error);return}
      $('#modal').close();toast('Laporan dikirim untuk ditinjau.');
    };
  }
  async function sendMessage() {
    if(!requireUser())return;
    const input=$('#messageInput');const body=input.value.trim();
    const target=app.selectedConversation&&app.conversationMap.get(app.selectedConversation);
    if(!target){toast('Buka profil kreator melalui detail proyek, lalu pilih Pesan.');return}
    if(!body)return;
    const {error}=await db.from('messages').insert({sender_id:app.user.id,recipient_id:target,body});
    if(error){fail(error);return}
    input.value='';await loadConversations();await loadChat(app.selectedConversation);
  }
  function overrideProfileRender() {
    const list=state.profileTab==='saved'?[...projects,...userProjects].filter(p=>state.saved.has(p.id)):state.profileTab==='reposts'?[...projects,...userProjects].filter(p=>app.reposted?.has(p.id)):state.profileTab==='collections'?[]:userProjects;
    $('#profileGrid').innerHTML=list.filter(p=>p.status==='published'||p.userId===app.user?.id).map(projectCard).join('')||'<div class="empty-state"><strong>Belum ada proyek di sini.</strong> Buat proyek atau simpan referensi untuk mengisinya.</div>';
    $('#profilePostCount').textContent=String(userProjects.filter(p=>p.status==='published').length);
    $('#profileFollowerCount').textContent='0';$('#profileFollowingCount').textContent=String(state.followed.size);
  }
  // The UI's data arrays now represent actual database records, never seeded sample accounts.
  renderProfile = overrideProfileRender;
  renderDetail = ((base) => function(){base(); if(state.page==='detail'){const p=getProject(state.currentProject);const head=$('#detailContent .detail-project-info .post-head');if(head&&app.user&&p&&p.userId!==app.user.id&&!head.querySelector('[data-message-user]')){const btn=document.createElement('button');btn.className='btn btn-secondary';btn.type='button';btn.dataset.messageUser=p.user;btn.textContent='Pesan';head.appendChild(btn);}if(app.user)loadComments();}})(renderDetail);
  window.CodeKita = { get backendReady(){return Boolean(db)}, get authenticated(){return Boolean(app.user)}, openAuth, refresh:refreshAll };

  document.addEventListener('click', async event => {
    const target=event.target;
    const auth=target.closest('#authButton');
    if(auth){event.preventDefault();event.stopImmediatePropagation();if(app.user){const {error}=await db.auth.signOut();if(error)fail(error);else toast('Kamu sudah keluar.')}else openAuth('signin');return}
    const shortcut=target.closest('#profileShortcut');
    if(shortcut && !app.user){event.preventDefault();event.stopImmediatePropagation();openAuth('signin');return}
    const like=target.closest('[data-like]');if(like){event.preventDefault();event.stopImmediatePropagation();await onLike(like.dataset.like);return}
    const save=target.closest('[data-save]');if(save){event.preventDefault();event.stopImmediatePropagation();await onBookmark(save.dataset.save);return}
    const follow=target.closest('[data-follow]');if(follow){event.preventDefault();event.stopImmediatePropagation();await onFollow(follow.dataset.follow);return}
    const repost=target.closest('[data-repost]');if(repost){event.preventDefault();event.stopImmediatePropagation();await onRepost(repost.dataset.repost);return}
    const menu=target.closest('[data-post-menu]');if(menu){event.preventDefault();event.stopImmediatePropagation();const id=menu.dataset.postMenu;const p=getProject(id);showModal('Opsi proyek','<p>'+escapeHtml(p?.title||'Proyek')+'</p><button type="button" class="btn btn-secondary btn-block" id="shareProject">Salin tautan proyek</button><button type="button" class="btn btn-secondary btn-block" id="reportProject" style="margin-top:8px">Laporkan proyek</button>','Tutup',()=>true);$('#shareProject').onclick=()=>{copyText(location.href.split('#')[0]+'#project-'+id);$('#modal').close()};$('#reportProject').onclick=()=>{$('#modal').close();reportProject(id)};return}
    const collect=target.closest('#newCollection');if(collect){event.preventDefault();event.stopImmediatePropagation();await createCollection();return}
    const edit=target.closest('#editProfile');if(edit){event.preventDefault();event.stopImmediatePropagation();await editProfile();return}
    const shareProfile=target.closest('#shareProfile');if(shareProfile){event.preventDefault();event.stopImmediatePropagation();copyText(location.href.split('#')[0]+'#profile-'+(app.profile?.username||''));return}
    const publishBtn=target.closest('#publishProject');if(publishBtn){event.preventDefault();event.stopImmediatePropagation();await publish(false);return}
    const draftBtn=target.closest('#saveDraft');if(draftBtn){event.preventDefault();event.stopImmediatePropagation();await publish(true);return}
    const editCode=target.closest('#editCodeBtn');if(editCode){event.preventDefault();event.stopImmediatePropagation();state.currentProject=userProjects.find(p=>p.status==='draft')?.id||userProjects.find(p=>p.userId===app.user?.id)?.id||null;go('editor');if(!state.currentProject){state.editorCode={...templateCode(state.selectedTemplate)};$('#codeEditor').value=state.editorCode.html||'';updateLineCount()}return}
    const mark=target.closest('#markRead');if(mark){event.preventDefault();event.stopImmediatePropagation();await markNotificationsRead();return}
    const remixSave=target.closest('#remixFromEditor');if(remixSave){event.preventDefault();event.stopImmediatePropagation();await saveEditorVersion();return}
    const toCreate=target.closest('[data-page="create"]');if(toCreate&&!app.user){event.preventDefault();event.stopImmediatePropagation();openAuth('signin');return}
    const messageUser=target.closest('[data-message-user]');if(messageUser){event.preventDefault();event.stopImmediatePropagation();if(!requireUser())return;const key=messageUser.dataset.messageUser;const targetId=users[key]?.id;if(!targetId||targetId===app.user.id){toast('Percakapan ini tidak tersedia.');return}app.conversationMap.set(key,targetId);app.selectedConversation=key;if(!conversations.some(c=>c.user===key))conversations.unshift({user:key,last:'Mulai percakapan',time:'baru',active:true});renderConversations();go('messages');await loadChat(key);return}
    const tab=target.closest('[data-conversation]');if(tab){event.preventDefault();event.stopImmediatePropagation();await loadChat(tab.dataset.conversation);return}
  }, true);

  document.addEventListener('submit', async event => {
    if(event.target.id==='commentForm'){event.preventDefault();event.stopImmediatePropagation();await addComment();return}
    if(event.target.id==='messageForm'){event.preventDefault();event.stopImmediatePropagation();await sendMessage();return}
  }, true);

  $('#authButton')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openAuth(app.user?'signin':'signin')}});
  $('#messageSearch')?.addEventListener('input',()=>renderConversations());

  async function init() {
    updateAccountUi();
    if(!db){renderFeed();renderExplore();renderSaved();renderProfile();renderNotifications();renderConversations();return}
    try {
      const {data,error}=await db.auth.getSession();if(error)throw error;
      app.user=data.session?.user||null;
      await refreshAll();
      db.auth.onAuthStateChange((event,session)=>{
        app.user=session?.user||null;
        setTimeout(()=>{refreshAll();if(event==='PASSWORD_RECOVERY')openPasswordRecovery()},0);
      });
    } catch(error) {
      setStatus('<strong>Koneksi backend gagal.</strong> '+escapeHtml(error.message||'Periksa konfigurasi.'),true);
    }
  }
  init();
})();
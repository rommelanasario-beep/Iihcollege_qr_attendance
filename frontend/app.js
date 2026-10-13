const API_BASE = window.API_BASE || 'http://localhost:5000/api';
const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('iih_token') || '';
let currentUser = null;
function show(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  $(view)?.classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', e => { e.preventDefault(); show(el.dataset.view); }));
function setAuth(user,newToken) {
  currentUser=user;
  if(newToken){token=newToken;sessionStorage.setItem('iih_token',token);}
  $('dashboardNav').classList.toggle('hidden',!user);
  $('logoutBtn').classList.toggle('hidden',!user);
}
$('logoutBtn').onclick=()=>{token='';currentUser=null;sessionStorage.removeItem('iih_token');setAuth(null);show('home');};
async function api(path,options={}) {
  const headers={'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(options.headers||{})};
  const response=await fetch(`${API_BASE}${path}`,{...options,headers});
  const data=await response.json().catch(()=>({error:'Unexpected response from API.'}));
  if(!response.ok)throw new Error(data.error||'Request failed.');
  return data;
}
function message(id,text,good=false){$(id).textContent=text;$(id).style.color=good?'#237347':'#b91f35';}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();message('loginMessage','Signing in…');const f=new FormData(e.target);
  try{const r=await api('/auth/login',{method:'POST',body:JSON.stringify({email:f.get('email'),password:f.get('password')})});setAuth(r.user,r.token);await loadDashboard();show('dashboard');if(r.user.role==='admin')startScanner();}
  catch(err){message('loginMessage',err.message);}
});
$('registerForm').addEventListener('submit',async e=>{
  e.preventDefault();message('registerMessage','Submitting…');const f=new FormData(e.target);
  try{const r=await api('/auth/register',{method:'POST',body:JSON.stringify({fullName:f.get('fullName'),email:f.get('email'),password:f.get('password'),studentNumber:f.get('studentNumber'),guardianPhone:f.get('guardianPhone'),smsConsent:f.get('smsConsent')==='on'})});message('registerMessage',r.message,true);e.target.reset();}
  catch(err){message('registerMessage',err.message);}
});
async function loadDashboard(){
  const me=await api('/me');setAuth(me.user);$('welcome').textContent=`Hello, ${me.user.fullName}`;$('roleChip').textContent=me.user.role==='admin'?'Administrator':'Student';
  $('studentPanel').classList.toggle('hidden',me.user.role!=='student');$('adminPanel').classList.toggle('hidden',me.user.role!=='admin');
  if(me.user.role==='admin')await loadAdmin();
}
$('loadQr').onclick=async()=>{try{const r=await api('/student/qr');$('studentQr').src=r.qr;$('studentQr').classList.remove('hidden');message('qrMessage',r.note,true);}catch(e){message('qrMessage',e.message);}};
async function loadAdmin(){
  const d=await api('/admin/dashboard');$('totalStudents').textContent=d.totalStudents;$('presentToday').textContent=d.presentToday;$('pendingCount').textContent=d.pendingStudents.length;$('pendingStudents').innerHTML='';
  d.pendingStudents.forEach(s=>{const row=document.createElement('div');row.className='pending';const info=document.createElement('span');info.textContent=`${s.full_name} • ${s.email}`;const btn=document.createElement('button');btn.className='primary';btn.textContent='Approve';btn.onclick=async()=>{try{await api(`/admin/students/${s.id}/approve`,{method:'PATCH'});await loadAdmin();}catch(e){alert(e.message)}};row.append(info,btn);$('pendingStudents').append(row);});
  $('attendanceRows').innerHTML='';d.recentAttendance.forEach(a=>{const tr=document.createElement('tr');[a.full_name,a.student_number||'—',a.class_name,a.status,new Date(a.checked_in_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td)});$('attendanceRows').append(tr);});
}
async function recordScan(qrToken){
  try{const r=await api('/attendance/scan',{method:'POST',body:JSON.stringify({qrToken,className:$('className').value})});message('scanMessage',`${r.student.name} marked present. SMS: ${r.sms.sent?'sent':r.sms.reason}`,true);$('manualToken').value='';await loadAdmin();}
  catch(e){message('scanMessage',e.message);}
}
$('manualScan').onclick=()=>recordScan($('manualToken').value.trim());
let scanner=null;
async function startScanner(){
  if(!window.Html5Qrcode||scanner)return;
  try{scanner=new Html5Qrcode('reader');await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:220,height:220}},async decoded=>{await scanner.stop();scanner=null;await recordScan(decoded);setTimeout(()=>startScanner(),1200);},()=>{});}
  catch(e){scanner=null;message('scanMessage','Camera scan unavailable. Use HTTPS hosting, allow camera permission, or enter the token manually.');}
}
if(token){loadDashboard().then(()=>{show('dashboard');if(currentUser?.role==='admin')startScanner();}).catch(()=>{token='';sessionStorage.removeItem('iih_token');});}

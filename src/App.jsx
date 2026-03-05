import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, collection } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAFZpIrw7_d-sIZzNJRcvuomHOGFZmTfGg",
  authDomain: "cricket-schedule-dad59.firebaseapp.com",
  projectId: "cricket-schedule-dad59",
  storageBucket: "cricket-schedule-dad59.firebasestorage.app",
  messagingSenderId: "67101617599",
  appId: "1:67101617599:web:4332918bd0f3b55cb5850a",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const TEAM = [
  { name: "Арман Мусаелян",   login: "arman",  password: "arman472?"  },
  { name: "Артем Виноградов", login: "artem",  password: "artem831>"  },
  { name: "Гор Аракелян",     login: "gor",    password: "gor594-"    },
  { name: "Анжела Лойко",     login: "anjela", password: "anjela263=" },
  { name: "Маро Тамоян",      login: "maro",   password: "maro718+"   },
  { name: "Гоар Акопян",      login: "goar",   password: "goar345*"   },
  { name: "Армо Айрапетян",   login: "armo",   password: "armo956@"   },
];
const ADMIN = { name: "Менеджер", password: "manager2024" };
const MAX_PER_SHIFT = 2;

const SHIFTS = [
  { id:"A", label:"09:00 – 17:00", short:"09–17", emoji:"🌅", bg:"#eff6ff", border:"#bfdbfe", textDark:"#1e3a8a", accent:"#1e40af" },
  { id:"B", label:"13:00 – 21:00", short:"13–21", emoji:"☀️",  bg:"#f0f9ff", border:"#bae6fd", textDark:"#0c4a6e", accent:"#075985" },
  { id:"C", label:"17:00 – 01:00", short:"17–01", emoji:"🌆", bg:"#f5f3ff", border:"#ddd6fe", textDark:"#4c1d95", accent:"#5b21b6" },
  { id:"N", label:"01:00 – 09:00", short:"01–09", emoji:"🌙", bg:"#f0fdf4", border:"#bbf7d0", textDark:"#14532d", accent:"#15803d" },
];

const RU_DAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const RU_MON  = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function getWeek(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      label: RU_DAYS[i],
      date: `${d.getDate()} ${RU_MON[d.getMonth()]}`,
      isToday: d.toDateString() === now.toDateString(),
      isWeekend: i >= 5,
    };
  });
}

function weekLabel(days) { return `${days[0].date} – ${days[6].date}`; }
function getWeekKey(days) { return days[0].key; }

function countForShift(requests, weekKey, dayKey, shiftId) {
  return TEAM.filter(m => ((requests[m.name] || {})[weekKey] || {})[dayKey] === shiftId).length;
}

function buildSchedule(requests, days, weekKey) {
  const s = {};
  days.forEach(d => { s[d.key] = {}; SHIFTS.forEach(sh => { s[d.key][sh.id] = []; }); });
  Object.entries(requests).forEach(([name, weeks]) => {
    Object.entries((weeks[weekKey] || {})).forEach(([dayKey, shiftId]) => {
      if (shiftId && s[dayKey]?.[shiftId]) s[dayKey][shiftId].push(name);
    });
  });
  return s;
}

function getUncoveredShifts(requests, dayKey, weekKey) {
  return SHIFTS.filter(shift => !TEAM.some(m => ((requests[m.name] || {})[weekKey] || {})[dayKey] === shift.id)).map(s => s.id);
}

export default function App() {
  const [requests, setRequests] = useState({});
  const [loading, setLoading]   = useState(true);
  const [user, setUser]         = useState(null);
  const [page, setPage]         = useState("login");
  const [drafts, setDrafts]     = useState({});
  const [saved, setSaved]       = useState({});
  const [saving, setSaving]     = useState({});
  const [form, setForm]         = useState({ name:"", password:"", error:"" });
  const [showPwd, setShowPwd]   = useState(false);
  const pwdRef = useRef();

  const curDays  = getWeek(0);
  const nextDays = getWeek(1);
  const curKey   = getWeekKey(curDays);
  const nextKey  = getWeekKey(nextDays);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schedules"), (snapshot) => {
      const data = {};
      snapshot.forEach(d => { data[d.id] = d.data() || {}; });
      setRequests(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  function handleLogin() {
    const n = form.name.trim();
    const p = form.password.trim();
    if (!n || !p) { setForm(f=>({...f,error:"Введи имя и пароль"})); return; }
    if (n.toLowerCase() === ADMIN.name.toLowerCase() && p === ADMIN.password) {
      setUser({ name:"Менеджер", isAdmin:true }); setPage("schedule");
      setForm({ name:"", password:"", error:"" }); return;
    }
    const m = TEAM.find(x => (x.login || x.name).toLowerCase() === n.toLowerCase() && x.password === p);
    if (!m) { setForm(f=>({...f,error:"Неверное имя или пароль"})); return; }
    setUser({ name:m.name, isAdmin:false });
    const existing = requests[m.name] || {};
    setDrafts({ [curKey]: existing[curKey] || {}, [nextKey]: existing[nextKey] || {} });
    setSaved({}); setPage("pick");
    setForm({ name:"", password:"", error:"" });
  }

  function logout() { setUser(null); setPage("login"); }

  function toggleShift(weekKey, dayKey, shiftId) {
    setDrafts(prev => ({
      ...prev,
      [weekKey]: { ...(prev[weekKey]||{}), [dayKey]: (prev[weekKey]||{})[dayKey] === shiftId ? null : shiftId }
    }));
    setSaved(s => ({ ...s, [weekKey]: false }));
  }

  async function handleSave(weekKey) {
    setSaving(s => ({ ...s, [weekKey]: true }));
    try {
      await setDoc(doc(db, "schedules", user.name), { ...(requests[user.name]||{}), [weekKey]: drafts[weekKey] || {} });
      setSaved(s => ({ ...s, [weekKey]: true }));
    } catch(e) { alert("Ошибка сохранения."); }
    setSaving(s => ({ ...s, [weekKey]: false }));
  }

  function submittedFor(weekKey) {
    return TEAM.filter(m => { const d=(requests[m.name]||{})[weekKey]; return d && Object.values(d).some(v=>v); });
  }

  function getSchedWarnings(days, weekKey) {
    const w = {};
    days.forEach(d => { const unc=getUncoveredShifts(requests,d.key,weekKey); if(unc.length>0) w[d.key]=unc; });
    return w;
  }

  function getDraftWarnings(weekKey, days) {
    if (!user||user.isAdmin) return {};
    const w = {};
    days.forEach(d => {
      if ((drafts[weekKey]||{})[d.key]) return;
      const sim = {};
      TEAM.forEach(m => { sim[m.name]={...((requests[m.name]||{})[weekKey]||{})}; });
      sim[user.name] = {...(drafts[weekKey]||{})};
      const unc = SHIFTS.filter(sh=>!TEAM.some(m=>(sim[m.name]||{})[d.key]===sh.id)).map(s=>s.id);
      if (unc.length>0) w[d.key]=unc;
    });
    return w;
  }

  const curSched=buildSchedule(requests,curDays,curKey);
  const nextSched=buildSchedule(requests,nextDays,nextKey);
  const curSchedW=getSchedWarnings(curDays,curKey);
  const nextSchedW=getSchedWarnings(nextDays,nextKey);
  const curDraftW=getDraftWarnings(curKey,curDays);
  const nextDraftW=getDraftWarnings(nextKey,nextDays);

  function WeekPicker({ days, weekKey, label }) {
    const draft=drafts[weekKey]||{};
    const draftWarn=weekKey===curKey?curDraftW:nextDraftW;
    return (
      <div style={{ marginBottom:32 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#1e3a8a", marginTop:2 }}>{weekLabel(days)}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {saved[weekKey] && <span style={{ color:"#16a34a", fontWeight:700, fontSize:13 }}>✅ Сохранено!</span>}
            <button onClick={()=>handleSave(weekKey)} disabled={!!saving[weekKey]} style={{ padding:"10px 22px", background:saving[weekKey]?"#93c5fd":"linear-gradient(135deg,#1d4ed8,#1e3a8a)", borderRadius:10, color:"white", fontSize:13, fontWeight:700, border:"none", cursor:"pointer", boxShadow:"0 3px 10px rgba(29,78,216,0.3)" }}>
              {saving[weekKey] ? "Сохраняем..." : "💾 Подать заявку"}
            </button>
          </div>
        </div>
       
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {days.map(d => {
            const picked=draft[d.key];
            const warn=draftWarn[d.key];
            const pickedShift=SHIFTS.find(s=>s.id===picked);
            return (
              <div key={d.key} style={{ background:"white", borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,0.07)", padding:"12px 16px", border:`2px solid ${d.isToday?"#3b82f6":"#f1f5f9"}`, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <div style={{ minWidth:64 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:d.isToday?"#1d4ed8":d.isWeekend?"#94a3b8":"#1e293b" }}>{d.label}</div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{d.date}</div>
                </div>
                {d.isToday && <span style={{ background:"#dbeafe", color:"#1d4ed8", borderRadius:6, padding:"2px 7px", fontSize:10, fontWeight:700 }}>СЕГОДНЯ</span>}
                
                {picked&&pickedShift && <span style={{ background:pickedShift.bg, border:`1px solid ${pickedShift.border}`, color:pickedShift.textDark, borderRadius:7, padding:"3px 10px", fontSize:11, fontWeight:700 }}>{pickedShift.emoji} {pickedShift.label}</span>}
                <div style={{ display:"flex", gap:5, flex:1, flexWrap:"wrap", justifyContent:"flex-end" }}>
                  {SHIFTS.map(shift => {
                    const active=picked===shift.id;
                    const count=countForShift(requests,weekKey,d.key,shift.id);
                    const full=count>=MAX_PER_SHIFT&&!active;
                    return (
                      <button key={shift.id} onClick={()=>!full&&toggleShift(weekKey,d.key,shift.id)} title={full?`Смена заполнена (${count}/${MAX_PER_SHIFT})`:""}
                        style={{ padding:"7px 11px", borderRadius:8, background:active?shift.bg:full?"#f1f5f9":"#f8fafc", border:`2px solid ${active?shift.accent:"#e2e8f0"}`, color:active?shift.textDark:full?"#cbd5e1":"#64748b", fontSize:11, fontWeight:700, opacity:full?0.5:1, cursor:full?"not-allowed":"pointer", position:"relative", transition:"all .15s" }}>
                        {shift.emoji} {shift.short}
                        {full && <span style={{ position:"absolute", top:-6, right:-6, background:"#ef4444", color:"white", borderRadius:"50%", width:14, height:14, fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</span>}
                        {!full&&count>0&&!active && <span style={{ position:"absolute", top:-6, right:-6, background:"#f59e0b", color:"white", borderRadius:"50%", width:14, height:14, fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{count}</span>}
                      </button>
                    );
                  })}
                  <button onClick={()=>toggleShift(weekKey,d.key,null)} style={{ padding:"7px 11px", borderRadius:8, background:!picked?"#fef2f2":"#f8fafc", border:`2px solid ${!picked?"#fca5a5":"#e2e8f0"}`, color:!picked?"#dc2626":"#94a3b8", fontSize:11, fontWeight:700, cursor:"pointer", transition:"all .15s" }}>
                    🏖 Вых.
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function WeekSchedule({ days, weekKey, sched, warnings, label }) {
    const sub=submittedFor(weekKey);
    const totalWarn=Object.values(warnings).reduce((a,b)=>a+b.length,0);
    return (
      <div style={{ marginBottom:40 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#1e3a8a", marginTop:2 }}>{weekLabel(days)}</div>
          </div>
          <div style={{ fontSize:13, color:"#64748b" }}>Подали: <span style={{ color:"#1d4ed8", fontWeight:700 }}>{sub.length}</span> / {TEAM.length}</div>
        </div>
        {totalWarn>0 && (
          <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"12px 16px", marginBottom:12 }}>
            <div style={{ fontWeight:700, color:"#c2410c", fontSize:13, marginBottom:6 }}>⚠️ Незакрытые смены ({totalWarn})</div>
            {days.map(d => {
              const unc=warnings[d.key];
              if(!unc||unc.length===0) return null;
              return (
                <div key={d.key} style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:3 }}>
                  <span style={{ fontSize:12, color:"#92400e", fontWeight:600, minWidth:55 }}>{d.label} {d.date}</span>
                  <span style={{ color:"#d97706" }}>→</span>
                  {unc.map(id => { const sh=SHIFTS.find(s=>s.id===id); return <span key={id} style={{ background:sh.bg, border:`1px solid ${sh.border}`, color:sh.textDark, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{sh.emoji} {sh.short}</span>; })}
                </div>
              );
            })}
          </div>
        )}
        {totalWarn===0&&sub.length===TEAM.length && (
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"12px 16px", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
            <span>✅</span><span style={{ fontWeight:700, color:"#16a34a", fontSize:13 }}>Все смены закрыты!</span>
          </div>
        )}
        <div style={{ background:"white", borderRadius:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:600 }}>
              <thead>
                <tr style={{ background:"#1e3a8a" }}>
                  <th style={{ padding:"12px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#93c5fd", letterSpacing:"0.05em", width:140 }}>СМЕНА</th>
                  {days.map(d => (
                    <th key={d.key} style={{ padding:"12px 8px", textAlign:"center", fontSize:11, fontWeight:700, color:d.isToday?"#fbbf24":d.isWeekend?"#64748b":"#bfdbfe" }}>
                      <div>{d.label}</div>
                      <div style={{ fontWeight:500, fontSize:10, opacity:.8, marginTop:1 }}>{d.date}</div>
                      {d.isToday && <div style={{ width:5, height:5, borderRadius:"50%", background:"#fbbf24", margin:"3px auto 0" }} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHIFTS.map((shift,si) => (
                  <tr key={shift.id} style={{ borderBottom:"1px solid #f1f5f9", background:si%2===0?"white":"#fafbff" }}>
                    <td style={{ padding:"12px 14px", borderRight:"1px solid #f1f5f9" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ width:32, height:32, background:shift.bg, border:`1px solid ${shift.border}`, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>{shift.emoji}</div>
                        <div>
                          <div style={{ fontWeight:700, fontSize:12, color:shift.textDark }}>{shift.label}</div>
                          <div style={{ fontSize:10, color:"#94a3b8", marginTop:1 }}>Смена {shift.id}</div>
                        </div>
                      </div>
                    </td>
                    {days.map(d => {
                      const people=sched[d.key][shift.id]||[];
                      const isUnc=(warnings[d.key]||[]).includes(shift.id);
                      const isFull=people.length>=MAX_PER_SHIFT;
                      return (
                        <td key={d.key} style={{ padding:"8px 6px", textAlign:"center", verticalAlign:"middle", borderRight:"1px solid #f1f5f9", background:isUnc?"#fff7ed":d.isToday?"#eff6ff":"transparent" }}>
                          {people.length===0 ? (
                            <span style={{ color:isUnc?"#f97316":"#e2e8f0", fontSize:isUnc?16:20, fontWeight:700 }}>{isUnc?"✗":"·"}</span>
                          ) : (
                            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                              {people.map(p => <div key={p} style={{ background:shift.bg, border:`1px solid ${shift.border}`, borderRadius:6, padding:"2px 7px", fontSize:10, fontWeight:600, color:shift.textDark, whiteSpace:"nowrap" }}>{p.split(" ")[0]}</div>)}
                              {isFull && <div style={{ fontSize:9, color:"#16a34a", fontWeight:700 }}>✓ закрыто</div>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {TEAM.filter(m=>!sub.find(s=>s.name===m.name)).length>0 && (
          <div style={{ marginTop:12, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"12px 16px", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:13, color:"#dc2626", fontWeight:700 }}>⏳ Не подали:</span>
            {TEAM.filter(m=>!sub.find(s=>s.name===m.name)).map(m => <span key={m.name} style={{ background:"white", border:"1px solid #fecaca", color:"#dc2626", borderRadius:7, padding:"2px 9px", fontSize:12, fontWeight:600 }}>{m.name.split(" ")[0]}</span>)}
          </div>
        )}
      </div>
    );
  }

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:48 }}>🏏</div>
      <div style={{ color:"#1e40af", fontSize:15, fontWeight:600 }}>Загрузка...</div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#f0f4ff", fontFamily:"'Inter','Segoe UI',sans-serif", color:"#1e293b" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#e2e8f0} ::-webkit-scrollbar-thumb{background:#93c5fd;border-radius:4px}
        input{outline:none;font-family:inherit} button{cursor:pointer;font-family:inherit;border:none}
        .fade{animation:fadeUp .25s ease both} @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <header style={{ background:"#1e3a8a", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:60, boxShadow:"0 2px 12px rgba(30,58,138,0.3)", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"rgba(255,255,255,0.15)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🏏</div>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:"white" }}>Cricket Live</div>
            <div style={{ fontSize:11, color:"#93c5fd" }}>Управление сменами</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {user && <>
            <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:600, color:"white", display:"flex", alignItems:"center", gap:6 }}>
              {user.isAdmin?"👑":"👤"} {user.name}
            </div>
            {!user.isAdmin && (
              <button onClick={()=>setPage(page==="schedule"?"pick":"schedule")} style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                {page==="schedule"?"✏️ Мои смены":"📋 Расписание"}
              </button>
            )}
            <button onClick={logout} style={{ background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.3)", color:"#fca5a5", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:600, cursor:"pointer" }}>Выйти</button>
          </>}
        </div>
      </header>

      <main style={{ maxWidth:920, margin:"0 auto", padding:"32px 20px 60px" }}>

        {page==="login" && (
          <div className="fade" style={{ maxWidth:420, margin:"0 auto" }}>
            <div style={{ background:"white", borderRadius:20, boxShadow:"0 4px 24px rgba(29,78,216,0.1)", padding:"40px 36px" }}>
              <div style={{ textAlign:"center", marginBottom:32 }}>
                <div style={{ width:64, height:64, background:"#eff6ff", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, margin:"0 auto 16px" }}>🏏</div>
                <h1 style={{ fontSize:24, fontWeight:800, color:"#1e3a8a", marginBottom:6 }}>Вход в систему</h1>
                <p style={{ color:"#64748b", fontSize:14 }}>Cricket Live · Управление сменами</p>
              </div>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", letterSpacing:"0.04em", display:"block", marginBottom:6 }}>ИМЯ</label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value,error:""}))} onKeyDown={e=>e.key==="Enter"&&pwdRef.current?.focus()} placeholder="Введи своё имя..."
                  style={{ width:"100%", padding:"12px 14px", background:"#f8fafc", border:"2px solid #e2e8f0", borderRadius:10, color:"#1e293b", fontSize:14, fontWeight:500 }} />
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", letterSpacing:"0.04em", display:"block", marginBottom:6 }}>ПАРОЛЬ</label>
                <div style={{ position:"relative" }}>
                  <input ref={pwdRef} type={showPwd?"text":"password"} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value,error:""}))} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••"
                    style={{ width:"100%", padding:"12px 44px 12px 14px", background:"#f8fafc", border:"2px solid #e2e8f0", borderRadius:10, color:"#1e293b", fontSize:14, fontWeight:500 }} />
                  <button onClick={()=>setShowPwd(v=>!v)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", color:"#94a3b8", fontSize:17, padding:4, cursor:"pointer" }}>{showPwd?"🙈":"👁"}</button>
                </div>
              </div>
              {form.error && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", color:"#dc2626", fontSize:13, fontWeight:600, marginBottom:16, textAlign:"center" }}>⚠️ {form.error}</div>}
              <button onClick={handleLogin} style={{ width:"100%", padding:"13px", background:"linear-gradient(135deg,#1d4ed8,#1e3a8a)", borderRadius:10, color:"white", fontSize:15, fontWeight:700, boxShadow:"0 4px 16px rgba(29,78,216,0.35)", cursor:"pointer" }}>
                Войти →
              </button>
            </div>
            <div style={{ marginTop:16, textAlign:"center", fontSize:13, color:"#64748b" }}>
              Эта неделя: <span style={{ color:"#1d4ed8", fontWeight:700 }}>{submittedFor(curKey).length}</span> / {TEAM.length} подали заявку
            </div>
          </div>
        )}

        {page==="pick" && user && !user.isAdmin && (
          <div className="fade">
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"#1e3a8a", marginBottom:4 }}>Привет, {user.name.split(" ")[0]}! 👋</h2>
              <p style={{ color:"#64748b", fontSize:14 }}>Выбери смены на текущую и следующую неделю</p>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10 }}>
                {SHIFTS.map(s=><span key={s.id} style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, background:s.bg, border:`1px solid ${s.border}`, color:s.textDark, fontSize:11, fontWeight:600 }}>{s.emoji} {s.label}</span>)}
              </div>
              <div style={{ background:"#dbeafe", border:"1px solid #93c5fd", borderRadius:12, padding:"14px 18px", marginBottom:24 }}>
  <div style={{ display:"flex", gap:8, marginBottom:10 }}>
    <span>ℹ️</span>
    <span style={{ color:"#1e40af", fontSize:13, fontWeight:600 }}>Максимум <strong>2 сотрудника</strong> на смену. 🟡 = 1 занято, 🔴✕ = заполнено.</span>
  </div>
  <div style={{ color:"#1e40af", fontSize:12, lineHeight:1.8, borderTop:"1px solid #bfdbfe", paddingTop:10 }}>
    <strong>Как подать заявку:</strong><br/>
    1. Выбери смену на каждый день — нажми на кнопку с нужным временем<br/>
    2. Если день выходной — нажми 🏖 Вых.<br/>
    3. После нажми <strong>💾 Подать заявку</strong><br/>
    4. Можно вернуться и изменить смену на следующую неделю в любой момент до субботы<br/><br/>
    <strong>⚠️ Важно:</strong> если хочешь поменять уже поданную смену — обязательно напиши об этом в телеграм чате и договорись с другим сотрудником об обмене.
  </div>
</div>
            </div>
            <WeekPicker days={curDays}  weekKey={curKey}  label="Текущая неделя" />
            <div style={{ height:1, background:"#e2e8f0", margin:"0 0 28px" }} />
            <WeekPicker days={nextDays} weekKey={nextKey} label="Следующая неделя" />
          </div>
        )}

        {page==="schedule" && (
          <div className="fade">
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"#1e3a8a", marginBottom:4 }}>📋 Сводное расписание</h2>
              <p style={{ color:"#64748b", fontSize:14 }}>Текущая и следующая неделя</p>
            </div>
            <WeekSchedule days={curDays}  weekKey={curKey}  sched={curSched}  warnings={curSchedW}  label="Текущая неделя" />
            <div style={{ height:1, background:"#e2e8f0", margin:"0 0 28px" }} />
            <WeekSchedule days={nextDays} weekKey={nextKey} sched={nextSched} warnings={nextSchedW} label="Следующая неделя" />
          </div>
        )}
      </main>
    </div>
  );
}

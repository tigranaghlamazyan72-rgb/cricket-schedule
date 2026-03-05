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
  { name: "Арман Мусаелян",   password: "arman472"  },
  { name: "Артем Виноградов", password: "artem831"  },
  { name: "Гор Аракелян",     password: "gor594"    },
  { name: "Анжела Лойко",     password: "anjela263" },
  { name: "Маро Тамоян",      password: "maro718"   },
  { name: "Гоар Акопян",      password: "goar345"   },
  { name: "Армо Айрапетян",   password: "armo956"   },
];
const ADMIN = { name: "Менеджер", password: "manager2024" };

const SHIFTS = [
  { id:"A", label:"09:00 – 17:00", short:"09–17", emoji:"🌅", color:"#1d4ed8", accent:"#1e40af", bg:"#eff6ff", border:"#bfdbfe", textDark:"#1e3a8a" },
  { id:"B", label:"13:00 – 21:00", short:"13–21", emoji:"☀️",  color:"#0369a1", accent:"#075985", bg:"#f0f9ff", border:"#bae6fd", textDark:"#0c4a6e" },
  { id:"C", label:"17:00 – 01:00", short:"17–01", emoji:"🌆", color:"#6d28d9", accent:"#5b21b6", bg:"#f5f3ff", border:"#ddd6fe", textDark:"#4c1d95" },
];

function getWeekDays() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const RU_DAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  const RU_MON  = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
  return Array.from({ length:7 }, (_,i) => {
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

const DAYS = getWeekDays();

function getUncoveredShifts(requests, dayKey) {
  return SHIFTS.filter(shift =>
    !TEAM.some(m => (requests[m.name] || {})[dayKey] === shift.id)
  ).map(s => s.id);
}

function buildSchedule(requests) {
  const s = {};
  DAYS.forEach(d => {
    s[d.key] = {};
    SHIFTS.forEach(sh => { s[d.key][sh.id] = []; });
  });
  Object.entries(requests).forEach(([name, days]) => {
    Object.entries(days || {}).forEach(([dayKey, shiftId]) => {
      if (shiftId && s[dayKey]?.[shiftId]) s[dayKey][shiftId].push(name);
    });
  });
  return s;
}

export default function App() {
  const [requests, setRequests] = useState({});
  const [loading, setLoading]   = useState(true);
  const [user, setUser]         = useState(null);
  const [page, setPage]         = useState("login");
  const [draft, setDraft]       = useState({});
  const [saved, setSaved]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState({ name:"", password:"", error:"" });
  const [showPwd, setShowPwd]   = useState(false);
  const pwdRef = useRef();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schedules"), (snapshot) => {
      const data = {};
      snapshot.forEach(doc => { data[doc.id] = doc.data().shifts || {}; });
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
    const m = TEAM.find(x => x.name.toLowerCase() === n.toLowerCase() && x.password === p);
    if (!m) { setForm(f=>({...f,error:"Неверное имя или пароль"})); return; }
    setUser({ name:m.name, isAdmin:false });
    setDraft(requests[m.name] || {});
    setSaved(false); setPage("pick");
    setForm({ name:"", password:"", error:"" });
  }

  function logout() { setUser(null); setPage("login"); setSaved(false); }

  function toggleShift(dayKey, shiftId) {
    setDraft(prev => ({ ...prev, [dayKey]: prev[dayKey] === shiftId ? null : shiftId }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setDoc(doc(db, "schedules", user.name), { shifts: draft });
      setSaved(true);
    } catch(e) {
      alert("Ошибка сохранения. Попробуй ещё раз.");
    }
    setSaving(false);
  }

  const sched = buildSchedule(requests);
  const submitted = TEAM.filter(m => { const d = requests[m.name]; return d && Object.values(d).some(v=>v); });

  function getDraftWarnings() {
    if (!user || user.isAdmin) return {};
    const warnings = {};
    DAYS.forEach(d => {
      const myChoice = draft[d.key];
      if (myChoice) return;
      const simRequests = { ...requests, [user.name]: draft };
      const uncovered = getUncoveredShifts(simRequests, d.key);
      if (uncovered.length > 0) warnings[d.key] = uncovered;
    });
    return warnings;
  }
  const draftWarnings = getDraftWarnings();

  const scheduleWarnings = {};
  DAYS.forEach(d => {
    const uncovered = getUncoveredShifts(requests, d.key);
    if (uncovered.length > 0) scheduleWarnings[d.key] = uncovered;
  });
  const totalWarnings = Object.values(scheduleWarnings).reduce((acc, arr) => acc + arr.length, 0);

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
        .btn{transition:all .15s ease} .btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(29,78,216,0.2)} .btn:active{transform:scale(.98)}
        .fade{animation:fadeUp .25s ease both} @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .card{background:white;border-radius:16px;box-shadow:0 1px 4px rgba(0,0,0,0.06),0 4px 16px rgba(29,78,216,0.06)}
      `}</style>

      <header style={{ background:"#1e3a8a", padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:60, boxShadow:"0 2px 12px rgba(30,58,138,0.3)", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"rgba(255,255,255,0.15)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🏏</div>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:"white" }}>Cricket Live</div>
            <div style={{ fontSize:11, color:"#93c5fd" }}>{DAYS[0].date} – {DAYS[6].date}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {user && <>
            <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:600, color:"white", display:"flex", alignItems:"center", gap:6 }}>
              {user.isAdmin ? "👑" : "👤"} {user.name}
            </div>
            {!user.isAdmin && (
              <button className="btn" onClick={() => setPage(page==="schedule"?"pick":"schedule")} style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:600 }}>
                {page==="schedule" ? "✏️ Мои смены" : "📋 Расписание"}
              </button>
            )}
            <button className="btn" onClick={logout} style={{ background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.3)", color:"#fca5a5", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:600 }}>Выйти</button>
          </>}
        </div>
      </header>

      <main style={{ maxWidth:900, margin:"0 auto", padding:"32px 20px 60px" }}>

        {page==="login" && (
          <div className="fade" style={{ maxWidth:420, margin:"0 auto" }}>
            <div className="card" style={{ padding:"40px 36px" }}>
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
                  <button onClick={()=>setShowPwd(v=>!v)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", color:"#94a3b8", fontSize:17, padding:4 }}>{showPwd?"🙈":"👁"}</button>
                </div>
              </div>
              {form.error && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", color:"#dc2626", fontSize:13, fontWeight:600, marginBottom:16, textAlign:"center" }}>⚠️ {form.error}</div>}
              <button className="btn" onClick={handleLogin} style={{ width:"100%", padding:"13px", background:"linear-gradient(135deg,#1d4ed8,#1e3a8a)", borderRadius:10, color:"white", fontSize:15, fontWeight:700, boxShadow:"0 4px 16px rgba(29,78,216,0.35)" }}>Войти →</button>
            </div>
            <div style={{ marginTop:16, textAlign:"center", fontSize:13, color:"#64748b" }}>
              Подали заявки: <span style={{ color:"#1d4ed8", fontWeight:700 }}>{submitted.length}</span> из {TEAM.length}
            </div>
          </div>
        )}

        {page==="pick" && user && !user.isAdmin && (
          <div className="fade">
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"#1e3a8a", marginBottom:4 }}>Привет, {user.name.split(" ")[0]}! 👋</h2>
              <p style={{ color:"#64748b", fontSize:14 }}>Выбери смены на каждый день недели</p>
            </div>
            {Object.keys(draftWarnings).length > 0 && (
              <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:12, padding:"12px 16px", marginBottom:20, display:"flex", gap:10, alignItems:"flex-start" }}>
                <span style={{ fontSize:18 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight:700, color:"#c2410c", fontSize:13, marginBottom:2 }}>Некоторые смены остаются без сотрудника!</div>
                  <div style={{ color:"#9a3412", fontSize:12 }}>Дни где нет кому работать — отмечены ниже.</div>
                </div>
              </div>
            )}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
              {SHIFTS.map(s => <span key={s.id} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:20, background:s.bg, border:`1px solid ${s.border}`, color:s.textDark, fontSize:12, fontWeight:600 }}>{s.emoji} {s.label}</span>)}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {DAYS.map(d => {
                const picked = draft[d.key];
                const warn = draftWarnings[d.key];
                const pickedShift = SHIFTS.find(s=>s.id===picked);
                return (
                  <div key={d.key} className="card" style={{ padding:"14px 18px", border:`2px solid ${d.isToday?"#3b82f6":warn&&!picked?"#fb923c":"transparent"}`, display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                    <div style={{ minWidth:70 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:d.isToday?"#1d4ed8":d.isWeekend?"#94a3b8":"#1e293b" }}>{d.label}</div>
                      <div style={{ fontSize:12, color:"#94a3b8", marginTop:1 }}>{d.date}</div>
                    </div>
                    {d.isToday && <span style={{ background:"#dbeafe", color:"#1d4ed8", borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>СЕГОДНЯ</span>}
                    {warn && !picked && <span style={{ background:"#fff7ed", border:"1px solid #fed7aa", color:"#c2410c", borderRadius:6, padding:"2px 10px", fontSize:11, fontWeight:600 }}>⚠️ нет сотрудника на {warn.map(id=>SHIFTS.find(s=>s.id===id)?.short).join(", ")}</span>}
                    {picked && pickedShift && <span style={{ background:pickedShift.bg, border:`1px solid ${pickedShift.border}`, color:pickedShift.textDark, borderRadius:8, padding:"3px 12px", fontSize:12, fontWeight:700 }}>{pickedShift.emoji} {pickedShift.label}</span>}
                    <div style={{ display:"flex", gap:6, flex:1, flexWrap:"wrap", justifyContent:"flex-end" }}>
                      {SHIFTS.map(shift => {
                        const active = picked === shift.id;
                        return (
                          <button key={shift.id} className="btn" onClick={()=>toggleShift(d.key,shift.id)} style={{ padding:"8px 14px", borderRadius:10, background:active?shift.bg:"#f8fafc", border:`2px solid ${active?shift.accent:"#e2e8f0"}`, color:active?shift.textDark:"#64748b", fontSize:12, fontWeight:700 }}>
                            {shift.emoji} {shift.short}
                          </button>
                        );
                      })}
                      <button className="btn" onClick={()=>toggleShift(d.key,null)} style={{ padding:"8px 14px", borderRadius:10, background:!picked?"#fef2f2":"#f8fafc", border:`2px solid ${!picked?"#fca5a5":"#e2e8f0"}`, color:!picked?"#dc2626":"#94a3b8", fontSize:12, fontWeight:700 }}>
                        🏖 Выходной
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:24, display:"flex", gap:14, alignItems:"center", justifyContent:"flex-end" }}>
              {saved && <span style={{ color:"#16a34a", fontWeight:700, fontSize:14 }}>✅ Заявка сохранена!</span>}
              <button className="btn" onClick={handleSave} disabled={saving} style={{ padding:"13px 32px", background:saving?"#93c5fd":"linear-gradient(135deg,#1d4ed8,#1e3a8a)", borderRadius:10, color:"white", fontSize:15, fontWeight:700, boxShadow:"0 4px 16px rgba(29,78,216,0.3)" }}>
                {saving ? "Сохраняем..." : "💾 Подать заявку"}
              </button>
            </div>
          </div>
        )}

        {page==="schedule" && (
          <div className="fade">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontSize:22, fontWeight:800, color:"#1e3a8a", marginBottom:4 }}>📋 Расписание недели</h2>
                <p style={{ color:"#64748b", fontSize:13 }}>Подали заявки: <span style={{ color:"#1d4ed8", fontWeight:700 }}>{submitted.length}</span> из {TEAM.length}</p>
              </div>
            </div>
            {totalWarnings > 0 && (
              <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:12, padding:"14px 18px", marginBottom:20 }}>
                <div style={{ fontWeight:700, color:"#c2410c", fontSize:14, marginBottom:8 }}>⚠️ Незакрытые смены ({totalWarnings})</div>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {DAYS.map(d => {
                    const unc = scheduleWarnings[d.key];
                    if (!unc||unc.length===0) return null;
                    return (
                      <div key={d.key} style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <span style={{ fontSize:12, color:"#92400e", fontWeight:600, minWidth:55 }}>{d.label} {d.date}</span>
                        <span style={{ color:"#d97706" }}>→</span>
                        {unc.map(id => { const sh=SHIFTS.find(s=>s.id===id); return <span key={id} style={{ background:sh.bg, border:`1px solid ${sh.border}`, color:sh.textDark, borderRadius:6, padding:"2px 10px", fontSize:11, fontWeight:700 }}>{sh.emoji} {sh.short} — нет сотрудника</span>; })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {totalWarnings===0 && submitted.length===TEAM.length && (
              <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:12, padding:"14px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>✅</span>
                <span style={{ fontWeight:700, color:"#16a34a", fontSize:14 }}>Все смены закрыты! Расписание готово.</span>
              </div>
            )}
            <div className="card" style={{ overflow:"hidden" }}>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:640 }}>
                  <thead>
                    <tr style={{ background:"#1e3a8a" }}>
                      <th style={{ padding:"14px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:"#93c5fd", letterSpacing:"0.05em", width:150 }}>СМЕНА</th>
                      {DAYS.map(d => (
                        <th key={d.key} style={{ padding:"14px 10px", textAlign:"center", fontSize:12, fontWeight:700, color:d.isToday?"#fbbf24":d.isWeekend?"#64748b":"#bfdbfe" }}>
                          <div>{d.label}</div>
                          <div style={{ fontWeight:500, fontSize:11, opacity:.8, marginTop:2 }}>{d.date}</div>
                          {d.isToday && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fbbf24", margin:"4px auto 0" }} />}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SHIFTS.map((shift,si) => (
                      <tr key={shift.id} style={{ borderBottom:"1px solid #e2e8f0", background:si%2===0?"white":"#f8fafc" }}>
                        <td style={{ padding:"14px 16px", borderRight:"1px solid #e2e8f0" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <div style={{ width:36, height:36, background:shift.bg, border:`1px solid ${shift.border}`, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{shift.emoji}</div>
                            <div>
                              <div style={{ fontWeight:700, fontSize:13, color:shift.textDark }}>{shift.label}</div>
                              <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>Смена {shift.id}</div>
                            </div>
                          </div>
                        </td>
                        {DAYS.map(d => {
                          const people = sched[d.key][shift.id] || [];
                          const isUncovered = (scheduleWarnings[d.key]||[]).includes(shift.id);
                          return (
                            <td key={d.key} style={{ padding:"10px 8px", textAlign:"center", verticalAlign:"middle", borderRight:"1px solid #e2e8f0", background:isUncovered?"#fff7ed":d.isToday?"#eff6ff":"transparent" }}>
                              {people.length===0 ? (
                                <span style={{ color:isUncovered?"#f97316":"#cbd5e1", fontSize:isUncovered?18:22, fontWeight:700 }}>{isUncovered?"✗":"·"}</span>
                              ) : (
                                <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                  {people.map(p => <div key={p} style={{ background:shift.bg, border:`1px solid ${shift.border}`, borderRadius:6, padding:"3px 8px", fontSize:11, fontWeight:600, color:shift.textDark, whiteSpace:"nowrap" }}>{p.split(" ")[0]}</div>)}
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
            {TEAM.filter(m=>!submitted.find(s=>s.name===m.name)).length>0 && (
              <div style={{ marginTop:16, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:12, padding:"14px 18px", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                <span style={{ fontSize:13, color:"#dc2626", fontWeight:700 }}>⏳ Ещё не подали:</span>
                {TEAM.filter(m=>!submitted.find(s=>s.name===m.name)).map(m => <span key={m.name} style={{ background:"white", border:"1px solid #fecaca", color:"#dc2626", borderRadius:8, padding:"3px 10px", fontSize:12, fontWeight:600 }}>{m.name.split(" ")[0]}</span>)}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

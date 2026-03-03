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
const NIGHT = { name: "Захар" };
const ADMIN  = { name: "Менеджер", password: "manager2024" };

const SHIFTS = [
  { id:"A", label:"09:00 – 17:00", short:"09–17", emoji:"🌅", color:"#4ade80", accent:"#16a34a", bg:"rgba(34,197,94,0.08)"   },
  { id:"B", label:"13:00 – 21:00", short:"13–21", emoji:"☀️",  color:"#fbbf24", accent:"#d97706", bg:"rgba(251,191,36,0.08)"  },
  { id:"C", label:"17:00 – 01:00", short:"17–01", emoji:"🌆", color:"#a78bfa", accent:"#7c3aed", bg:"rgba(167,139,250,0.08)" },
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
    s[d.key]["N"] = [NIGHT.name];
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
    <div style={{ minHeight:"100vh", background:"#080d14", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:48 }}>🏏</div>
      <div style={{ color:"#475569", fontSize:14 }}>Загрузка...</div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#080d14", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#e2e8f0", display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#1e3a5f;border-radius:4px}
        input{outline:none;font-family:inherit} button{cursor:pointer;font-family:inherit;border:none}
        .rip{transition:all .17s cubic-bezier(.4,0,.2,1)} .rip:hover{transform:translateY(-2px)} .rip:active{transform:scale(.97)}
        .fade{animation:fadeUp .3s ease both} @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.45}} .blink{animation:blink 1.8s infinite}
      `}</style>

      <header style={{ background:"rgba(255,255,255,0.025)", borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10, backdropFilter:"blur(12px)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:38, height:38, background:"linear-gradient(135deg,#22c55e,#15803d)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🏏</div>
          <div>
            <div style={{ fontWeight:800, fontSize:16, letterSpacing:"-0.3px" }}>Cricket Live</div>
            <div style={{ fontSize:11, color:"#475569", fontFamily:"'DM Mono',monospace" }}>{DAYS[0].date} – {DAYS[6].date}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {user && <>
            <div style={{ background:"rgba(34,197,94,0.1)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:700, color:"#4ade80", display:"flex", alignItems:"center", gap:6 }}>
              {user.isAdmin ? "👑" : "👤"} {user.name}
            </div>
            {!user.isAdmin && (
              <button className="rip" onClick={() => setPage(page==="schedule"?"pick":"schedule")} style={{ background:page==="schedule"?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.05)", border:`1px solid ${page==="schedule"?"rgba(167,139,250,0.3)":"rgba(255,255,255,0.1)"}`, color:page==="schedule"?"#a78bfa":"#94a3b8", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:700 }}>
                {page==="schedule" ? "✏️ Мои смены" : "📋 Расписание"}
              </button>
            )}
            <button className="rip" onClick={logout} style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.18)", color:"#f87171", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:700 }}>Выйти</button>
          </>}
        </div>
      </header>

      <main style={{ flex:1, maxWidth:900, width:"100%", margin:"0 auto", padding:"32px 20px 60px" }}>

        {page==="login" && (
          <div className="fade" style={{ maxWidth:400, margin:"0 auto" }}>
            <div style={{ textAlign:"center", marginBottom:36 }}>
              <div style={{ fontSize:52, marginBottom:14 }}>🏏</div>
              <h1 style={{ fontSize:30, fontWeight:800, letterSpacing:"-1px", marginBottom:8 }}>Добро пожаловать</h1>
              <p style={{ color:"#475569", fontSize:14 }}>Войди, чтобы подать заявку на смены</p>
            </div>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"32px 28px" }}>
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#64748b", letterSpacing:"0.05em", display:"block", marginBottom:8 }}>ИМЯ</label>
                <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value,error:""}))} onKeyDown={e=>e.key==="Enter"&&pwdRef.current?.focus()} placeholder="Введи своё имя..."
                  style={{ width:"100%", padding:"13px 16px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, color:"#e2e8f0", fontSize:15, fontWeight:500 }} />
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#64748b", letterSpacing:"0.05em", display:"block", marginBottom:8 }}>ПАРОЛЬ</label>
                <div style={{ position:"relative" }}>
                  <input ref={pwdRef} type={showPwd?"text":"password"} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value,error:""}))} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••"
                    style={{ width:"100%", padding:"13px 48px 13px 16px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, color:"#e2e8f0", fontSize:15, fontWeight:500 }} />
                  <button onClick={()=>setShowPwd(v=>!v)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", color:"#475569", fontSize:18, padding:4 }}>{showPwd?"🙈":"👁"}</button>
                </div>
              </div>
              {form.error && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:10, padding:"10px 14px", color:"#fca5a5", fontSize:13, fontWeight:600, marginBottom:16, textAlign:"center" }}>⚠️ {form.error}</div>}
              <button className="rip" onClick={handleLogin} style={{ width:"100%", padding:15, background:"linear-gradient(135deg,#22c55e,#15803d)", borderRadius:14, color:"white", fontSize:16, fontWeight:800, boxShadow:"0 4px 20px rgba(34,197,94,0.25)" }}>Войти →</button>
            </div>
            <div style={{ marginTop:20, textAlign:"center", fontSize:13, color:"#334155" }}>
              Подали заявки: <span style={{ color:"#4ade80", fontWeight:700 }}>{submitted.length}</span> / {TEAM.length}
            </div>
          </div>
        )}

        {page==="pick" && user && !user.isAdmin && (
          <div className="fade">
            <div style={{ marginBottom:24 }}>
              <h2 style={{ fontSize:24, fontWeight:800, letterSpacing:"-0.5px", marginBottom:6 }}>Привет, {user.name.split(" ")[0]}! 👋</h2>
              <p style={{ color:"#64748b", fontSize:14 }}>Выбери желаемые смены — по одной на каждый день</p>
            </div>
            {Object.keys(draftWarnings).length > 0 && (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:12, padding:"12px 16px", marginBottom:20, display:"flex", gap:10, alignItems:"flex-start" }}>
                <span style={{ fontSize:18 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight:700, color:"#f87171", fontSize:13, marginBottom:4 }}>Некоторые смены остаются без сотрудника!</div>
                  <div style={{ color:"#94a3b8", fontSize:12 }}>Если ты возьмёшь выходной в эти дни — смена будет не закрыта.</div>
                </div>
              </div>
            )}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
              {SHIFTS.map(s => (
                <span key={s.id} style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:20, background:s.bg, border:`1px solid ${s.accent}55`, color:s.color, fontSize:12, fontWeight:700 }}>{s.emoji} {s.id} · {s.label}</span>
              ))}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {DAYS.map(d => {
                const picked = draft[d.key];
                const warn = draftWarnings[d.key];
                return (
                  <div key={d.key} style={{ background:d.isToday?"rgba(34,197,94,0.05)":warn?"rgba(239,68,68,0.04)":d.isWeekend?"rgba(255,255,255,0.015)":"rgba(255,255,255,0.025)", border:`1px solid ${d.isToday?"rgba(34,197,94,0.25)":warn?"rgba(239,68,68,0.25)":"rgba(255,255,255,0.06)"}`, borderRadius:14, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                    <div style={{ minWidth:64 }}>
                      <div style={{ fontWeight:800, fontSize:15, color:d.isToday?"#4ade80":warn?"#f87171":d.isWeekend?"#94a3b8":"#e2e8f0", fontFamily:"'DM Mono',monospace" }}>{d.label}</div>
                      <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>{d.date}</div>
                    </div>
                    {d.isToday && <div className="blink" style={{ background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.3)", color:"#4ade80", borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:800 }}>СЕГОДНЯ</div>}
                    {warn && !picked && (
                      <div style={{ background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.25)", borderRadius:8, padding:"3px 10px", fontSize:11, fontWeight:700, color:"#fca5a5" }}>
                        ⚠️ нет никого на {warn.map(id => SHIFTS.find(s=>s.id===id)?.short).join(", ")}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:6, flex:1, flexWrap:"wrap", justifyContent:"flex-end" }}>
                      {SHIFTS.map(shift => {
                        const active = picked === shift.id;
                        return (
                          <button key={shift.id} className="rip" onClick={()=>toggleShift(d.key,shift.id)} style={{ padding:"8px 16px", borderRadius:10, background:active?shift.bg:"rgba(255,255,255,0.04)", border:`2px solid ${active?shift.color:"rgba(255,255,255,0.08)"}`, color:active?shift.color:"#475569", fontSize:12, fontWeight:700, display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                            <span style={{ fontSize:14 }}>{shift.emoji}</span><span>{shift.short}</span>
                          </button>
                        );
                      })}
                      <button className="rip" onClick={()=>toggleShift(d.key,null)} style={{ padding:"8px 14px", borderRadius:10, background:!picked?"rgba(239,68,68,0.1)":"rgba(255,255,255,0.03)", border:`2px solid ${!picked?"rgba(239,68,68,0.35)":"rgba(255,255,255,0.06)"}`, color:!picked?"#f87171":"#334155", fontSize:12, fontWeight:700, display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                        <span style={{ fontSize:14 }}>🏖</span><span>Выходной</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:28, display:"flex", gap:14, alignItems:"center", justifyContent:"flex-end" }}>
              {saved && <span style={{ color:"#4ade80", fontWeight:700, fontSize:14 }}>✅ Заявка сохранена!</span>}
              <button className="rip" onClick={handleSave} disabled={saving} style={{ padding:"14px 36px", background:saving?"#1e3a5f":"linear-gradient(135deg,#22c55e,#15803d)", borderRadius:14, color:"white", fontSize:16, fontWeight:800, boxShadow:saving?"none":"0 4px 24px rgba(34,197,94,0.3)", opacity:saving?0.7:1 }}>
                {saving ? "Сохраняем..." : "💾 Подать заявку"}
              </button>
            </div>
          </div>
        )}

        {page==="schedule" && (
          <div className="fade">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontSize:24, fontWeight:800, letterSpacing:"-0.5px", marginBottom:4 }}>📋 Расписание недели</h2>
                <p style={{ color:"#475569", fontSize:13 }}>Подали заявки: <span style={{ color:"#4ade80", fontWeight:700 }}>{submitted.length}</span> / {TEAM.length}</p>
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {SHIFTS.map(s => <span key={s.id} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:20, background:s.bg, border:`1px solid ${s.accent}55`, color:s.color, fontSize:11, fontWeight:700 }}>{s.emoji} {s.id}</span>)}
              </div>
            </div>
            {totalWarnings > 0 && (
              <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:14, padding:"14px 18px", marginBottom:20 }}>
                <div style={{ fontWeight:800, color:"#f87171", fontSize:14, marginBottom:10 }}>⚠️ Незакрытые смены ({totalWarnings})</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {DAYS.map(d => {
                    const uncovered = scheduleWarnings[d.key];
                    if (!uncovered || uncovered.length === 0) return null;
                    return (
                      <div key={d.key} style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#94a3b8", minWidth:50 }}>{d.label} {d.date}</span>
                        <span style={{ color:"#64748b", fontSize:12 }}>→</span>
                        {uncovered.map(id => {
                          const sh = SHIFTS.find(s=>s.id===id);
                          return <span key={id} style={{ background:sh.bg, border:`1px solid ${sh.accent}55`, color:sh.color, borderRadius:8, padding:"2px 10px", fontSize:11, fontWeight:700 }}>{sh.emoji} {sh.short} — нет сотрудника</span>;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {totalWarnings === 0 && submitted.length === TEAM.length && (
              <div style={{ background:"rgba(34,197,94,0.07)", border:"1px solid rgba(34,197,94,0.2)", borderRadius:14, padding:"14px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:20 }}>✅</span>
                <span style={{ fontWeight:700, color:"#4ade80", fontSize:14 }}>Все смены закрыты! Расписание готово.</span>
              </div>
            )}
            <div style={{ overflowX:"auto", borderRadius:16, border:"1px solid rgba(255,255,255,0.07)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", minWidth:640 }}>
                <thead>
                  <tr style={{ background:"rgba(255,255,255,0.03)", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
                    <th style={{ padding:"12px 16px", textAlign:"left", fontSize:11, fontWeight:700, color:"#475569", letterSpacing:"0.05em", width:140 }}>СМЕНА</th>
                    {DAYS.map(d => (
                      <th key={d.key} style={{ padding:"12px 10px", textAlign:"center", fontSize:12, fontWeight:700, color:d.isToday?"#4ade80":d.isWeekend?"#64748b":"#94a3b8" }}>
                        <div>{d.label}</div>
                        <div style={{ fontWeight:500, fontSize:10, opacity:.7, marginTop:2, fontFamily:"'DM Mono',monospace" }}>{d.date}</div>
                        {d.isToday && <div style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", margin:"4px auto 0" }} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SHIFTS.map((shift,si) => (
                    <tr key={shift.id} style={{ borderBottom:si<SHIFTS.length-1?"1px solid rgba(255,255,255,0.04)":"none" }}>
                      <td style={{ padding:"14px 16px", background:shift.bg, borderRight:"1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:18 }}>{shift.emoji}</span>
                          <div>
                            <div style={{ fontWeight:800, fontSize:13, color:shift.color }}>{shift.id}</div>
                            <div style={{ fontSize:11, color:"#475569", fontFamily:"'DM Mono',monospace" }}>{shift.label}</div>
                          </div>
                        </div>
                      </td>
                      {DAYS.map(d => {
                        const people = sched[d.key][shift.id] || [];
                        const isUncovered = (scheduleWarnings[d.key] || []).includes(shift.id);
                        return (
                          <td key={d.key} style={{ padding:"10px 8px", textAlign:"center", background:isUncovered?"rgba(239,68,68,0.05)":d.isToday?"rgba(34,197,94,0.03)":"transparent", verticalAlign:"middle", borderRight:"1px solid rgba(255,255,255,0.03)" }}>
                            {people.length===0 ? (
                              <span style={{ color:isUncovered?"#ef4444":"#1e293b", fontSize:isUncovered?16:20 }}>{isUncovered?"✗":"·"}</span>
                            ) : (
                              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                                {people.map(p => <div key={p} style={{ background:shift.bg, border:`1px solid ${shift.accent}44`, borderRadius:8, padding:"3px 7px", fontSize:10, fontWeight:700, color:shift.color, whiteSpace:"nowrap" }}>{p.split(" ")[0]}</div>)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td style={{ padding:"14px 16px", background:"rgba(56,189,248,0.08)", borderRight:"1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:18 }}>🌙</span>
                        <div>
                          <div style={{ fontWeight:800, fontSize:13, color:"#38bdf8" }}>N</div>
                          <div style={{ fontSize:11, color:"#475569", fontFamily:"'DM Mono',monospace" }}>01:00 – 09:00</div>
                        </div>
                      </div>
                    </td>
                    {DAYS.map(d => (
                      <td key={d.key} style={{ padding:"10px 8px", textAlign:"center", background:d.isToday?"rgba(34,197,94,0.03)":"transparent", verticalAlign:"middle", borderRight:"1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ background:"rgba(56,189,248,0.08)", border:"1px solid rgba(2,132,199,0.3)", borderRadius:8, padding:"3px 7px", fontSize:10, fontWeight:700, color:"#38bdf8", whiteSpace:"nowrap" }}>Захар</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {TEAM.filter(m=>!submitted.find(s=>s.name===m.name)).length>0 && (
              <div style={{ marginTop:16, background:"rgba(239,68,68,0.05)", border:"1px solid rgba(239,68,68,0.15)", borderRadius:14, padding:"14px 18px", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                <span style={{ fontSize:13, color:"#f87171", fontWeight:700 }}>⏳ Ещё не подали:</span>
                {TEAM.filter(m=>!submitted.find(s=>s.name===m.name)).map(m => <span key={m.name} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", color:"#fca5a5", borderRadius:8, padding:"3px 10px", fontSize:12, fontWeight:700 }}>{m.name.split(" ")[0]}</span>)}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

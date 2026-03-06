import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, deleteDoc, updateDoc, onSnapshot, collection } from "firebase/firestore";

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
  { name: "Арман Мусаелян",   login: "arman",  password: "arman472"  },
  { name: "Артем Виноградов", login: "artem",  password: "artem831"  },
  { name: "Гор Аракелян",     login: "gor",    password: "gor594"    },
  { name: "Анжела Лойко",     login: "anjela", password: "anjela263" },
  { name: "Маро Тамоян",      login: "maro",   password: "maro718"   },
  { name: "Гоар Акопян",      login: "goar",   password: "goar345"   },
  { name: "Армо Айрапетян",   login: "armo",   password: "armo956"   },
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

function weekLabel(days) {
  return `${days[0].date} – ${days[6].date}`;
}

function getWeekKey(days) { return days[0].key; }

// Count how many people signed up for a specific shift on a day in a week
function countForShift(requests, weekKey, dayKey, shiftId) {
  return TEAM.filter(m => ((requests[m.name] || {})[weekKey] || {})[dayKey] === shiftId).length;
}

function buildSchedule(requests, days, weekKey) {
  const s = {};
  days.forEach(d => {
    s[d.key] = {};
    SHIFTS.forEach(sh => { s[d.key][sh.id] = []; });
  });
  Object.entries(requests).forEach(([name, weeks]) => {
    const weekData = (weeks[weekKey] || {});
    Object.entries(weekData).forEach(([dayKey, shiftId]) => {
      if (shiftId && s[dayKey]?.[shiftId]) s[dayKey][shiftId].push(name);
    });
  });
  return s;
}

function getUncoveredShifts(requests, dayKey, weekKey) {
  return SHIFTS.filter(shift =>
    !TEAM.some(m => ((requests[m.name] || {})[weekKey] || {})[dayKey] === shift.id)
  ).map(s => s.id);
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
  const [editModal, setEditModal] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnMsg, setNewAnnMsg] = useState("");
  const [swapRequests, setSwapRequests] = useState([]);
  const [swapModal, setSwapModal] = useState(null);
  const [userColors, setUserColors] = useState({});
  const [showProfile, setShowProfile] = useState(false);
  const pwdRef = useRef();

  function getAutoColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 42%)`;
  }
  function nameColor(name) { return userColors[name] || getAutoColor(name); }

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "announcements"), (snapshot) => {
      const docs = [];
      snapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
      setAnnouncements(docs.sort((a, b) => b.createdAt - a.createdAt));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const colors = {};
      snapshot.forEach(d => { const data = d.data(); if (data.name && data.nameColor) colors[data.name] = data.nameColor; });
      setUserColors(colors);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "shift_swaps"), (snapshot) => {
      const swaps = [];
      snapshot.forEach(d => swaps.push({ id: d.id, ...d.data() }));
      setSwapRequests(swaps.sort((a,b) => b.createdAt - a.createdAt));
    });
    return () => unsub();
  }, []);

  async function postAnnouncement() {
    if (!newAnnMsg.trim()) return;
    try {
      const id = Date.now().toString();
      await setDoc(doc(db, "announcements", id), {
        text: newAnnMsg,
        author: user.name,
        createdAt: Date.now()
      });
      setNewAnnMsg("");
    } catch(e) { alert("Ошибка при публикации"); }
  }

  async function deleteAnnouncement(annId) {
    await deleteDoc(doc(db, "announcements", annId));
  }

  async function initiateSwap(weekKey, dayKey, fromShift, targetUser, toShift, message) {
    try {
      const id = Date.now().toString();
      await setDoc(doc(db, "shift_swaps", id), {
        requester: user.name,
        weekKey,
        dayKey,
        fromShift,
        toShift: toShift || null,
        targetUser: targetUser || null,
        status: "pending",
        createdAt: Date.now(),
        message: message || ""
      });
    } catch(e) { alert("Ошибка отправки запроса"); }
  }

  async function handleSwapAction(swapId, action) {
    const swapRef = doc(db, "shift_swaps", swapId);
    const swap = swapRequests.find(s => s.id === swapId);
    if (!swap) return;

    if (action === "accept" || action === "approve") {
      const weekDataReq = { ...((requests[swap.requester]||{})[swap.weekKey] || {}) };
      weekDataReq[swap.dayKey] = swap.toShift;
      await setDoc(doc(db, "schedules", swap.requester), { ...(requests[swap.requester]||{}), [swap.weekKey]: weekDataReq });

      if (swap.targetUser) {
        const weekDataTgt = { ...((requests[swap.targetUser]||{})[swap.weekKey] || {}) };
        weekDataTgt[swap.dayKey] = swap.fromShift;
        await setDoc(doc(db, "schedules", swap.targetUser), { ...(requests[swap.targetUser]||{}), [swap.weekKey]: weekDataTgt });
      }
      await updateDoc(swapRef, { status: action === "approve" ? "manager_approved" : "accepted" });
    } else {
      await updateDoc(swapRef, { status: "rejected" });
    }
  }

  async function cancelSwap(swapId) {
    await deleteDoc(doc(db, "shift_swaps", swapId));
  }

  async function managerEditShift(memberName, weekKey, dayKey, newShiftId) {
    const existing = requests[memberName] || {};
    const weekData = { ...(existing[weekKey] || {}) };
    if (newShiftId === null) { delete weekData[dayKey]; } else { weekData[dayKey] = newShiftId; }
    await setDoc(doc(db, "schedules", memberName), { ...existing, [weekKey]: weekData });
    setEditModal(null);
  }

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
    setDrafts({
      [curKey]:  existing[curKey]  || {},
      [nextKey]: existing[nextKey] || {},
    });
    setSaved({}); setPage("pick");
    setForm({ name:"", password:"", error:"" });
  }

  function logout() { setUser(null); setPage("login"); }

  function toggleShift(weekKey, dayKey, shiftId) {
    setDrafts(prev => ({
      ...prev,
      [weekKey]: {
        ...(prev[weekKey] || {}),
        [dayKey]: (prev[weekKey] || {})[dayKey] === shiftId ? null : shiftId,
      }
    }));
    setSaved(s => ({ ...s, [weekKey]: false }));
  }

  async function handleSave(weekKey) {
    setSaving(s => ({ ...s, [weekKey]: true }));
    try {
      const existing = requests[user.name] || {};
      await setDoc(doc(db, "schedules", user.name), {
        ...existing,
        [weekKey]: drafts[weekKey] || {},
      });
      setSaved(s => ({ ...s, [weekKey]: true }));
    } catch(e) {
      alert("Ошибка сохранения. Попробуй ещё раз.");
    }
    setSaving(s => ({ ...s, [weekKey]: false }));
  }

  function submittedFor(weekKey) {
    return TEAM.filter(m => {
      const d = (requests[m.name] || {})[weekKey];
      return d && Object.values(d).some(v => v);
    });
  }

  function getSchedWarnings(days, weekKey) {
    const w = {};
    days.forEach(d => {
      const unc = getUncoveredShifts(requests, d.key, weekKey);
      if (unc.length > 0) w[d.key] = unc;
    });
    return w;
  }

  function getDraftWarnings(weekKey, days) {
    if (!user || user.isAdmin) return {};
    const w = {};
    days.forEach(d => {
      const myChoice = (drafts[weekKey] || {})[d.key];
      if (myChoice) return;
      const sim = {};
      TEAM.forEach(m => { sim[m.name] = { ...((requests[m.name] || {})[weekKey] || {}) }; });
      sim[user.name] = { ...(drafts[weekKey] || {}) };
      const unc = SHIFTS.filter(sh => !TEAM.some(m => (sim[m.name]||{})[d.key] === sh.id)).map(s=>s.id);
      if (unc.length > 0) w[d.key] = unc;
    });
    return w;
  }

  const curSched   = buildSchedule(requests, curDays,  curKey);
  const nextSched  = buildSchedule(requests, nextDays, nextKey);
  const curSchedW  = getSchedWarnings(curDays,  curKey);
  const nextSchedW = getSchedWarnings(nextDays, nextKey);
  const curDraftW  = getDraftWarnings(curKey,  curDays);
  const nextDraftW = getDraftWarnings(nextKey, nextDays);

  const btnStyle = { transition:"all .15s ease", cursor:"pointer" };

  // ── WEEK PICKER BLOCK ────────────────────────────────────
  function WeekPicker({ days, weekKey, label }) {
    const draft    = drafts[weekKey] || {};
    const isSaved  = !!saved[weekKey];
    const isSaving = !!saving[weekKey];
    const draftWarn = weekKey === curKey ? curDraftW : nextDraftW;

    return (
      <div style={{ marginBottom:36 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#1e3a8a", marginTop:2 }}>{weekLabel(days)}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {isSaved && <span style={{ color:"#16a34a", fontWeight:700, fontSize:13 }}>✅ Сохранено!</span>}
            <button onClick={()=>handleSave(weekKey)} disabled={isSaving} style={{ ...btnStyle, padding:"10px 22px", background:isSaving?"#93c5fd":"linear-gradient(135deg,#1d4ed8,#1e3a8a)", borderRadius:10, color:"white", fontSize:13, fontWeight:700, border:"none", boxShadow:"0 3px 10px rgba(29,78,216,0.3)" }}>
              {isSaving ? "Сохраняем..." : "💾 Подать заявку"}
            </button>
          </div>
        </div>



        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {days.map(d => {
            const picked = draft[d.key];
            const warn   = draftWarn[d.key];
            const pickedShift = SHIFTS.find(s=>s.id===picked);
            return (
              <div key={d.key} style={{ background:"white", borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,0.07)", padding:"12px 16px", border:`2px solid ${d.isToday?"#3b82f6":"#f1f5f9"}`, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                <div style={{ minWidth:64 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:d.isToday?"#1d4ed8":d.isWeekend?"#94a3b8":"#1e293b" }}>{d.label}</div>
                  <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{d.date}</div>
                </div>
                {d.isToday && <span style={{ background:"#dbeafe", color:"#1d4ed8", borderRadius:6, padding:"2px 7px", fontSize:10, fontWeight:700 }}>СЕГОДНЯ</span>}
                {picked && pickedShift && (
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ background:pickedShift.bg, border:`1px solid ${pickedShift.border}`, color:pickedShift.textDark, borderRadius:7, padding:"3px 10px", fontSize:11, fontWeight:700 }}>
                      {pickedShift.emoji} {pickedShift.label}
                    </span>
                    <button onClick={()=>setSwapModal({ dayKey:d.key, dayLabel:`${d.label} ${d.date}`, fromShift:picked, weekKey })}
                      style={{ padding:"3px 8px", background:"#fef9c3", border:"1px solid #fde047", borderRadius:7, fontSize:10, fontWeight:700, color:"#854d0e", cursor:"pointer" }}>
                      🔄 обмен
                    </button>
                  </div>
                )}
                <div style={{ display:"flex", gap:5, flex:1, flexWrap:"wrap", justifyContent:"flex-end" }}>
                  {SHIFTS.map(shift => {
                    const active  = picked === shift.id;
                    const count   = countForShift(requests, weekKey, d.key, shift.id);
                    const full    = count >= MAX_PER_SHIFT && !active;
                    return (
                      <button key={shift.id} onClick={()=>!full && toggleShift(weekKey,d.key,shift.id)}
                        title={full ? `Смена заполнена (${count}/${MAX_PER_SHIFT})` : ""}
                        style={{ ...btnStyle, padding:"7px 11px", borderRadius:8, background:active?shift.bg:full?"#f1f5f9":"#f8fafc", border:`2px solid ${active?shift.accent:full?"#e2e8f0":"#e2e8f0"}`, color:active?shift.textDark:full?"#cbd5e1":"#64748b", fontSize:11, fontWeight:700, opacity:full?0.55:1, cursor:full?"not-allowed":"pointer", position:"relative" }}>
                        {shift.emoji} {shift.short}
                        {full && <span style={{ position:"absolute", top:-6, right:-6, background:"#ef4444", color:"white", borderRadius:"50%", width:14, height:14, fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>✕</span>}
                        {!full && count > 0 && !active && <span style={{ position:"absolute", top:-6, right:-6, background:"#f59e0b", color:"white", borderRadius:"50%", width:14, height:14, fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{count}</span>}
                      </button>
                    );
                  })}
                  <button onClick={()=>toggleShift(weekKey,d.key,null)}
                    style={{ ...btnStyle, padding:"7px 11px", borderRadius:8, background:!picked?"#fef2f2":"#f8fafc", border:`2px solid ${!picked?"#fca5a5":"#e2e8f0"}`, color:!picked?"#dc2626":"#94a3b8", fontSize:11, fontWeight:700 }}>
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

  // ── WEEK SCHEDULE BLOCK ──────────────────────────────────
  function WeekSchedule({ days, weekKey, sched, warnings, label }) {
    const sub = submittedFor(weekKey);
    const totalWarn = Object.values(warnings).reduce((a,b)=>a+b.length,0);
    return (
      <div style={{ marginBottom:40 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#1e3a8a", marginTop:2 }}>{weekLabel(days)}</div>
          </div>
          <div style={{ fontSize:13, color:"#64748b" }}>Подали: <span style={{ color:"#1d4ed8", fontWeight:700 }}>{sub.length}</span> / {TEAM.length}</div>
        </div>

        {totalWarn > 0 && (
          <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:10, padding:"12px 16px", marginBottom:12 }}>
            <div style={{ fontWeight:700, color:"#c2410c", fontSize:13, marginBottom:6 }}>⚠️ Незакрытые смены ({totalWarn})</div>
            {days.map(d => {
              const unc = warnings[d.key];
              if (!unc||unc.length===0) return null;
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

        {totalWarn===0 && sub.length===TEAM.length && (
          <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"12px 16px", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
            <span>✅</span><span style={{ fontWeight:700, color:"#16a34a", fontSize:13 }}>Все смены закрыты! Расписание готово.</span>
          </div>
        )}

        <div style={{ background:"white", borderRadius:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06),0 4px 16px rgba(29,78,216,0.06)", overflow:"hidden" }}>
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
                      const people = sched[d.key][shift.id] || [];
                      const isUnc  = (warnings[d.key]||[]).includes(shift.id);
                      const isFull = people.length >= MAX_PER_SHIFT;
                      // find members NOT in this shift for this day (for admin to assign)
                      return (
                        <td key={d.key} style={{ padding:"8px 6px", textAlign:"center", verticalAlign:"middle", borderRight:"1px solid #f1f5f9", background:isUnc?"#fff7ed":d.isToday?"#eff6ff":"transparent", position:"relative" }}>
                          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                            {people.length===0 && (
                              <span style={{ color:isUnc?"#f97316":"#e2e8f0", fontSize:isUnc?16:20, fontWeight:700 }}>{isUnc?"✗":"·"}</span>
                            )}
                            {people.map(p => (
                              <div key={p}
                                onClick={()=> user?.isAdmin && setEditModal({ memberName:p, weekKey, dayKey:d.key, dayLabel:`${d.label} ${d.date}`, currentShift:shift.id })}
                                style={{ background:shift.bg, border:`1px solid ${shift.border}`, borderRadius:6, padding:"2px 7px", fontSize:10, fontWeight:600, color:shift.textDark, whiteSpace:"nowrap", cursor:user?.isAdmin?"pointer":"default", display:"flex", alignItems:"center", gap:3 }}>
                                {p.split(" ")[0]}
                                {user?.isAdmin && <span style={{ fontSize:9, opacity:0.5 }}>✏️</span>}
                              </div>
                            ))}
                            {isFull && <div style={{ fontSize:9, color:"#16a34a", fontWeight:700 }}>✓ закрыто</div>}
                            {user?.isAdmin && isUnc && (
                              <button onClick={()=>setEditModal({ memberName:null, weekKey, dayKey:d.key, dayLabel:`${d.label} ${d.date}`, currentShift:shift.id, assignShift:shift.id })}
                                style={{ background:"#fff7ed", border:"1px dashed #fb923c", borderRadius:6, padding:"2px 6px", fontSize:9, fontWeight:700, color:"#c2410c", cursor:"pointer" }}>+ назначить</button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {TEAM.filter(m=>!submittedFor(weekKey).find(s=>s.name===m.name)).length>0 && (
          <div style={{ marginTop:12, background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"12px 16px", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:13, color:"#dc2626", fontWeight:700 }}>⏳ Не подали:</span>
            {TEAM.filter(m=>!submittedFor(weekKey).find(s=>s.name===m.name)).map(m => (
              <span key={m.name} style={{ background:"white", border:"1px solid #fecaca", color:"#dc2626", borderRadius:7, padding:"2px 9px", fontSize:12, fontWeight:600 }}>{m.name.split(" ")[0]}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── EDIT MODAL ───────────────────────────────────────────
  function ProfileSettings() {
    const [selectedColor, setSelectedColor] = useState(userColors[user?.name] || getAutoColor(user?.name||""));
    const presets = ["#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899","#6366f1","#0891b2","#059669","#dc2626"];

    async function saveColor() {
      try {
        await setDoc(doc(db, "users", user.name), { name: user.name, nameColor: selectedColor, lastUpdated: Date.now() }, { merge: true });
      } catch(e) { alert("Ошибка сохранения"); }
    }

    if (!user) return null;
    return (
      <div style={{ marginBottom:28, background:"white", borderRadius:16, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.06),0 4px 16px rgba(29,78,216,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          <span style={{ fontSize:20 }}>🎨</span>
          <h3 style={{ fontWeight:800, color:"#1e3a8a", fontSize:16 }}>Мой цвет</h3>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:14 }}>
          {presets.map(c => (
            <button key={c} onClick={()=>setSelectedColor(c)} style={{ width:36, height:36, background:c, border:selectedColor===c?"3px solid #1e3a8a":"2px solid #e2e8f0", borderRadius:8, cursor:"pointer", transition:"all .15s" }} />
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:700, color:"#374151" }}>Любой цвет:</label>
          <input type="color" value={selectedColor} onChange={e=>setSelectedColor(e.target.value)} style={{ width:48, height:36, border:"2px solid #e2e8f0", borderRadius:8, cursor:"pointer", padding:2 }} />
          <div style={{ fontSize:13, color:"#64748b" }}>Предпросмотр: <span style={{ color:selectedColor, fontWeight:800, fontSize:14 }}>{user.name.split(" ")[0]}</span></div>
        </div>
        <button onClick={saveColor} style={{ padding:"9px 20px", background:"linear-gradient(135deg,#1d4ed8,#1e3a8a)", color:"white", borderRadius:10, fontWeight:700, fontSize:13, border:"none", cursor:"pointer" }}>
          💾 Сохранить
        </button>
      </div>
    );
  }

  function SwapModal() {
    const [targetUser, setTargetUser] = useState("");
    const [toShift, setToShift] = useState("");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    if (!swapModal) return null;
    const { dayKey, dayLabel, fromShift, weekKey } = swapModal;
    const sh = SHIFTS.find(s=>s.id===fromShift);
    const teammates = TEAM.filter(m => m.name !== user?.name);

    async function submit() {
      if (!targetUser && !toShift) { alert("Выбери получателя или желаемую смену"); return; }
      setSending(true);
      await initiateSwap(weekKey, dayKey, fromShift, targetUser||null, toShift||null, message);
      setSending(false);
      setSwapModal(null);
    }

    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setSwapModal(null)}>
        <div style={{ background:"white", borderRadius:18, padding:28, maxWidth:400, width:"100%", boxShadow:"0 24px 64px rgba(0,0,0,0.2)" }} onClick={e=>e.stopPropagation()}>
          <div style={{ fontWeight:800, fontSize:17, color:"#1e3a8a", marginBottom:4 }}>🔄 Предложить обмен</div>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:18 }}>{dayLabel}</div>

          <div style={{ background:sh?.bg, border:`1px solid ${sh?.border}`, borderRadius:10, padding:"10px 14px", marginBottom:18, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:16 }}>{sh?.emoji}</span>
            <div>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:1 }}>Твоя смена</div>
              <div style={{ fontWeight:700, color:sh?.textDark, fontSize:13 }}>{sh?.label}</div>
            </div>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#374151", letterSpacing:"0.04em", display:"block", marginBottom:6 }}>ПРЕДЛОЖИТЬ КОМУ</label>
            <select value={targetUser} onChange={e=>setTargetUser(e.target.value)}
              style={{ width:"100%", padding:"10px 12px", background:"#f8fafc", border:"2px solid #e2e8f0", borderRadius:10, fontSize:13, color:"#1e293b", fontFamily:"inherit" }}>
              <option value="">— Всей команде (открытый запрос) —</option>
              {teammates.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#374151", letterSpacing:"0.04em", display:"block", marginBottom:6 }}>ХОЧУ НА СМЕНУ</label>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              <button onClick={()=>setToShift("")} style={{ padding:"7px 12px", borderRadius:8, background:!toShift?"#eff6ff":"#f8fafc", border:`2px solid ${!toShift?"#1e40af":"#e2e8f0"}`, color:!toShift?"#1e3a8a":"#64748b", fontSize:11, fontWeight:700, cursor:"pointer" }}>Любую</button>
              {SHIFTS.filter(s=>s.id!==fromShift).map(s=>(
                <button key={s.id} onClick={()=>setToShift(s.id)} style={{ padding:"7px 12px", borderRadius:8, background:toShift===s.id?s.bg:"#f8fafc", border:`2px solid ${toShift===s.id?s.accent:"#e2e8f0"}`, color:toShift===s.id?s.textDark:"#64748b", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                  {s.emoji} {s.short}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"#374151", letterSpacing:"0.04em", display:"block", marginBottom:6 }}>СООБЩЕНИЕ (необязательно)</label>
            <input value={message} onChange={e=>setMessage(e.target.value)} placeholder="Причина обмена..."
              style={{ width:"100%", padding:"10px 12px", background:"#f8fafc", border:"2px solid #e2e8f0", borderRadius:10, fontSize:13, fontFamily:"inherit", outline:"none" }} />
          </div>

          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setSwapModal(null)} style={{ flex:1, padding:"11px", borderRadius:10, background:"#f1f5f9", border:"none", color:"#64748b", fontSize:13, fontWeight:600, cursor:"pointer" }}>Отмена</button>
            <button onClick={submit} disabled={sending} style={{ flex:2, padding:"11px", borderRadius:10, background:sending?"#93c5fd":"linear-gradient(135deg,#1d4ed8,#1e3a8a)", border:"none", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 3px 10px rgba(29,78,216,0.3)" }}>
              {sending ? "Отправляем..." : "📤 Отправить запрос"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function SwapRequestsBlock() {
    const mySwaps   = swapRequests.filter(s => s.requester === user?.name);
    const forMe     = swapRequests.filter(s => s.targetUser === user?.name && s.status === "pending");
    const openSwaps = swapRequests.filter(s => !s.targetUser && s.status === "pending" && s.requester !== user?.name);
    const adminView = user?.isAdmin;
    const pending   = swapRequests.filter(s => s.status === "pending");

    if (!user) return null;

    const shLabel = (id) => { const s=SHIFTS.find(x=>x.id===id); return s?`${s.emoji} ${s.short}`:"?"; };
    const dayFmt  = (k) => { const d=curDays.find(x=>x.key===k)||nextDays.find(x=>x.key===k); return d?`${d.label} ${d.date}`:k; };

    const StatusBadge = ({status}) => {
      const map = { pending:{bg:"#fef9c3",color:"#854d0e",txt:"⏳ Ожидает"}, accepted:{bg:"#f0fdf4",color:"#166534",txt:"✅ Принят"}, rejected:{bg:"#fef2f2",color:"#991b1b",txt:"❌ Отклонён"}, manager_approved:{bg:"#eff6ff",color:"#1e3a8a",txt:"👑 Одобрен"} };
      const s = map[status]||{bg:"#f1f5f9",color:"#64748b",txt:status};
      return <span style={{ background:s.bg, color:s.color, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{s.txt}</span>;
    };

    const SwapCard = ({swap, showActions}) => (
      <div style={{ padding:14, borderRadius:12, background:"#fefce8", border:"1px solid #fde047", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6, flexWrap:"wrap", gap:6 }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#1e293b" }}>
            {swap.requester.split(" ")[0]} → {shLabel(swap.fromShift)} {swap.toShift ? `→ ${shLabel(swap.toShift)}` : "→ любую"} · {dayFmt(swap.dayKey)}
          </div>
          <StatusBadge status={swap.status} />
        </div>
        {swap.targetUser && <div style={{ fontSize:11, color:"#64748b", marginBottom:4 }}>Предложено: {swap.targetUser.split(" ")[0]}</div>}
        {swap.message && <div style={{ fontSize:12, color:"#78716c", fontStyle:"italic", marginBottom:8 }}>"{swap.message}"</div>}
        {showActions && swap.status === "pending" && (
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:8 }}>
            {(user?.name === swap.targetUser || (!swap.targetUser && !user?.isAdmin)) && (
              <button onClick={()=>handleSwapAction(swap.id,"accept")} style={{ padding:"7px 14px", background:"#16a34a", color:"white", borderRadius:8, fontSize:12, fontWeight:700, border:"none", cursor:"pointer" }}>✓ Принять</button>
            )}
            {user?.isAdmin && (
              <button onClick={()=>handleSwapAction(swap.id,"approve")} style={{ padding:"7px 14px", background:"#1d4ed8", color:"white", borderRadius:8, fontSize:12, fontWeight:700, border:"none", cursor:"pointer" }}>👑 Одобрить</button>
            )}
            {(user?.name === swap.requester || user?.isAdmin) && (
              <button onClick={()=>cancelSwap(swap.id)} style={{ padding:"7px 14px", background:"#f1f5f9", color:"#64748b", borderRadius:8, fontSize:12, fontWeight:700, border:"none", cursor:"pointer" }}>✕ Отменить</button>
            )}
            {(user?.name === swap.targetUser) && (
              <button onClick={()=>handleSwapAction(swap.id,"reject")} style={{ padding:"7px 14px", background:"#fef2f2", color:"#dc2626", borderRadius:8, fontSize:12, fontWeight:700, border:"1px solid #fecaca", cursor:"pointer" }}>✗ Отклонить</button>
            )}
          </div>
        )}
      </div>
    );

    const sections = adminView
      ? [{ title:"Все запросы", items: pending, show: true }]
      : [
          { title:"Мои запросы", items: mySwaps.filter(s=>s.status==="pending"), show: mySwaps.filter(s=>s.status==="pending").length > 0 },
          { title:"Запросы ко мне", items: forMe, show: forMe.length > 0 },
          { title:"Открытые запросы", items: openSwaps, show: openSwaps.length > 0 },
        ];

    const hasAnything = sections.some(s=>s.show) || (!adminView && mySwaps.filter(s=>s.status!=="pending").length > 0);

    return (
      <div style={{ marginBottom:28, background:"white", borderRadius:16, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.06),0 4px 16px rgba(29,78,216,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          <span style={{ fontSize:20 }}>🔄</span>
          <h3 style={{ fontWeight:800, color:"#1e3a8a", fontSize:16 }}>Обмен сменами</h3>
          {pending.length > 0 && <span style={{ background:"#fef9c3", color:"#854d0e", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>{pending.length} активных</span>}
        </div>
        {!hasAnything && <div style={{ color:"#94a3b8", fontSize:13, textAlign:"center", padding:"8px 0" }}>Нет активных запросов на обмен</div>}
        {sections.map(sec => sec.show && (
          <div key={sec.title} style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 }}>{sec.title}</div>
            {sec.items.map(swap => <SwapCard key={swap.id} swap={swap} showActions={true} />)}
          </div>
        ))}
        {!adminView && mySwaps.filter(s=>s.status!=="pending").length > 0 && (
          <details style={{ marginTop:8 }}>
            <summary style={{ fontSize:12, color:"#94a3b8", cursor:"pointer", fontWeight:600 }}>История запросов ({mySwaps.filter(s=>s.status!=="pending").length})</summary>
            <div style={{ marginTop:8 }}>
              {mySwaps.filter(s=>s.status!=="pending").map(swap => <SwapCard key={swap.id} swap={swap} showActions={false} />)}
            </div>
          </details>
        )}
      </div>
    );
  }

  function AnnouncementsBlock() {
    return (
      <div style={{ marginBottom:28, background:"white", borderRadius:16, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.06),0 4px 16px rgba(29,78,216,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
          <span style={{ fontSize:20 }}>📢</span>
          <h3 style={{ fontWeight:800, color:"#1e3a8a", fontSize:16 }}>Объявления</h3>
        </div>
        {user?.isAdmin && (
          <div style={{ display:"flex", gap:8, marginBottom:20 }}>
            <input value={newAnnMsg} onChange={e=>setNewAnnMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&postAnnouncement()}
              placeholder="Напишите важное сообщение для команды..."
              style={{ flex:1, padding:"10px 14px", background:"#f8fafc", border:"2px solid #e2e8f0", borderRadius:10, fontSize:13, fontFamily:"inherit", outline:"none" }} />
            <button onClick={postAnnouncement} style={{ padding:"10px 20px", background:"linear-gradient(135deg,#1d4ed8,#1e3a8a)", color:"white", borderRadius:10, fontWeight:700, fontSize:13, border:"none", cursor:"pointer", whiteSpace:"nowrap" }}>
              📤 Отправить
            </button>
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {announcements.length===0 && (
            <div style={{ color:"#94a3b8", fontSize:13, textAlign:"center", padding:"12px 0" }}>Пока нет объявлений</div>
          )}
          {announcements.map(ann => (
            <div key={ann.id} style={{ padding:12, borderRadius:10, background:"#f0fdf4", border:"1px solid #bbf7d0", position:"relative" }}>
              <div style={{ fontSize:13, color:"#166534", lineHeight:1.6, whiteSpace:"pre-wrap", paddingRight: user?.isAdmin ? 24 : 0 }}>{ann.text}</div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, fontSize:10, color:"#16a34a", fontWeight:600 }}>
                <span>от {ann.author?.split(" ")[0]}</span>
                <span>{new Date(ann.createdAt).toLocaleString("ru-RU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}</span>
              </div>
              {user?.isAdmin && (
                <button onClick={()=>deleteAnnouncement(ann.id)} style={{ position:"absolute", top:8, right:8, background:"none", border:"none", color:"#86efac", fontSize:14, cursor:"pointer", lineHeight:1 }} title="Удалить">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function EditModal() {
    if (!editModal) return null;
    const { memberName, weekKey, dayKey, dayLabel, currentShift, assignShift } = editModal;
    const weekLabel2 = weekKey === curKey ? "Текущая неделя" : "Следующая неделя";

    // If assignShift mode — pick a member to assign
    if (!memberName) {
      const alreadyInShift = sched => {
        const s = weekKey === curKey ? curSched : nextSched;
        return (s[dayKey]?.[assignShift] || []);
      };
      const taken = (weekKey === curKey ? curSched : nextSched)[dayKey]?.[assignShift] || [];
      const available = TEAM.filter(m => {
        const memberShift = ((requests[m.name]||{})[weekKey]||{})[dayKey];
        return !memberShift; // not assigned anywhere this day
      });
      return (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setEditModal(null)}>
          <div style={{ background:"white", borderRadius:16, padding:24, maxWidth:360, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontWeight:800, fontSize:16, color:"#1e3a8a", marginBottom:4 }}>Назначить на смену</div>
            <div style={{ fontSize:12, color:"#64748b", marginBottom:16 }}>{dayLabel} · {weekLabel2} · {SHIFTS.find(s=>s.id===assignShift)?.emoji} {SHIFTS.find(s=>s.id===assignShift)?.label}</div>
            {available.length === 0 ? (
              <div style={{ color:"#94a3b8", fontSize:13, textAlign:"center", padding:"16px 0" }}>Все сотрудники уже заняты в этот день</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {available.map(m => (
                  <button key={m.name} onClick={()=>managerEditShift(m.name, weekKey, dayKey, assignShift)}
                    style={{ padding:"10px 14px", borderRadius:10, background:"#f8fafc", border:"1px solid #e2e8f0", color:"#1e293b", fontSize:13, fontWeight:600, cursor:"pointer", textAlign:"left" }}>
                    👤 {m.name}
                  </button>
                ))}
              </div>
            )}
            <button onClick={()=>setEditModal(null)} style={{ marginTop:16, width:"100%", padding:"10px", borderRadius:10, background:"#f1f5f9", border:"none", color:"#64748b", fontSize:13, fontWeight:600, cursor:"pointer" }}>Отмена</button>
          </div>
        </div>
      );
    }

    // Edit existing member's shift
    const sh = SHIFTS.find(s=>s.id===currentShift);
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={()=>setEditModal(null)}>
        <div style={{ background:"white", borderRadius:16, padding:24, maxWidth:380, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }} onClick={e=>e.stopPropagation()}>
          <div style={{ fontWeight:800, fontSize:16, color:"#1e3a8a", marginBottom:4 }}>Изменить смену</div>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:2 }}>{memberName} · {dayLabel}</div>
          <div style={{ fontSize:12, color:"#64748b", marginBottom:16 }}>{weekLabel2}</div>
          <div style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, color:"#94a3b8" }}>Текущая смена:</span>
            <span style={{ background:sh?.bg, border:`1px solid ${sh?.border}`, color:sh?.textDark, borderRadius:6, padding:"2px 10px", fontSize:12, fontWeight:700 }}>{sh?.emoji} {sh?.label}</span>
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>Изменить на:</div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {SHIFTS.filter(s=>s.id!==currentShift).map(shift => (
              <button key={shift.id} onClick={()=>managerEditShift(memberName, weekKey, dayKey, shift.id)}
                style={{ padding:"10px 14px", borderRadius:10, background:shift.bg, border:`1px solid ${shift.border}`, color:shift.textDark, fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:8 }}>
                {shift.emoji} {shift.label}
              </button>
            ))}
            <button onClick={()=>managerEditShift(memberName, weekKey, dayKey, null)}
              style={{ padding:"10px 14px", borderRadius:10, background:"#fef2f2", border:"1px solid #fecaca", color:"#dc2626", fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"left" }}>
              🏖 Убрать смену (выходной)
            </button>
          </div>
          <button onClick={()=>setEditModal(null)} style={{ marginTop:12, width:"100%", padding:"10px", borderRadius:10, background:"#f1f5f9", border:"none", color:"#64748b", fontSize:13, fontWeight:600, cursor:"pointer" }}>Отмена</button>
        </div>
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
      <EditModal />
      <SwapModal />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#e2e8f0} ::-webkit-scrollbar-thumb{background:#93c5fd;border-radius:4px}
        input{outline:none;font-family:inherit} button{cursor:pointer;font-family:inherit;border:none}
        .fade{animation:fadeUp .25s ease both} @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* HEADER */}
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
              {user.isAdmin ? "👑" : "👤"} <span style={{ color: user.isAdmin ? "white" : nameColor(user.name) }}>{user.name}</span>
            </div>
            {!user.isAdmin && (
              <button onClick={()=>setShowProfile(v=>!v)} style={{ background: showProfile ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:600, cursor:"pointer" }}>🎨 Цвет</button>
            )}
            {!user.isAdmin && (
              <button onClick={() => setPage(page==="schedule"?"pick":"schedule")} style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", color:"white", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                {page==="schedule" ? "✏️ Мои смены" : "📋 Расписание"}
              </button>
            )}
            <button onClick={logout} style={{ background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.3)", color:"#fca5a5", borderRadius:8, padding:"6px 13px", fontSize:12, fontWeight:600, cursor:"pointer" }}>Выйти</button>
          </>}
        </div>
      </header>

      <main style={{ maxWidth:920, margin:"0 auto", padding:"32px 20px 60px" }}>

        {user && !user.isAdmin && showProfile && <ProfileSettings />}
        {user && <AnnouncementsBlock />}
        {user && <SwapRequestsBlock />}

        {/* LOGIN */}
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

        {/* SHIFT PICKER */}
        {page==="pick" && user && !user.isAdmin && (
          <div className="fade">
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"#1e3a8a", marginBottom:4 }}>Привет, {user.name.split(" ")[0]}! 👋</h2>
              <p style={{ color:"#64748b", fontSize:14 }}>Выбери смены на текущую и следующую неделю</p>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:12 }}>
                {SHIFTS.map(s => <span key={s.id} style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, background:s.bg, border:`1px solid ${s.border}`, color:s.textDark, fontSize:11, fontWeight:600 }}>{s.emoji} {s.label}</span>)}
                <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, background:"#f8fafc", border:"1px solid #e2e8f0", color:"#64748b", fontSize:11, fontWeight:600 }}>
                  🟡 = 1 чел, 🔴✕ = заполнено (2/2)
                </span>
              </div>
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
                3. Нажми <strong>💾 Подать заявку</strong> — отдельно для каждой недели<br/>
                4. Можно вернуться и изменить смену в любой момент до закрытия<br/><br/>
                <strong>⚠️ Важно:</strong> если хочешь поменять уже поданную смену — обязательно напиши об этом в телеграм чате и договорись с другим сотрудником об обмене.
              </div>
            </div>

            <WeekPicker days={curDays}  weekKey={curKey}  label="Текущая неделя" />
            <div style={{ height:1, background:"#e2e8f0", margin:"8px 0 32px" }} />
            <WeekPicker days={nextDays} weekKey={nextKey} label="Следующая неделя" />
          </div>
        )}

        {/* SCHEDULE */}
        {page==="schedule" && (
          <div className="fade">
            <div style={{ marginBottom:28 }}>
              <h2 style={{ fontSize:22, fontWeight:800, color:"#1e3a8a", marginBottom:4 }}>📋 Сводное расписание</h2>
              <p style={{ color:"#64748b", fontSize:14 }}>Текущая и следующая неделя</p>
            </div>
            <WeekSchedule days={curDays}  weekKey={curKey}  sched={curSched}  warnings={curSchedW}  label="Текущая неделя" />
            <div style={{ height:1, background:"#e2e8f0", margin:"0 0 32px" }} />
            <WeekSchedule days={nextDays} weekKey={nextKey} sched={nextSched} warnings={nextSchedW} label="Следующая неделя" />
          </div>
        )}
      </main>
    </div>
  );
}

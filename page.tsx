'use client';
import { useState } from 'react';
import { CalendarDays, Map, Users, User, Home, MapPin, Mountain, Clock, Footprints, ChevronRight } from 'lucide-react';
const sessions=[
 {day:'JUE 24',title:'Training !!!',time:'19:00',place:'Punto de reunión · Trailhead',km:'8.4 km',gain:'+420 m',level:'Intermedio'},
 {day:'SÁB 26',title:'Fondo Bestia',time:'06:30',place:'Bosque · Acceso norte',km:'16.2 km',gain:'+910 m',level:'Avanzado'},
 {day:'MAR 29',title:'Cuestas + técnica',time:'19:30',place:'Circuito local',km:'6.5 km',gain:'+330 m',level:'Todos'}
];
function Nav({tab,setTab}:{tab:string,setTab:(x:string)=>void}){const items=[['Inicio',Home],['Agenda',CalendarDays],['Rutas',Map],['Team',Users],['Perfil',User]] as const;return <nav>{items.map(([n,I])=><button key={n} onClick={()=>setTab(n)} className={tab===n?'active':''}><I size={20}/><span>{n}</span></button>)}</nav>}
export default function Page(){const [tab,setTab]=useState('Inicio'); const [going,setGoing]=useState(false);return <main><header><div className="mark"><Mountain/></div><div><small>TRAIL RUNNING TEAM</small><h1>Bestias de montaña</h1><p>#MountainBeastsTeam</p></div></header>
{tab==='Inicio'&&<><section className="hero"><span className="eyebrow">PRÓXIMO ENTRENAMIENTO</span><h2>Training !!!</h2><div className="date">Jueves 24 · 19:00</div><div className="chips"><span><Footprints/>8.4 km</span><span><Mountain/>+420 m</span><span><Clock/>90 min</span></div><p className="location"><MapPin/> Trailhead · punto de reunión</p><button className="primary" onClick={()=>setGoing(!going)}>{going?'✓ Voy con la manada':'Voy 🐾'}</button><button className="secondary">Ver entrenamiento <ChevronRight size={18}/></button></section><h3>La semana de las Bestias</h3><div className="stack">{sessions.map(s=><article key={s.day}><b>{s.day}</b><div><h4>{s.title}</h4><p>{s.time} · {s.place}</p><small>{s.km} · {s.gain} · {s.level}</small></div><ChevronRight/></article>)}</div></>}
{tab==='Agenda'&&<><h2 className="pageTitle">Agenda</h2><p className="muted">Entrenamientos programados para la manada.</p><div className="stack">{sessions.map(s=><article key={s.day}><b>{s.day}</b><div><h4>{s.title}</h4><p>{s.time} · {s.place}</p><small>{s.km} · {s.gain} · {s.level}</small></div></article>)}</div></>}
{tab==='Rutas'&&<Empty icon={<Map size={40}/>} title="Territorio Bestia" text="Aquí vivirá la biblioteca de rutas GPX, mapas, distancia y perfil de elevación."/>}
{tab==='Team'&&<Empty icon={<Users size={40}/>} title="El team" text="Miembros, entrenadores y asistencia a cada salida."/>}
{tab==='Perfil'&&<Empty icon={<User size={40}/>} title="Tu perfil" text="Tus próximas salidas, rutas y actividad dentro del equipo."/>}
<Nav tab={tab} setTab={setTab}/></main>}
function Empty({icon,title,text}:{icon:React.ReactNode,title:string,text:string}){return <section className="empty">{icon}<h2>{title}</h2><p>{text}</p><span>Próximamente</span></section>}

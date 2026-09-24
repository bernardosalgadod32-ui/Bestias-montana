'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Mountain, CalendarDays, Map, Camera, Users } from 'lucide-react';

const KEY = 'bestias:welcome:v1';
const GuideContext = createContext<() => void>(() => {});
export const useWelcomeGuide = () => useContext(GuideContext);
const steps = [
 { Icon: Mountain, title: 'Bienvenido a la manada', text: 'Tu próxima aventura empieza aquí. Bestias de la Montaña reúne entrenamientos, rutas y recuerdos de tu equipo.', tip: 'Crea tu cuenta o inicia sesión. Después, usa el código de invitación de tu administrador para unirte al equipo.' },
 { Icon: CalendarDays, title: 'Encuentra tu próximo entreno', text: 'En Inicio encontrarás la próxima salida. En Agenda puedes consultar todos los entrenamientos, incluidos los anteriores.', tip: 'Abre un entrenamiento para revisar horario, dificultad, distancia, desnivel, punto de reunión y equipo recomendado. Pulsa «Voy» para confirmar tu asistencia; puedes cancelarla desde el mismo botón.' },
 { Icon: Map, title: 'Conoce la ruta', text: 'Rutas reúne los entrenamientos con un archivo GPX. En el detalle podrás ver el trazado sobre el mapa.', tip: 'Pulsa «Descargar GPX» para llevar el archivo a tu aplicación de navegación favorita. Necesitas conexión para consultar los datos de esta app.' },
 { Icon: Camera, title: 'Comparte los recuerdos', text: 'Cada entrenamiento tiene su propio álbum. Abre «Fotos del entreno» para subir fotos desde tu teléfono o computadora.', tip: 'Todo el equipo puede descargar las fotos. «Compartir» abre las opciones disponibles en tu dispositivo; si no es compatible, descarga la foto y publícala desde tu red social.' },
 { Icon: Users, title: 'Tu equipo, siempre a mano', text: 'En Team encontrarás a la manada. En Perfil puedes cambiar tu nombre y volver a abrir esta guía cuando quieras.', tip: 'Los coaches crean entrenamientos y rutas. Los administradores también gestionan invitaciones y miembros. Para tener la app a mano, busca «Instalar app» o «Agregar a pantalla de inicio» en el menú de tu navegador, si está disponible.' },
];
export default function WelcomeGuide({ children, autoShow = true }: { children: React.ReactNode; autoShow?: boolean }) {
 const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
 const [open, setOpen] = useState(false), [step, setStep] = useState(0);
 useEffect(() => { if (!autoShow) return; try { if (!localStorage.getItem(KEY)) setOpen(true); } catch { setOpen(true); } }, [autoShow]);
 useEffect(() => { if (open) { if (!dialog.current?.open) dialog.current?.showModal(); heading.current?.focus(); } else dialog.current?.close(); }, [open, step]);
 function finish() { try { localStorage.setItem(KEY, 'seen'); } catch { /* The guide remains usable when browser storage is disabled. */ } setOpen(false); }
 const current = steps[step], Icon = current.Icon;
 return <GuideContext.Provider value={() => { setStep(0); setOpen(true); }}>{children}
  <dialog ref={dialog} className="welcome-dialog" aria-labelledby="welcome-title" aria-describedby="welcome-text" onCancel={e => { e.preventDefault(); finish(); }}>
   <div className="welcome-top"><span>BESTIAS DE LA MONTAÑA</span><button className="back" onClick={finish}>Omitir guía</button></div>
   <div className="welcome-icon"><Icon size={48} /></div><p className="eyebrow">TU PRIMERA AVENTURA · {step + 1} / {steps.length}</p>
   <h2 id="welcome-title" ref={heading} tabIndex={-1}>{current.title}</h2><p id="welcome-text">{current.text}</p><p className="welcome-tip">{current.tip}</p>
   <div className="welcome-dots" aria-label={`Paso ${step + 1} de ${steps.length}`}>{steps.map((_, index) => <span key={index} className={index === step ? 'current' : ''} />)}</div>
   <div className="welcome-actions"><button className="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Atrás</button><button className="primary" onClick={() => step === steps.length - 1 ? finish() : setStep(step + 1)}>{step === steps.length - 1 ? '¡Vamos, Bestia!' : 'Siguiente'}</button></div>
  </dialog>
 </GuideContext.Provider>;
}

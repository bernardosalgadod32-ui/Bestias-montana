import type {Metadata,Viewport} from 'next';import './globals.css';import './multiuser.css';import './photos-welcome.css';
export const metadata:Metadata={title:'Bestias de montaña',description:'Entrenamientos, rutas GPX y comunidad.',manifest:'/manifest.webmanifest'};
export const viewport:Viewport={themeColor:'#090909',width:'device-width',initialScale:1};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body><div style={{maxWidth:520,margin:'0 auto',padding:'8px 18px 0',textAlign:'right',color:'#999',fontSize:11,letterSpacing:'.08em'}}>by berniesd</div>{children}</body></html>}


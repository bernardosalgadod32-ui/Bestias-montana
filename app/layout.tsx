import type {Metadata,Viewport} from 'next';import './globals.css';
export const metadata:Metadata={title:'Bestias de montaña',description:'Entrenamientos, rutas GPX y comunidad.',manifest:'/manifest.webmanifest'};
export const viewport:Viewport={themeColor:'#090909',width:'device-width',initialScale:1};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
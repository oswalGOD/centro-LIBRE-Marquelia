// Proyecto de Supabase para sincronizar dispositivos.
// La clave "anon" es pública por diseño: sin la cuenta del Centro no da acceso a ningún dato
// (ver supabase/esquema.sql). Nunca pongas aquí la clave "service_role".

export const SUPABASE_URL = "https://rukmlbjtahrsnjvysuru.supabase.co";
// Contraseña de la sección Ajustes → Desarrollo, guardada como huella (PBKDF2), nunca en texto.
// Para ponerla o cambiarla: entra a #/desarrollo, usa «Generar huella» y pega aquí la línea que te da.
// Mientras sea null, la sección no se puede abrir.
export const CLAVE_DESARROLLO = null;

export const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1a21sYmp0YWhyc25qdnlzdXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjcxNjMsImV4cCI6MjEwODY0MzE2M30.fH17CciimzVwzqxW0SXTE_urVk2goBrscBw7Gumu_pM";

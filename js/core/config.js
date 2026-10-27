// Proyecto de Supabase para sincronizar dispositivos.
// La clave "anon" es pública por diseño: sin la cuenta del Centro no da acceso a ningún dato
// (ver supabase/esquema.sql). Nunca pongas aquí la clave "service_role".

export const SUPABASE_URL = "https://rukmlbjtahrsnjvysuru.supabase.co";
// Contraseña de la sección Ajustes → Desarrollo, guardada como huella (PBKDF2), nunca en texto.
// Para ponerla o cambiarla: entra a #/desarrollo, usa «Generar huella» y pega aquí la línea que te da.
export const CLAVE_DESARROLLO = {"sal":"abe6c22e-ddb2-48b1-b15c-3fcd612ce8f2","huella":"efaafced0f4635ef79588a5cb9ddd8eb879632edd1a8ac603f2b6cf1de4ca5db","iteraciones":600000};

export const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1a21sYmp0YWhyc25qdnlzdXJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjcxNjMsImV4cCI6MjEwODY0MzE2M30.fH17CciimzVwzqxW0SXTE_urVk2goBrscBw7Gumu_pM";

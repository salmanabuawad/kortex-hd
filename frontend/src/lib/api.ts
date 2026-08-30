const API = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
export const getToken=()=>localStorage.getItem('helpdesk_token');
export const setToken=(v:string|null)=>v?localStorage.setItem('helpdesk_token',v):localStorage.removeItem('helpdesk_token');
export async function api<T>(path:string, init:RequestInit={}):Promise<T>{
  const headers=new Headers(init.headers); headers.set('Content-Type','application/json'); const token=getToken(); if(token) headers.set('Authorization',`Bearer ${token}`);
  const res=await fetch(`${API}${path}`,{...init,headers}); if(!res.ok){const text=await res.text(); throw new Error(text||`HTTP ${res.status}`)} return res.json();
}
export const statusLabel:Record<string,string>={new:'חדש',assigned:'הוקצה',viewed:'נצפה',in_progress:'בטיפול',resolved:'נפתר',rejected:'נדחה',reopened:'נפתח מחדש'};

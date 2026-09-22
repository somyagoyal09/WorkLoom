import { apiRequest } from './api.js';
const SESSION_KEY = 'workloom_auth_v2';
export async function login(phone, password, role, workshopCode='') { const result = await apiRequest('/auth/login', { method:'POST', body:JSON.stringify({ phone, password, role, ...(role==='karigar' ? { workshop_code: workshopCode } : {}) }) }); localStorage.setItem(SESSION_KEY, JSON.stringify(result)); return result; }
export async function registerOwner(name, workshop, phone, password) { const result = await apiRequest('/auth/register-owner', { method:'POST', body:JSON.stringify({ name, workshop, phone, password }) }); localStorage.setItem(SESSION_KEY, JSON.stringify(result)); return result; }
export function getSession(){ try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null} }
export async function validateSession(session=getSession()){ if(!session?.access_token)return null; try{const user=await apiRequest('/auth/me'); if(!user?.workshop_id)throw new Error(); return {...session,user}}catch{clearSession();return null} }
export function getToken(){return getSession()?.access_token||''}
export function clearSession(){localStorage.removeItem(SESSION_KEY)}

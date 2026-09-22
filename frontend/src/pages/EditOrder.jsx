import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { fetchOrder, updateOrder, toUiOrder } from '../services/ordersApi.js';
import { fetchTeam } from '../services/teamApi.js';
import { itemTypes, metalTypes, stoneOptions, ORDER_STAGES } from '../constants';

export default function EditOrder({ user, onLogout }) {
 const {orderId}=useParams(), nav=useNavigate(); const [f,setF]=useState(null); const [team,setTeam]=useState([]); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
 useEffect(()=>{Promise.all([fetchOrder(orderId),fetchTeam()]).then(([o,t])=>{const x=toUiOrder(o);setF({customer_name:x.customer,phone:x.phone,item:x.item,material:x.metal,weight:x.weight,stones:x.stones,karigar:x.karigar,karigar_user_id:x.karigar_user_id || x.karigarUserId || '',priority:x.priority,due_date:x.dueDate,advance:x.advance,estimate_value:x.estimateValue,notes:x.notes,design_image_url:x.designImageUrl,design_reference_url:x.designReferenceUrl,design_source:x.design_source});setTeam(t.filter(m=>m.is_active!==false));}).catch(e=>setError(e.message||'Could not load order.'));},[orderId]);
 function change(k,v){setF(x=>({...x,[k]:v}))}
 async function save(e){e.preventDefault();setBusy(true);setError('');try{await updateOrder(orderId,f);nav(`/owner/orders/${orderId}`)}catch(e){setError(e.message||'Could not save changes.')}finally{setBusy(false)}}
 return <DashboardLayout role="owner" user={user} onLogout={onLogout} title="Edit order" subtitle={orderId}>
 {error&&<div className="alert alert-danger">{error}</div>}{!f?<div className="wl-card p-5 text-center text-secondary">Loading…</div>:<form onSubmit={save}><div className="wl-card p-3 p-md-4"><div className="row g-3">
 {field('Customer name','customer_name',f.customer_name,change,'text',true)}{field('Phone','phone',f.phone,change,'tel')}
 <div className="col-md-6"><label className="form-label small">Item</label><select className="form-select" value={f.item} onChange={e=>change('item',e.target.value)}>{itemTypes.map(x=><option key={x}>{x}</option>)}</select></div>
 <div className="col-md-6"><label className="form-label small">Material / purity</label><select className="form-select" value={f.material} onChange={e=>change('material',e.target.value)}>{metalTypes.map(x=><option key={x}>{x}</option>)}</select></div>
 {field('Weight','weight',f.weight,change,'text',true)}{field('Due date','due_date',f.due_date,change,'date',true)}
 <div className="col-md-6"><label className="form-label small">Stones</label><select className="form-select" value={f.stones||''} onChange={e=>change('stones',e.target.value)}>{stoneOptions.map(x=><option key={x}>{x}</option>)}</select></div>
 <div className="col-md-6"><label className="form-label small">Karigar</label><select className="form-select" value={f.karigar_user_id || ""} onChange={e=>{const member=team.find(x=>x.user_id===e.target.value);change("karigar_user_id",e.target.value);change("karigar",member?.name||"")}}>{team.map(x=><option key={x.user_id} value={x.user_id}>{x.name} — {x.specialty}</option>)}</select></div>
 <div className="col-md-4"><label className="form-label small">Priority</label><select className="form-select" value={f.priority} onChange={e=>change('priority',e.target.value)}><option>High</option><option>Medium</option><option>Low</option></select></div>
 {field('Estimate (owner confirmed)','estimate_value',f.estimate_value,change,'number')}{field('Advance','advance',f.advance,change,'number')}
 <div className="col-12"><label className="form-label small">Notes</label><textarea className="form-control" rows="4" value={f.notes||''} onChange={e=>change('notes',e.target.value)}/></div>
 </div><div className="d-flex justify-content-end gap-2 mt-4"><button type="button" className="btn btn-outline-secondary" onClick={()=>nav(`/owner/orders/${orderId}`)}>Cancel</button><button className="btn btn-wl-gold" disabled={busy}>{busy?'Saving…':'Save changes'}</button></div></div></form>}</DashboardLayout>
}
function field(label,key,val,change,type='text',req=false){return <div className="col-md-6"><label className="form-label small">{label}</label><input className="form-control" type={type} value={val??''} required={req} onChange={e=>change(key,type==='number'?Number(e.target.value):e.target.value)}/></div>}

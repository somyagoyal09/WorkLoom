import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '../components/DashboardLayout.jsx';
import { addKarigar, deactivateKarigar, fetchTeam } from '../services/teamApi.js';
import { apiRequest } from '../services/api.js';

const EMPTY = { name: '', phone: '', specialty: '', password: '' };
const SPECIALTIES = [
  'Ring Designer',
  'Casting',
  'Filing',
  'Polishing',
  'Setting',
  'Stone Setting',
  'Engraving',
  'Wax / Model Making',
  'Repair',
  'General Jewellery Work',
];

export default function WorkshopTeam({ user, onLogout }) {
  const [team, setTeam] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [workshopCode, setWorkshopCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [customSpecialty, setCustomSpecialty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setTeam(await fetchTeam()); } catch (err) { setError(err.message || 'Could not load workshop team.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); apiRequest('/team/workshop').then((r) => setWorkshopCode(r.code || '')).catch(() => {}); }, [load]);

  function change(e) { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); }

  async function submit(e) {
    e.preventDefault(); setError(''); setSuccess(''); setSaving(true);
    try {
      const member = await addKarigar(form);
      setTeam((prev) => [...prev, member].sort((a,b) => a.name.localeCompare(b.name)));
      setForm(EMPTY); setCustomSpecialty(false); setSuccess(`${member.name} was added to your workshop.`);
    } catch (err) { setError(err.message || 'Could not add karigar.'); }
    finally { setSaving(false); }
  }

  async function remove(member) {
    if (!window.confirm(`Deactivate ${member.name}? They will no longer appear for new assignments.`)) return;
    try {
      await deactivateKarigar(member.user_id);
      setTeam((prev) => prev.map((m) => m.user_id === member.user_id ? { ...m, is_active: false } : m));
    } catch (err) { setError(err.message || 'Could not deactivate karigar.'); }
  }

  const active = team.filter((m) => m.is_active !== false);

  return (
    <DashboardLayout role="owner" user={user} onLogout={onLogout} title="Workshop team" subtitle="Manage the people who build each job">
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      <div className="row g-3">
        <div className="col-lg-5">
          <div className="wl-card p-3 p-md-4">
            <div className="mb-3"><h2 className="wl-section-title h5 mb-1">Add a karigar</h2><div className="small text-secondary">They can use this phone number and PIN to sign into your workshop.</div></div><div className="alert alert-light border mb-3 d-flex align-items-center justify-content-between"><div><div className="small text-secondary">Workshop code</div><div className="fw-semibold">{workshopCode || 'Loading…'}</div></div>{workshopCode&&<button type="button" className="btn btn-sm btn-wl-outline border" onClick={async()=>{try{await navigator.clipboard.writeText(workshopCode);setCopied(true);window.setTimeout(()=>setCopied(false),1500);}catch{setError('Could not copy the workshop code.');}}}>{copied ? 'Copied' : 'Copy'}</button>}</div>
            <form onSubmit={submit}>
              <div className="mb-3"><label className="wl-form-label">Full name</label><input className="form-control" name="name" value={form.name} onChange={change} required /></div>
              <div className="mb-3"><label className="wl-form-label">Phone</label><input className="form-control" name="phone" value={form.phone} onChange={change} inputMode="tel" required /></div>
              <div className="mb-3">
                <label className="wl-form-label" htmlFor="karigar-specialty">Specialty</label>
                <select
                  id="karigar-specialty"
                  className="form-select"
                  value={customSpecialty ? '__custom__' : form.specialty}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomSpecialty(true);
                      setForm((f) => ({ ...f, specialty: '' }));
                    } else {
                      setCustomSpecialty(false);
                      setForm((f) => ({ ...f, specialty: e.target.value }));
                    }
                  }}
                  autoComplete="off"
                  required={!customSpecialty}
                >
                  <option value="">Select specialty</option>
                  {SPECIALTIES.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
                  <option value="__custom__">Other — enter manually</option>
                </select>
                {customSpecialty && (
                  <input
                    className="form-control mt-2"
                    name="specialty"
                    value={form.specialty}
                    onChange={change}
                    placeholder="e.g. Custom jewellery work"
                    autoComplete="off"
                    autoFocus
                    required
                  />
                )}
              </div>
              <div className="mb-3"><label className="wl-form-label">Login PIN</label><input className="form-control" type="password" name="password" value={form.password} onChange={change} minLength={6} required /></div>
              <button className="btn btn-wl-gold w-100" disabled={saving}>{saving ? 'Adding…' : 'Add to workshop'}</button>
            </form>
          </div>
        </div>
        <div className="col-lg-7">
          <div className="wl-card p-3 p-md-4">
            <div className="d-flex align-items-center justify-content-between mb-3"><div><h2 className="wl-section-title h5 mb-1">Your team</h2><div className="small text-secondary">{active.length} active member{active.length === 1 ? '' : 's'}</div></div><button className="btn btn-sm btn-wl-outline border" onClick={load}>Refresh</button></div>
            {loading ? <div className="text-secondary py-4 text-center">Loading team…</div> : team.length === 0 ? <div className="text-secondary py-5 text-center">No karigars yet. Add your first workshop member.</div> : (
              <div className="table-responsive"><table className="table wl-table mb-0"><thead><tr><th>Member</th><th>Specialty</th><th>Phone</th><th>Status</th><th></th></tr></thead><tbody>
                {team.map((m) => <tr key={m.user_id}><td><div className="fw-semibold">{m.name}</div><div className="small text-secondary">{m.user_id}</div></td><td>{m.specialty || 'General'}</td><td>{m.phone}</td><td><span className={`badge rounded-pill ${m.is_active === false ? 'text-bg-secondary' : 'text-bg-success'}`}>{m.is_active === false ? 'Inactive' : 'Active'}</span></td><td className="text-end">{m.is_active !== false && <button className="btn btn-sm btn-outline-danger" onClick={() => remove(m)}>Deactivate</button>}</td></tr>)}
              </tbody></table></div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

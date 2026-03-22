import { useState, useEffect } from 'react';
import api from '../../services/api';

export default function TrunksConfigPage() {
  const [trunks, setTrunks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupTrunkId, setTopupTrunkId] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    provider: 'telnyx',
    type: 'api_service',
    api_key: '',
    api_endpoint: '',
    username: '',
    password: '',
    host: '',
    port: 5060,
    caller_id_mode: 'passthrough',
    default_caller_id: '',
    max_channels: 30,
    is_active: true,
    is_default: false,
    config_json: {},
  });

  useEffect(() => {
    loadTrunks();
  }, []);

  const loadTrunks = async () => {
    try {
      const res = await api.get('/admin/trunks');
      setTrunks(Array.isArray(res.data) ? res.data : res.data.trunks || []);
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (name === 'port' || name === 'max_channels' ? parseInt(value) : value)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await api.put(`/admin/trunks/${editingId}`, formData);
      } else {
        await api.post('/admin/trunks', formData);
      }
      loadTrunks();
      resetForm();
    } catch (err) {
      alert('Erreur: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (trunk) => {
    setFormData(trunk);
    setEditingId(trunk.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Êtes-vous sûr?')) return;
    try {
      await api.delete(`/admin/trunks/${id}`);
      loadTrunks();
    } catch (err) {
      alert('Erreur: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleTest = async (id) => {
    setLoading(true);
    try {
      const res = await api.post(`/admin/trunks/${id}/test`);
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTopup = async (id) => {
    if (!topupAmount || topupAmount <= 0) {
      alert('Montant invalide');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post(`/admin/trunks/${id}/account-topup`, {
        amount: parseFloat(topupAmount),
        payment_method: 'manual'
      });
      alert(`Recharge effectuée: ${res.data.message}`);
      setTopupAmount('');
      setTopupTrunkId(null);
      loadTrunks();
    } catch (err) {
      alert('Erreur: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      provider: 'telnyx',
      type: 'api_service',
      api_key: '',
      api_endpoint: '',
      username: '',
      password: '',
      host: '',
      port: 5060,
      caller_id_mode: 'passthrough',
      default_caller_id: '',
      max_channels: 30,
      is_active: true,
      is_default: false,
      config_json: {},
    });
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <div className="page-container">
      <h2>Configuration des Trunks SIP</h2>
      
      <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
        {showForm ? 'Annuler' : '+ Nouveau Trunk'}
      </button>

      {showForm && (
        <div className="form-card">
          <h3>{editingId ? 'Modifier' : 'Ajouter'} Trunk SIP</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Nom du Trunk</label>
              <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
            </div>

            <div className="form-group">
              <label>Fournisseur</label>
              <select name="provider" value={formData.provider} onChange={handleInputChange}>
                <option value="telnyx">Telnyx</option>
                <option value="voip.ms">VoIP.ms</option>
                <option value="generic">Générique SIP</option>
              </select>
            </div>

            {formData.provider === 'telnyx' && (
              <>
                <div className="form-group">
                  <label>API Key Telnyx</label>
                  <input type="password" name="api_key" value={formData.api_key} onChange={handleInputChange} placeholder="Bearer token" />
                </div>
                <div className="form-group">
                  <label>Connection ID</label>
                  <input type="text" name="config_json" value={formData.config_json?.connection_id || ''} onChange={(e) => setFormData(prev => ({
                    ...prev,
                    config_json: { ...prev.config_json, connection_id: e.target.value }
                  }))} placeholder="UUID de la connexion Telnyx" />
                </div>
              </>
            )}

            {formData.provider === 'voip.ms' && (
              <>
                <div className="form-group">
                  <label>Nom d'utilisateur VoIP.ms</label>
                  <input type="text" name="username" value={formData.username} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label>Mot de passe VoIP.ms</label>
                  <input type="password" name="password" value={formData.password} onChange={handleInputChange} />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Mode Caller ID</label>
              <select name="caller_id_mode" value={formData.caller_id_mode} onChange={handleInputChange}>
                <option value="trunk_default">Trunk par défaut</option>
                <option value="user_defined">Défini par l'utilisateur</option>
                <option value="passthrough">Passthrough (CLI)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Caller ID par défaut</label>
              <input type="tel" name="default_caller_id" value={formData.default_caller_id} onChange={handleInputChange} placeholder="+33123456789" />
            </div>

            <div className="form-group">
              <label>Canaux max</label>
              <input type="number" name="max_channels" value={formData.max_channels} onChange={handleInputChange} />
            </div>

            <div className="form-group">
              <label>
                <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleInputChange} />
                Actif
              </label>
            </div>

            <div className="form-group">
              <label>
                <input type="checkbox" name="is_default" checked={formData.is_default} onChange={handleInputChange} />
                Par défaut
              </label>
            </div>

            <button type="submit" className="btn btn-success" disabled={loading}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        </div>
      )}

      <div className="trunks-list">
        {trunks.map(trunk => (
          <div key={trunk.id} className="trunk-card">
            <h4>{trunk.name}</h4>
            <p><strong>Fournisseur:</strong> {trunk.provider}</p>
            <p><strong>Statut:</strong> <span className={`badge badge-${trunk.status}`}>{trunk.status}</span></p>
            <p><strong>Caller ID Mode:</strong> {trunk.caller_id_mode}</p>
            <p><strong>Canaux:</strong> {trunk.max_channels}</p>
            {trunk.last_checked && <p><strong>Dernier test:</strong> {new Date(trunk.last_checked).toLocaleString()}</p>}

            <div className="trunk-actions">
              <button className="btn btn-small btn-info" onClick={() => handleTest(trunk.id)} disabled={loading}>
                Tester
              </button>
              <button className="btn btn-small btn-warning" onClick={() => handleEdit(trunk)}>
                Modifier
              </button>
              <button className="btn btn-small btn-danger" onClick={() => handleDelete(trunk.id)}>
                Supprimer
              </button>
              <button className="btn btn-small btn-success" onClick={() => setTopupTrunkId(trunk.id)}>
                Recharger
              </button>
            </div>

            {topupTrunkId === trunk.id && (
              <div className="topup-form">
                <input 
                  type="number" 
                  value={topupAmount} 
                  onChange={(e) => setTopupAmount(e.target.value)} 
                  placeholder="Montant (EUR)"
                  step="0.01"
                />
                <button className="btn btn-small btn-success" onClick={() => handleTopup(trunk.id)} disabled={loading}>
                  Recharger
                </button>
                <button className="btn btn-small btn-secondary" onClick={() => setTopupTrunkId(null)}>
                  Annuler
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {testResult && (
        <div className={`alert alert-${testResult.success ? 'success' : 'error'}`}>
          <strong>{testResult.success ? 'Test réussi' : 'Test échoué'}</strong>
          <p>{testResult.error || testResult.message || 'Statut: ' + testResult.status}</p>
          <button onClick={() => setTestResult(null)}>Fermer</button>
        </div>
      )}

      <style>{`
        .trunks-list { display: grid; gap: 16px; margin-top: 20px; }
        .trunk-card { border: 1px solid #ddd; padding: 16px; border-radius: 8px; background: #f9f9f9; }
        .trunk-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
        .btn-small { padding: 6px 12px; font-size: 12px; }
        .topup-form { display: flex; gap: 8px; margin-top: 12px; }
        .topup-form input { flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .badge-connected { background: #d4edda; color: #155724; }
        .badge-error { background: #f8d7da; color: #721c24; }
        .badge-unknown { background: #e2e3e5; color: #383d41; }
        .alert { padding: 12px; margin-top: 16px; border-radius: 4px; }
        .alert-success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
        .alert-error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
      `}</style>
    </div>
  );
}

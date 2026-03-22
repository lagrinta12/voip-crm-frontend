import { useState, useEffect } from 'react';
import api from '../../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ users: 0, clients: 0, calls: 0, agents_online: 0 });
  const [recentCalls, setRecentCalls] = useState([]);

  useEffect(() => {
    api.get('/admin/stats').then(res => setStats(res.data)).catch(() => {});
    api.get('/calls?limit=10').then(res => {
      const data = res.data;
      if (Array.isArray(data)) setRecentCalls(data);
      else if (data.calls) setRecentCalls(data.calls);
      else if (data.rows) setRecentCalls(data.rows);
      else setRecentCalls([]);
    }).catch(() => setRecentCalls([]));
  }, []);

  return (
    <div className="dashboard">
      <h1>Tableau de bord Admin</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.users}</div>
          <div className="stat-label">Utilisateurs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.clients}</div>
          <div className="stat-label">Clients</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.calls}</div>
          <div className="stat-label">Appels</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.agents_online}</div>
          <div className="stat-label">Agents en ligne</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Derniers appels</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Numero</th>
              <th>Direction</th>
              <th>Duree</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {recentCalls.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center' }}>Aucun appel</td></tr>
            ) : recentCalls.map(call => (
              <tr key={call.id}>
                <td>{new Date(call.createdAt || call.start_time).toLocaleString('fr-FR')}</td>
                <td>{call.called_number || '-'}</td>
                <td>{call.direction === 'inbound' ? 'Entrant' : 'Sortant'}</td>
                <td>{call.duration ? `${Math.floor(call.duration / 60)}m${call.duration % 60}s` : '-'}</td>
                <td><span className={`badge badge-${call.status}`}>{call.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

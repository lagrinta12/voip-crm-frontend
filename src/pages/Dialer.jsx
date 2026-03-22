import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../AuthContext';

export default function Dialer() {
  const { user, setUser } = useAuth();
  const [number, setNumber] = useState('');
  const [callActive, setCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [callerIds, setCallerIds] = useState([]);
  const [selectedCallerId, setSelectedCallerId] = useState('');
  const [showDTMF, setShowDTMF] = useState(false);
  const timerRef = useRef(null);
  const audioCtxRef = useRef(null);

  useEffect(() => {
    api.get('/calls/caller-ids').then(res => {
      const data = Array.isArray(res.data) ? res.data : res.data.callerIds || [];
      setCallerIds(data);
      if (data.length > 0) {
        const def = data.find(c => c.is_default);
        setSelectedCallerId(def ? def.phone_number : data[0].phone_number);
      }
    }).catch(() => {});

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const dialPad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
  ];

  // DTMF Frequencies (Hz)
  const dtmfFreqs = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  const playDTMFTone = (key) => {
    if (!dtmfFreqs[key]) return;
    
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const ctx = audioCtxRef.current;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.value = dtmfFreqs[key][0];
    osc2.frequency.value = dtmfFreqs[key][1];

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.5);
    osc2.stop(ctx.currentTime + 0.5);
  };

  const pressKey = (key) => {
    if (callActive) {
      // Envoi du DTMF au serveur
      api.post('/calls/dtmf', { digit: key }).catch(() => {});
      // Feedback sonore local
      playDTMFTone(key);
    } else {
      setNumber(prev => prev + key);
    }
  };

  const backspace = () => {
    setNumber(prev => prev.slice(0, -1));
  };

  const startCall = async () => {
    if (!number.trim()) return;
    try {
      setCallActive(true);
      setCallStatus('Appel en cours...');
      setCallDuration(0);
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      await api.post('/calls/dial', {
        number: number,
        caller_id: selectedCallerId,
      });
      setCallStatus('Connecte');
      setShowDTMF(true);
    } catch (err) {
      setCallStatus('Echec: ' + (err.response?.data?.error || 'Erreur'));
      setTimeout(endCall, 3000);
    }
  };

  const endCall = () => {
    setCallActive(false);
    setCallStatus('');
    setShowDTMF(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setCallDuration(0);
    // Refresh credits
    api.get('/auth/me').then(res => {
      setUser(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
    }).catch(() => {});
  };

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="dialer-page">
      <div className="dialer-card">
        <h2>Dialer</h2>
        <div className="dialer-credits">
          Credits: {parseFloat(user?.credits || 0).toFixed(2)} EUR
        </div>

        {callActive && (
          <div className="call-active-banner">
            <div className="call-status">{callStatus}</div>
            <div className="call-timer">{formatDuration(callDuration)}</div>
          </div>
        )}

        <div className="dialer-display">
          <input
            type="tel"
            value={number}
            readOnly={callActive}
            onChange={e => !callActive && setNumber(e.target.value)}
            placeholder="+33 1 23 45 67 89"
            className="dialer-input"
          />
          {!callActive && number && <button className="dialer-backspace" onClick={backspace}>&#x232B;</button>}
        </div>

        <div className="dial-pad">
          {dialPad.map((row, i) => (
            <div key={i} className="dial-row">
              {row.map(key => (
                <button key={key} className="dial-key" onClick={() => pressKey(key)}>
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>

        {!callActive && (
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Caller ID</label>
            <select value={selectedCallerId} onChange={e => setSelectedCallerId(e.target.value)}>
              {callerIds.length === 0 && <option value="">Aucun caller ID</option>}
              {callerIds.map(c => (
                <option key={c.id} value={c.phone_number}>{c.label || c.phone_number}</option>
              ))}
            </select>
          </div>
        )}

        <div className="dialer-actions">
          {!callActive ? (
            <button className="btn btn-call btn-success" onClick={startCall} disabled={!number.trim()}>
              Appeler
            </button>
          ) : (
            <button className="btn btn-call btn-danger" onClick={endCall}>
              Raccrocher
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

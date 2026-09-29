import { useState } from 'react';
import { IconBell, IconCheck } from './icons.jsx';
import { loadArmed, saveArmed } from '../utils/alerts.js';

export { loadArmed, saveArmed };

export default function AlertModal({ district, regionId, lang, t, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [done, setDone] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const map = loadArmed();
    map[`${regionId}::${district}`] = {
      name: name.trim(),
      contact: contact.trim(),
      armedAt: new Date().toISOString(),
    };
    saveArmed(map);
    setDone(true);
    onSaved(district);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-title">
          <span className="m-ic"><IconBell size={20} /></span>
          {t.alertModalTitle} — {district}
        </div>
        <div className="modal-sub">{t.alertModalSub}</div>
        {done ? (
          <div className="modal-done">
            <div className="done-icon"><IconCheck size={26} /></div>
            <div>{t.alertSaved}</div>
            <button className="arm-btn" onClick={onClose}>
              {lang === 'hi' ? 'ठीक है' : 'OK'}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="alert-form">
            <label>
              {t.nameLabel}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                placeholder={lang === 'hi' ? 'आपका नाम' : 'Your name'}
              />
            </label>
            <label>
              {t.contactLabel}
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                required
                maxLength={120}
                placeholder={lang === 'hi' ? 'मोबाइल / ईमेल' : 'Mobile / email'}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={onClose}>
                {t.cancel}
              </button>
              <button type="submit" className="arm-btn">
                {t.saveAlert}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

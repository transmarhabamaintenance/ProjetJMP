import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { UserDto, UserRole } from '../lib/api';
import { ApiError, api } from '../lib/client';

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('USER');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setUsers(await api.get<UserDto[]>('/api/auth/users'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Impossible de charger les comptes');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await action();
      setInfo(message);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Opération refusée');
    } finally {
      setBusy(false);
    }
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.post<UserDto>('/api/auth/users', { username, fullName, password, role });
      setUsername('');
      setFullName('');
      setPassword('');
      setRole('USER');
    }, `Compte « ${username} » créé`);
  };

  const changeRole = (user: UserDto) => {
    const next: UserRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
    void run(async () => {
      await api.put(`/api/auth/users/${user.id}`, { role: next });
    }, `Rôle de « ${user.username} » : ${next}`);
  };

  const resetPassword = (user: UserDto) => {
    const value = window.prompt(`Nouveau mot de passe pour « ${user.username} » (6 caractères minimum)`);
    if (!value) return;
    void run(async () => {
      await api.put(`/api/auth/users/${user.id}`, { password: value });
    }, `Mot de passe de « ${user.username} » changé`);
  };

  const remove = (user: UserDto) => {
    if (!window.confirm(`Supprimer le compte « ${user.username} » ?`)) return;
    void run(async () => {
      await api.del(`/api/auth/users/${user.id}`);
    }, `Compte « ${user.username} » supprimé`);
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {info && <div className="success">{info}</div>}

      <form className="card" onSubmit={create}>
        <h3>Créer un compte</h3>
        <div className="form-grid">
          <div className="field">
            <label>Identifiant</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Nom complet</label>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="field">
            <label>Mot de passe</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>Rôle</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="USER">Utilisateur — consulter et créer</option>
              <option value="ADMIN">Administrateur — tous droits</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || username.trim().length < 3 || password.length < 6}>
          Créer
        </button>
      </form>

      <div className="card">
        <h3>Comptes ({users.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Identifiant</th>
              <th>Nom</th>
              <th>Rôle</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.username}</td>
                <td>{user.fullName ?? '—'}</td>
                <td>
                  <span className={`badge${user.role === 'ADMIN' ? ' badge-blue' : ''}`}>
                    {user.role === 'ADMIN' ? 'Administrateur' : 'Utilisateur'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-small" type="button" disabled={busy || user.id === me?.id} onClick={() => changeRole(user)}>
                      {user.role === 'ADMIN' ? 'Rétrograder' : "Promouvoir admin"}
                    </button>
                    <button className="btn btn-small" type="button" disabled={busy} onClick={() => resetPassword(user)}>
                      Mot de passe
                    </button>
                    <button className="btn btn-small btn-danger" type="button" disabled={busy || user.id === me?.id} onClick={() => remove(user)}>
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          Un administrateur ne peut ni se rétrograder ni se supprimer tant qu'il est le seul admin actif.
        </p>
      </div>
    </div>
  );
}

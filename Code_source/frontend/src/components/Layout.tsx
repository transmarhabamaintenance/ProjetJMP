import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: '▦' },
  { to: '/plan', label: 'Plan des voyages', icon: '☰' },
  { to: '/planifier', label: 'Planifier un voyage', icon: '✚' },
  { to: '/carte', label: 'Carte', icon: '◉' },
  { to: '/import', label: 'Importer', icon: '⇪' },
  { to: '/stations', label: 'Stations', icon: '⚑' },
  { to: '/parametres', label: 'Paramètres', icon: '⚙' },
];

const ADMIN_NAV = [
  { to: '/utilisateurs', label: 'Utilisateurs', icon: '👤' },
  { to: '/securite', label: 'Sécurité', icon: '🛡️' },
];

const TITLES: Record<string, string> = {
  '/': 'Tableau de bord',
  '/plan': 'Plan des voyages',
  '/planifier': 'Planifier un voyage',
  '/carte': 'Carte des itinéraires',
  '/import': 'Importer le programme',
  '/stations': 'Stations-service',
  '/parametres': 'Paramètres de planification',
  '/utilisateurs': 'Comptes utilisateurs',
  '/securite': 'Données de sûreté',
};

export default function Layout() {
  const { pathname } = useLocation();
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const title = TITLES[pathname] ?? (pathname.startsWith('/plan/') ? 'Détail du voyage' : 'JMP Planner');

  const items = isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;

  const quit = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">JMP</div>
          <div className="brand-name">Planner</div>
        </div>
        <nav className="nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-date">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="sidebar-user">
            <div>
              <div className="user-name">{user?.fullName || user?.username}</div>
              <div className="user-role">{isAdmin ? 'Administrateur' : 'Utilisateur'}</div>
            </div>
            <button className="btn btn-small" onClick={quit}>Déconnexion</button>
          </div>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <h1>{title}</h1>
            <p className="subtitle">Programme de livraison carburant - C.E.C MOHAMMEDIA FUELS</p>
          </div>
          <div className="topbar-actions">
            <NavLink to="/import" className="btn btn-primary">Importer un fichier</NavLink>
            <NavLink to="/plan" className="btn">Voir le plan</NavLink>
          </div>
        </header>
        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

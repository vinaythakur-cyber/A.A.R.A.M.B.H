import { IconAlert } from './icons.jsx';

export default function Footer({ t, online, apiUrl }) {
  return (
    <footer className="app-footer">
      <span className="footer-line">{t.footerSources}</span>
      <span className="footer-demo">
        <IconAlert size={13} />
        {t.footerDemo}
      </span>
      <span className="footer-conn">
        {online ? `● ${apiUrl}` : '○ backend unreachable'}
      </span>
    </footer>
  );
}

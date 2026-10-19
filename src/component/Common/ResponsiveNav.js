import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './ResponsiveNav.css';

/**
 * Phone and tablet navigation for every dashboard. On screens up to 900px wide the
 * sidebar slides in from a ☰ button instead of sitting beside the page (where it
 * squeezed the content or vanished, leaving no way to reach other screens).
 * Mounted once in App; it finds whichever dashboard sidebar is on the page. The
 * admin dashboard has its own menu button and is left alone.
 */
const SIDEBARS = '.pharmacy-sidebar, .doctor-sidebar, .therapist-sidebar, .client-sidebar, .mp-sidebar, .hcn-sidebar, .dashboard-sidebar';

export default function ResponsiveNav() {
  const location = useLocation();
  const [present, setPresent] = useState(false);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  // Is a dashboard sidebar on this page? (Checked after each navigation and as the page renders.)
  useEffect(() => {
    const check = () => setPresent(!!document.querySelector(SIDEBARS) && !document.querySelector('.admin-sidebar'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  // A new screen closes the drawer.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('nh-has-dashboard', present);
    document.body.classList.toggle('nh-nav-open', present && open);
    return () => { document.body.classList.remove('nh-nav-open'); };
  }, [present, open]);

  useEffect(() => {
    if (!present) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    // Choosing a menu item inside the drawer closes it.
    const onClick = (e) => {
      const sidebar = e.target.closest && e.target.closest(SIDEBARS);
      if (sidebar && e.target.closest('a, button, [role="button"], li')) setTimeout(() => setOpen(false), 0);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, [present]);

  if (!present) return null;
  return (
    <>
      <button type="button" className="nh-nav-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <span className={`nh-burger ${open ? 'x' : ''}`} aria-hidden="true"><i /><i /><i /></span>
      </button>
      <div className="nh-nav-scrim" onClick={close} aria-hidden="true" />
    </>
  );
}

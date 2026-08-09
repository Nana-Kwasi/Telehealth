// ─── UserAvatar (web) ────────────────────────────────────────────────────────
// The profile icon, wherever a person is shown. Renders their picture if one is
// saved and their initials if not, so it never falls back to a blank circle.
//
// Screens each rolled their own avatar and read a different field name (photoURL
// here, profilePhotoUrl there), which is why a saved image appeared in one place
// and not another.

import React, { useState } from 'react';
import { avatarUrlOf, initialsOf } from '../../utils/profileImage';
import './UserAvatar.css';

export default function UserAvatar({
  user,
  size = 40,
  onClick,
  className = '',
  title,
}) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : avatarUrlOf(user);

  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) };
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ua ${url ? 'ua--image' : ''} ${className}`.trim()}
      style={style}
      onClick={onClick}
      title={title || user?.fullName || user?.name || undefined}
    >
      {url ? (
        <img
          className="ua-img"
          src={url}
          alt={user?.fullName || user?.name || 'Profile'}
          // A deleted or unreachable image falls back to initials, not a blank.
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="ua-initials">{initialsOf(user)}</span>
      )}
    </Tag>
  );
}

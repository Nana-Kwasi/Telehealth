import React from 'react';

export function nurseInitials(nurse) {
  const name = nurse?.fullName || nurse?.name || 'N';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function NurseAvatar({ nurse, size = 68, className = '' }) {
  const style = { width: size, height: size, fontSize: size * 0.35 };
  if (nurse?.photoURL) {
    return (
      <img
        src={nurse.photoURL}
        alt=""
        className={`hcn-avatar-img ${className}`.trim()}
        style={style}
      />
    );
  }
  return (
    <div className={`hcn-avatar hcn-avatar-initials ${className}`.trim()} style={style}>
      {nurseInitials(nurse)}
    </div>
  );
}

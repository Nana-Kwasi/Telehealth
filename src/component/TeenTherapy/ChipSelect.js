import React from 'react';

export default function ChipSelect({ options, value, onChange, error }) {
  return (
    <>
      <div className="teen-chips">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`teen-chip ${value === opt ? 'selected' : ''}`}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      {error ? <p className="teen-field-error">{error}</p> : null}
    </>
  );
}

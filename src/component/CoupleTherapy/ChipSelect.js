import React from 'react';

export default function ChipSelect({ options, value, onChange, multi, error }) {
  return (
    <>
      <div className="teen-chips">
        {options.map((opt) => {
          const selected = multi ? (value || []).includes(opt) : value === opt;
          const press = () => {
            if (multi) {
              const list = value || [];
              onChange(selected ? list.filter((x) => x !== opt) : [...list, opt]);
            } else {
              onChange(opt);
            }
          };
          return (
            <button
              key={opt}
              type="button"
              className={`teen-chip ${selected ? 'selected' : ''}`}
              onClick={press}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {error ? <p className="teen-field-error">{error}</p> : null}
    </>
  );
}

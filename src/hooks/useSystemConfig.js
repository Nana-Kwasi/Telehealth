import { useState, useEffect } from 'react';
import { db } from '../services/firestoreShim';
import { doc, onSnapshot } from '../services/firestoreShim';
import { setFeatureFlagOverrides } from '../utils/featureFlags';

// Module-level singleton — all components share one Firestore subscription
let _cache = null;
let _sub   = null;
const _cbs = new Set();
let _flagsCache = {};
let _flagsSub = null;
const _flagCbs = new Set();

function startSubscription() {
  if (_sub) return;
  _sub = onSnapshot(
    doc(db, 'systemConfig', 'settings'),
    snap => {
      _cache = snap.exists() ? snap.data() : {};
      _cbs.forEach(fn => fn(_cache));
    },
    () => {
      _cache = _cache || {};   // keep last good value on error
      _cbs.forEach(fn => fn(_cache));
    }
  );
}

function startFlagsSubscription() {
  if (_flagsSub) return;
  _flagsSub = onSnapshot(
    doc(db, 'systemConfig', 'featureFlags'),
    snap => {
      _flagsCache = snap.exists() ? (snap.data()?.overrides || {}) : {};
      setFeatureFlagOverrides(_flagsCache);
      _flagCbs.forEach(fn => fn(_flagsCache));
    },
    () => {
      _flagsCache = _flagsCache || {};
      setFeatureFlagOverrides(_flagsCache);
      _flagCbs.forEach(fn => fn(_flagsCache));
    }
  );
}

export default function useSystemConfig() {
  const [config, setConfig] = useState(_cache || {});

  useEffect(() => {
    _cbs.add(setConfig);
    if (_cache) setConfig(_cache);
    startSubscription();
    return () => _cbs.delete(setConfig);
  }, []);

  return config;
}

export function useFeatureFlagsConfig() {
  const [overrides, setOverrides] = useState(_flagsCache || {});

  useEffect(() => {
    _flagCbs.add(setOverrides);
    if (_flagsCache) setOverrides(_flagsCache);
    startFlagsSubscription();
    return () => _flagCbs.delete(setOverrides);
  }, []);

  return overrides;
}

// Convenience getter with typed default
export function cfg(config, section, key, defaultValue) {
  const val = config?.[section]?.[key];
  return val !== undefined && val !== null ? val : defaultValue;
}

// One-shot read (for enforcement inside async handlers without re-renders)
export async function getConfigOnce() {
  if (_cache) return _cache;
  const { getDoc } = await import('../services/firestoreShim');
  try {
    const snap = await getDoc(doc(db, 'systemConfig', 'settings'));
    _cache = snap.exists() ? snap.data() : {};
  } catch { _cache = {}; }
  return _cache;
}

export async function getFeatureFlagsOnce() {
  if (_flagsCache && Object.keys(_flagsCache).length) return _flagsCache;
  const { getDoc } = await import('../services/firestoreShim');
  try {
    const snap = await getDoc(doc(db, 'systemConfig', 'featureFlags'));
    _flagsCache = snap.exists() ? (snap.data()?.overrides || {}) : {};
  } catch {
    _flagsCache = {};
  }
  setFeatureFlagOverrides(_flagsCache);
  return _flagsCache;
}

import React from 'react';
import '../Pharmacy/PharmacyDashboard.css';
import DiagnosticParentDashboard from '../Diagnostic/DiagnosticParentDashboard';

export default function ScanDashboard({ profile }) {
  return <DiagnosticParentDashboard profile={profile} type="scan" />;
}

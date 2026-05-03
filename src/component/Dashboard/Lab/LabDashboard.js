import React from 'react';
import '../Pharmacy/PharmacyDashboard.css';
import DiagnosticParentDashboard from '../Diagnostic/DiagnosticParentDashboard';

export default function LabDashboard({ profile }) {
  return <DiagnosticParentDashboard profile={profile} type="lab" />;
}

import React from 'react';
import '../Pharmacy/PharmacyDashboard.css';
import DiagnosticBranchDashboard from '../Diagnostic/DiagnosticBranchDashboard';

export default function ScanBranchDashboard({ profile }) {
  return <DiagnosticBranchDashboard profile={profile} type="scan" />;
}

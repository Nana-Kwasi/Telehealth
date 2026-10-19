import React from 'react';
import {
  LayoutDashboard, Store, Pill, MailOpen, BarChart3, Receipt, BadgeCheck, BookOpen, Flag, Settings,
  ArrowLeftRight, History, ClipboardList, ScanLine, FlaskConical, FileText, Tags, Search, Circle,
} from 'lucide-react';

/**
 * Line icons for the pharmacy, lab and scan side menus (they used emoji, which
 * render differently on every computer and looked unfinished). Picked by the
 * menu label so the NAV lists stay as they are.
 */
const BY_LABEL = [
  [/overview|dashboard/i, LayoutDashboard],
  [/branch/i, Store],
  [/open prescriptions/i, MailOpen],
  [/prescription/i, Pill],
  [/transfer/i, ArrowLeftRight],
  [/activity/i, History],
  [/report issue/i, Flag],
  [/report/i, BarChart3],
  [/claim/i, Receipt],
  [/pre-?auth/i, BadgeCheck],
  [/formulary/i, BookOpen],
  [/worklist|orders/i, ClipboardList],
  [/scan catalog/i, ScanLine],
  [/catalog/i, Tags],
  [/result/i, FileText],
  [/verify/i, Search],
  [/lab/i, FlaskConical],
  [/setting/i, Settings],
];

export default function ProviderNavIcon({ label, size = 17 }) {
  const Icon = (BY_LABEL.find(([re]) => re.test(label || '')) || [null, Circle])[1];
  return <span className="provider-nav-icon" aria-hidden><Icon size={size} strokeWidth={2} /></span>;
}

import { db, auth } from '../component/Auth/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const A = {
  LOGIN_SUCCESS:           'LOGIN_SUCCESS',
  LOGIN_FAILED:            'LOGIN_FAILED',
  LOGOUT:                  'LOGOUT',
  PASSWORD_RESET_SENT:     'PASSWORD_RESET_SENT',
  ADMIN_TEMP_PASSWORD_SET: 'ADMIN_TEMP_PASSWORD_SET',
  PROFILE_UPDATED:         'PROFILE_UPDATED',
  APPOINTMENT_BOOKED:      'APPOINTMENT_BOOKED',
  APPOINTMENT_CANCELLED:   'APPOINTMENT_CANCELLED',
  APPOINTMENT_RESCHEDULED: 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_COMPLETED:   'APPOINTMENT_COMPLETED',
  PRESCRIPTION_CREATED:    'PRESCRIPTION_CREATED',
  PRESCRIPTION_UPDATED:    'PRESCRIPTION_UPDATED',
  PRESCRIPTION_CANCELLED:  'PRESCRIPTION_CANCELLED',
  SESSION_SCHEDULED:       'SESSION_SCHEDULED',
  SESSION_COMPLETED:       'SESSION_COMPLETED',
  SESSION_CANCELLED:       'SESSION_CANCELLED',
  LAB_ORDER_CREATED:       'LAB_ORDER_CREATED',
  SCAN_ORDER_CREATED:      'SCAN_ORDER_CREATED',
  REPORT_SUBMITTED:        'REPORT_SUBMITTED',
  REPORT_RESPONDED:        'REPORT_RESPONDED',
  ADMIN_USER_STATUS:       'ADMIN_USER_STATUS_CHANGED',
  ADMIN_USER_DELETED:      'ADMIN_USER_DELETED',
  ADMIN_USER_EDITED:       'ADMIN_USER_EDITED',
  ADMIN_USER_APPROVED:     'ADMIN_USER_APPROVED',
  ADMIN_CONFIG_CHANGED:    'ADMIN_CONFIG_CHANGED',
  ADMIN_NOTIFICATION_SENT: 'ADMIN_NOTIFICATION_SENT',
  DOCTOR_ONBOARDED:        'DOCTOR_ONBOARDED',
  THERAPIST_ONBOARDED:     'THERAPIST_ONBOARDED',
  PHARMACY_CREATED:        'PHARMACY_CREATED',
  LAB_CREATED:             'LAB_CREATED',
};

export async function logAction(action, details = {}, userTypeOverride = null) {
  try {
    const user = auth.currentUser;
    await addDoc(collection(db, 'auditLogs'), {
      action,
      details,
      userId:    user?.uid           || details.userId    || 'system',
      userName:  user?.displayName   || user?.email       || details.userName || 'Unknown',
      userEmail: user?.email         || details.userEmail || '',
      userType:  userTypeOverride    || details.userType  || 'user',
      platform:  'web',
      timestamp: serverTimestamp(),
      sessionId: sessionStorage.getItem('sessionId') || null,
    });
  } catch (e) {
    // Silent — audit failures must never crash the app
  }
}

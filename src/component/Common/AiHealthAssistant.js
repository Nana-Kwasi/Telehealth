import React from 'react';
import AiChat from './AiChat';

/**
 * Patient-facing entry point.
 *
 * The chat routes itself to the right service from the first message, so there
 * is no task picker: someone describing stomach pain should not first have to
 * understand the platform's four service categories.
 */
export default function AiHealthAssistant() {
  return <AiChat />;
}

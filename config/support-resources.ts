/**
 * Support and emergency contacts shown by Ask GeneBridge (task 06, section 4).
 *
 * EVERY NUMBER HERE IS A PLACEHOLDER. Verify each one with the official
 * source (Abu Dhabi Department of Health, UAE Ministry of Health and
 * Prevention) before the demo, then replace `[CONFIRM]`. Do not guess them.
 */
export type SupportResource = {
  id: string;
  /** Message key in messages/{locale}/assistant.json → support.resources. */
  labelKey: 'emergency' | 'ambulance' | 'mentalHealth' | 'familySupport';
  phone: string;
  /** Shown in the emergency card as the number to call now. */
  emergency?: boolean;
};

export const supportResources: SupportResource[] = [
  { id: 'emergency', labelKey: 'emergency', phone: '[CONFIRM]', emergency: true },
  { id: 'ambulance', labelKey: 'ambulance', phone: '[CONFIRM]', emergency: true },
  { id: 'mental-health', labelKey: 'mentalHealth', phone: '[CONFIRM]' },
  { id: 'family-support', labelKey: 'familySupport', phone: '[CONFIRM]' },
];

export const emergencyNumber = supportResources.find((r) => r.id === 'emergency')!.phone;

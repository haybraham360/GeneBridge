/** Care & services types, shared by the server page and the client list. */
export const serviceTypes = ['genetic_counselling', 'confirmatory_testing', 'specialist', 'ivf_embryo_testing', 'support_group', 'screening'] as const;
export type ServiceType = (typeof serviceTypes)[number];

export type ServiceItem = {
  name: string;
  type: ServiceType;
  description: string | null;
  area: string | null;
  languages: string[];
  coverage: 'programme' | 'referral' | 'free' | 'details';
  womenOnly: boolean;
  phone: string;
};

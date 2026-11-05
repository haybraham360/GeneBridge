/** Where condition links go (task 11 and the design refresh). Change them here. */
export const conditionGuideHref = (id: string) => `/dashboard/conditions/${id}`;
export const conditionsHref = '/dashboard/conditions';
export const testingHref = '/dashboard/services?type=screening';
export const servicesHref = '/dashboard/services';
export const simulatorHref = (id: string) => `/dashboard/simulator?condition=${encodeURIComponent(id)}`;

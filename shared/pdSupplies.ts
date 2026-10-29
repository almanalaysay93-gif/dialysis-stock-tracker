export const PD_SUBCATEGORIES = [
  "PD solution 2L/Box 1.5%",
  "PD solution 2L/Box 2.3%",
  "PD solution 2L/Box 4.25%",
  "PD solution 5L/Box 1.5%",
  "PD solution 5L/Box 2.3%",
  "PD solution 5L/Box 4.25%",
  "Organizer",
  "Extension catheter",
  "Connector leurlock",
  "Disinfection caps",
] as const;

export type PdSubcategory = (typeof PD_SUBCATEGORIES)[number];

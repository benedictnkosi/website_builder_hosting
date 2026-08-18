export const PEOPLE_ETHNICITY_OPTIONS = [
  {
    id: "black-african",
    label: "Black African",
    prompt: "Black African people",
  },
  {
    id: "coloured",
    label: "Coloured",
    prompt: "Coloured South African people",
  },
  {
    id: "indian",
    label: "Indian",
    prompt: "Indian South African people",
  },
  {
    id: "white",
    label: "White",
    prompt: "White people",
  },
  {
    id: "asian",
    label: "Asian",
    prompt: "Asian people",
  },
  {
    id: "diverse",
    label: "Diverse mix",
    prompt: "a diverse mix of people of different ethnicities",
  },
] as const;

export type PeopleEthnicityId = (typeof PEOPLE_ETHNICITY_OPTIONS)[number]["id"];

export function getPeopleEthnicityOption(id: string | null | undefined) {
  return PEOPLE_ETHNICITY_OPTIONS.find((option) => option.id === id) ?? null;
}

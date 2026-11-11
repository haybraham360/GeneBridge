/**
 * The conditions Blind Match compares (task 17, spec section 2): the
 * autosomal recessive conditions in the catalogue. The database holds the
 * same list in `blind_match_conditions`
 * (supabase/migrations/20261118000000_blind_match.sql); `conditions.test.ts`
 * fails if either drifts from the catalogue. 'sickle_cell' is the older
 * code for sickle_cell_disease.
 */
export const blindMatchConditions = [
  'bardet_biedl_syndrome',
  'beta_thalassemia',
  'biotinidase_deficiency',
  'congenital_adrenal_hyperplasia',
  'cystic_fibrosis',
  'familial_mediterranean_fever',
  'fanconi_anemia',
  'friedreich_ataxia',
  'galactosemia',
  'gaucher_disease',
  'gjb2_hearing_loss',
  'glanzmann_thrombasthenia',
  'glutaric_acidemia_type_1',
  'homocystinuria',
  'maple_syrup_urine_disease',
  'mcad_deficiency',
  'methylmalonic_acidemia',
  'mucopolysaccharidosis_type_1',
  'niemann_pick_disease',
  'phenylketonuria',
  'pompe_disease',
  'primary_ciliary_dyskinesia',
  'propionic_acidemia',
  'sickle_cell',
  'sickle_cell_disease',
  'spinal_muscular_atrophy',
  'tay_sachs_disease',
  'usher_syndrome',
  'wilson_disease',
] as const;

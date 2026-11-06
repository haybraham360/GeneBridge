/**
 * The six tools the model may use (task 13, section 4 step 3), as strict
 * JSON schemas. The same shapes are checked again with zod (schema.ts)
 * before anything is applied.
 */
import { relations } from '../relations';
import { conditionStatuses, linkTypes, sexes, sides } from '../types';

const relationEnum = relations.filter((r) => r !== 'self');
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const tokenSchema = { type: 'string', pattern: '^\\[PERSON_\\d{1,2}\\]$' };

type ToolDefinition = {
  name: string;
  description: string;
  strict: true;
  eager_input_streaming: true;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
};

function tool(name: string, description: string, properties: Record<string, unknown>): ToolDefinition {
  return {
    name,
    description,
    strict: true,
    // Each call reaches the browser as soon as it is complete, so people appear one by one.
    eager_input_streaming: true,
    input_schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
  };
}

export const familyTools: ToolDefinition[] = [
  tool('add_person', 'Add one person the description clearly mentions. Relation is relative to self.', {
    temp_id: { type: 'string', description: 'Your short id for this new person in this turn, e.g. "p1".' },
    relation_hint: { type: 'string', enum: relationEnum },
    side: { type: 'string', enum: [...sides], description: 'paternal (father\'s side), maternal (mother\'s side) or none.' },
    sex: { type: 'string', enum: [...sexes], description: 'Only from the kinship word or when stated. Never from a name.' },
    generation: { type: 'integer', description: 'Relative to self: parents -1, grandparents -2, children 1.' },
    label_token: { ...nullable(tokenSchema), description: 'The [PERSON_n] token for their name, or null if unnamed.' },
  }),
  tool('add_link', 'Link two people when the description states how they are related to each other.', {
    from: { type: 'string', description: 'A temp_id, an id from the tree, or "self". For parent_of, the parent.' },
    to: { type: 'string', description: 'A temp_id, an id from the tree, or "self". For parent_of, the child.' },
    type: { type: 'string', enum: [...linkTypes] },
    consanguineous: { type: 'boolean', description: 'partner_of only, and only if the person says the partners are related by blood.' },
  }),
  tool('add_condition', 'Record a health condition for a person, in the person\'s own words. GeneBridge matches it to its catalogue.', {
    person: { type: 'string', description: 'A temp_id, an id from the tree, or "self".' },
    condition_query: { type: 'string', description: 'The person\'s words for the condition, as written. No variant or test details.' },
    status: { type: 'string', enum: [...conditionStatuses] },
  }),
  tool('update_person', 'Change a person already in the tree (for example after the person answers a question). Use null to leave a field unchanged.', {
    id: { type: 'string' },
    fields: {
      type: 'object',
      properties: {
        relation_hint: nullable({ type: 'string', enum: relationEnum }),
        side: nullable({ type: 'string', enum: [...sides] }),
        sex: nullable({ type: 'string', enum: [...sexes] }),
        label_token: nullable(tokenSchema),
        deceased: nullable({ type: 'boolean' }),
      },
      required: ['relation_hint', 'side', 'sex', 'label_token', 'deceased'],
      additionalProperties: false,
    },
  }),
  tool('ask_user', 'Ask one short clarifying question with quick-answer choices. At most 2 per turn.', {
    question: { type: 'string' },
    choices: { type: 'array', items: { type: 'string' }, description: '2 to 4 short choices.' },
  }),
  tool('done', 'Finish the turn with a one-line plain summary of what was added. No risk or advice.', {
    summary: { type: 'string' },
  }),
];

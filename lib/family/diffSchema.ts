/** The shape of a save request from the browser, checked before anything is written. */
import { z } from 'zod';
import { relations } from './relations';
import { conditionStatuses, linkTypes, MAX_PEOPLE, sexes, sides } from './types';

const id = z.uuid();

const member = z.strictObject({
  id,
  label: z.string().trim().max(60).nullable(),
  relation: z.enum(relations as [string, ...string[]]),
  side: z.enum(sides),
  sex: z.enum(sexes),
  generation: z.number().int().min(-6).max(6),
  deceased: z.boolean(),
  createdBy: z.enum(['manual', 'ai']),
  isOwner: z.boolean(),
  placeholder: z.boolean(),
});

const link = z.strictObject({ id, from: id, to: id, type: z.enum(linkTypes), consanguineous: z.boolean() });

const condition = z.strictObject({
  id,
  memberId: id,
  conditionId: z.string().regex(/^[a-z0-9_]{2,40}$/).nullable(),
  otherText: z.string().trim().max(120).nullable(),
  status: z.enum(conditionStatuses),
  source: z.enum(['manual', 'ai']),
});

export const treeDiffSchema = z.strictObject({
  upsert: z.strictObject({
    members: z.array(member).max(MAX_PEOPLE),
    links: z.array(link).max(MAX_PEOPLE * 4),
    conditions: z.array(condition).max(MAX_PEOPLE * 6),
  }),
  remove: z.strictObject({
    members: z.array(id).max(MAX_PEOPLE),
    links: z.array(id).max(MAX_PEOPLE * 4),
    conditions: z.array(id).max(MAX_PEOPLE * 6),
  }),
});

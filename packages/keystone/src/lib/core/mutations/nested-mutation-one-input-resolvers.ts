import { KeystoneContext, TypesForList, schema } from '@keystone-next/types';
import { resolveUniqueWhereInput } from '../where-inputs';
import { InitialisedList } from '../types-for-lists';
import { userInputError } from '../graphql-errors';
import { NestedMutationState } from './create-update';

type _CreateValueType = Exclude<
  schema.InferValueFromArg<schema.Arg<TypesForList['relateTo']['one']['create']>>,
  null | undefined
>;
type _UpdateValueType = Exclude<
  schema.InferValueFromArg<
    schema.Arg<schema.NonNullType<TypesForList['relateTo']['one']['update']>>
  >,
  null | undefined
>;

async function handleCreateAndUpdate(
  value: _CreateValueType,
  nestedMutationState: NestedMutationState,
  context: KeystoneContext,
  foreignList: InitialisedList,
  target: string
) {
  if (value.connect) {
    // Validate and resolve the input filter
    const uniqueWhere = await resolveUniqueWhereInput(value.connect, foreignList.fields, context);

    // Check that the item exists and the user has read access to it (??)
    try {
      const item = await context.db.lists[foreignList.listKey].findOne({ where: value.connect });
      if (item === null) {
        throw new Error(`Unable to connect a ${target}`);
      }
    } catch {
      // E.g. if static access control means the foreign list doesn't support read at all
      throw new Error(`Unable to connect a ${target}`);
    }

    return { connect: uniqueWhere };
  } else if (value.create) {
    const createInput = value.create;
    let create = await (async () => {
      // Any errors here will be surfaced under the `KS_RELATIONSHIP_ERROR`
      return await nestedMutationState.create(createInput, foreignList);
    })();

    return { connect: { id: create.id } };
  }
}

export function resolveRelateToOneForCreateInput(
  nestedMutationState: NestedMutationState,
  context: KeystoneContext,
  foreignList: InitialisedList,
  target: string
) {
  return async (value: _CreateValueType) => {
    // FIXME: Bad user input if disconnect or disconnectAll are supplied?
    if (Object.keys(value).length !== 1) {
      throw userInputError(`Relationship field ${target} accepts exactly one input value.`);
    }
    return handleCreateAndUpdate(value, nestedMutationState, context, foreignList, target);
  };
}

export function resolveRelateToOneForUpdateInput(
  nestedMutationState: NestedMutationState,
  context: KeystoneContext,
  foreignList: InitialisedList,
  target: string
) {
  return async (value: _UpdateValueType) => {
    if (Object.keys(value).length !== 1) {
      throw userInputError(`Relationship field ${target} accepts exactly one input value.`);
    }

    if (value.connect || value.create) {
      return handleCreateAndUpdate(value, nestedMutationState, context, foreignList, target);
    } else if (value.disconnect) {
      return { disconnect: true };
    }
  };
}

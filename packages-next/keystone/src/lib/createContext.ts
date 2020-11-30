import { execute, GraphQLSchema, parse } from 'graphql';
import type {
  SessionContext,
  KeystoneContext,
  KeystoneGraphQLAPI,
  BaseKeystone,
} from '@keystone-next/types';

import { itemAPIForList } from './itemAPI';
import { accessControlContext, skipAccessControlContext } from './createAccessControlContext';

export function makeCreateContext({
  graphQLSchema,
  keystone,
}: {
  graphQLSchema: GraphQLSchema;
  keystone: BaseKeystone;
}) {
  const itemAPI: Record<string, ReturnType<typeof itemAPIForList>> = {};

  const createContext = ({
    sessionContext,
    skipAccessControl = false,
  }: {
    sessionContext?: SessionContext;
    skipAccessControl?: boolean;
  }): KeystoneContext => {
    const rawGraphQL: KeystoneGraphQLAPI<any>['raw'] = ({ query, context, variables }) => {
      if (typeof query === 'string') {
        query = parse(query);
      }
      return Promise.resolve(
        execute({
          schema: graphQLSchema,
          document: query,
          contextValue: context ?? contextToReturn,
          variableValues: variables,
        })
      );
    };
    const runGraphQL: KeystoneGraphQLAPI<any>['run'] = async args => {
      let result = await rawGraphQL(args);
      if (result.errors?.length) {
        throw result.errors[0];
      }
      return result.data as Record<string, any>;
    };
    const contextToReturn: KeystoneContext = {
      schemaName: 'public',
      ...(skipAccessControl ? skipAccessControlContext : accessControlContext),
      lists: itemAPI,
      totalResults: 0,
      keystone,
      graphql: {
        createContext,
        raw: rawGraphQL,
        run: runGraphQL,
        schema: graphQLSchema,
      } as KeystoneGraphQLAPI<any>,
      maxTotalResults: (keystone as any).queryLimits.maxTotalResults,
      createContext,
      ...sessionContext,
      // Note: These two fields let us use the server-side-graphql-client library.
      // We may want to remove them once the updated itemAPI w/ resolveFields is available.
      executeGraphQL: rawGraphQL,
      gqlNames: (listKey: string) => keystone.lists[listKey].gqlNames,
    };

    return contextToReturn;
  };

  for (const [listKey, list] of Object.entries(keystone.lists)) {
    itemAPI[listKey] = itemAPIForList(list, graphQLSchema, createContext);
  }

  return createContext;
}
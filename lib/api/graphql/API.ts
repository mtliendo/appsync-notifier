/* tslint:disable */
/* eslint-disable */
//  This file was automatically generated and should not be edited.

export type ProductInput = {
  name?: string | null,
};

export type Product = {
  __typename: "Product",
  id: string,
  createdAt?: string | null,
  updatedAt?: string | null,
  name?: string | null,
};

export type CreateProductMutationVariables = {
  input?: ProductInput | null,
};

export type CreateProductMutation = {
  createProduct?:  {
    __typename: "Product",
    id: string,
    createdAt?: string | null,
    updatedAt?: string | null,
    name?: string | null,
  } | null,
};

export type PublishMutationVariables = {
  data?: string | null,
};

export type PublishMutation = {
  publish?: string | null,
};

export type ListProductsQuery = {
  listProducts?:  Array< {
    __typename: "Product",
    id: string,
    createdAt?: string | null,
    updatedAt?: string | null,
    name?: string | null,
  } | null > | null,
};

export type SubscribeSubscription = {
  subscribe?: string | null,
};

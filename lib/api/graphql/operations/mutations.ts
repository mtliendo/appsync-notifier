/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

export const createProduct = /* GraphQL */ `
  mutation CreateProduct($input: ProductInput) {
    createProduct(input: $input) {
      id
      createdAt
      updatedAt
      name
    }
  }
`;
export const publish = /* GraphQL */ `
  mutation Publish($data: AWSJSON) {
    publish(data: $data)
  }
`;

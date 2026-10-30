import axios from "axios";

export function createApiClient(baseURL: string) {
  return axios.create({
    baseURL,
    timeout: 15_000,
    adapter: "fetch",
    headers: {
      Accept: "application/json",
    },
  });
}
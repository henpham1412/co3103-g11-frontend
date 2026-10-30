import axios from "axios";

export function createApiClient(baseURL: string) {
  return axios.create({
    baseURL,
    timeout: 15_000,
    adapter: "fetch",
    // Redirects can forward login bodies or Bearer headers outside the API boundary.
    fetchOptions: { redirect: "error" },
    headers: {
      Accept: "application/json",
    },
  });
}

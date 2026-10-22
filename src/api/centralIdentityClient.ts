import { createApiClient } from "./http";

const baseURL =
  import.meta.env.VITE_IDENTITY_API_BASE_URL ||
  "http://localhost:8080/api/v1";

export const centralIdentityClient = createApiClient(baseURL);
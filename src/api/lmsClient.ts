import { createApiClient } from "./http";

const baseURL =
  import.meta.env.VITE_LMS_API_BASE_URL ||
  "http://localhost:8081/api/v1";

export const lmsClient = createApiClient(baseURL);
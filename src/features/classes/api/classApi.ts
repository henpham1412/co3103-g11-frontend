import { lmsClient } from "../../../api/lmsClient";
import type { ClassCatalogResponse, EnrollmentPolicy } from "../types";

export interface ClassCatalogQuery {
  q?: string;
  enrollment_policy?: EnrollmentPolicy;
  page?: number;
  size?: number;
}

export async function getClassCatalog(
  query: ClassCatalogQuery = {},
): Promise<ClassCatalogResponse> {
  const response = await lmsClient.get<ClassCatalogResponse>("/classes", {
    params: query,
  });

  return response.data;
}
import { headers } from "next/headers";
import { getAuth } from "./auth";

export async function getSession() {
  // Read headers first: marks the render dynamic before anything touches the DB.
  const h = await headers();
  return getAuth().api.getSession({ headers: h });
}

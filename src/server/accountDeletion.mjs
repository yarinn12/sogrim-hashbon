import { fetchWithTimeout } from "../data/fetchTimeout.mjs";

const DELETE_CONFIRMATION = "delete-my-account";
const DELETE_USER_ATTEMPTS = 3;
export const ACCOUNT_DELETION_REQUEST_TIMEOUT_MS = 8_000;

export async function deleteSupabaseAccount({
  runtimeConfig,
  env = process.env,
  authorization = "",
  confirmation = "",
  fetchImpl = fetch,
  requestTimeoutMs = ACCOUNT_DELETION_REQUEST_TIMEOUT_MS
}) {
  if (confirmation !== DELETE_CONFIRMATION) {
    return failure(400, "Account deletion was not confirmed");
  }

  const supabaseUrl = runtimeConfig?.storage?.url;
  const anonKey = runtimeConfig?.storage?.anonKey;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const accessToken = bearerToken(authorization);
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return failure(503, "Account deletion is not configured");
  }
  if (!accessToken) return failure(401, "Authentication is required");

  let userResult;
  try {
    userResult = await fetchWithTimeout(
      fetchImpl,
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`
        }
      },
      requestTimeoutMs,
      async (response) => ({
        response,
        payload: response.ok
          ? await response.json().catch(() => null)
          : null
      })
    );
  } catch {
    return failure(502, "Account identity could not be verified");
  }
  const userResponse = userResult.response;
  if (!userResponse.ok) return failure(401, "Account session is invalid");

  const user = userResult.payload;
  if (!user?.id) return failure(409, "Account identity is unavailable");

  const deleteUserResponse = await deleteAuthUserWithRetry({
    supabaseUrl,
    serviceRoleKey,
    userId: user.id,
    fetchImpl,
    requestTimeoutMs
  });
  if (!deleteUserResponse.ok) {
    return failure(502, "Account removal could not be completed");
  }

  return {
    ok: true,
    status: 200,
    payload: {
      ok: true,
      accountDeleted: true,
      sharedRecordsPseudonymized: true,
      deletionAtomic: true
    }
  };
}

async function deleteAuthUserWithRetry({
  supabaseUrl,
  serviceRoleKey,
  userId,
  fetchImpl,
  requestTimeoutMs
}) {
  let response = null;
  const duration = Math.max(
    1,
    Number(requestTimeoutMs) || ACCOUNT_DELETION_REQUEST_TIMEOUT_MS
  );
  const deadline = Date.now() + duration;
  for (let attempt = 0; attempt < DELETE_USER_ATTEMPTS; attempt += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const attemptsLeft = DELETE_USER_ATTEMPTS - attempt;
    try {
      response = await fetchWithTimeout(
        fetchImpl,
        `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers: adminHeaders(serviceRoleKey),
          body: JSON.stringify({ should_soft_delete: false })
        },
        Math.max(1, Math.floor(remainingMs / attemptsLeft))
      );
    } catch {
      response = null;
      continue;
    }
    if (response.ok || response.status === 404) {
      return response.ok ? response : { ...response, ok: true, alreadyDeleted: true };
    }
    if (!isRetryableDeletionStatus(response.status)) return response;
  }
  return response ?? { ok: false, status: 504 };
}

function isRetryableDeletionStatus(status) {
  const numericStatus = Number(status) || 0;
  return numericStatus === 408 || numericStatus === 429 || numericStatus >= 500;
}

function adminHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json"
  };
}

function bearerToken(value) {
  const match = String(value).match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? "";
}

function failure(status, error) {
  return { ok: false, status, payload: { ok: false, error } };
}

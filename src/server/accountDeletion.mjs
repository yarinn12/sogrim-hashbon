const DELETE_CONFIRMATION = "delete-my-account";
const DELETE_USER_ATTEMPTS = 3;

export async function deleteSupabaseAccount({
  runtimeConfig,
  env = process.env,
  authorization = "",
  confirmation = "",
  fetchImpl = fetch
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

  const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`
    }
  });
  if (!userResponse.ok) return failure(401, "Account session is invalid");

  const user = await userResponse.json().catch(() => null);
  if (!user?.id) return failure(409, "Account identity is unavailable");

  const rpcResponse = await fetchImpl(
    `${supabaseUrl}/rest/v1/rpc/delete_account_data`,
    {
      method: "POST",
      headers: adminHeaders(serviceRoleKey),
      body: JSON.stringify({
        p_user_id: user.id
      })
    }
  );
  if (!rpcResponse.ok) {
    return failure(503, "Account data deletion is temporarily unavailable");
  }

  const deleteUserResponse = await deleteAuthUserWithRetry({
    supabaseUrl,
    serviceRoleKey,
    userId: user.id,
    fetchImpl
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
      sharedRecordsAnonymized: true
    }
  };
}

async function deleteAuthUserWithRetry({
  supabaseUrl,
  serviceRoleKey,
  userId,
  fetchImpl
}) {
  let response = null;
  for (let attempt = 0; attempt < DELETE_USER_ATTEMPTS; attempt += 1) {
    response = await fetchImpl(
      `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: adminHeaders(serviceRoleKey),
        body: JSON.stringify({ should_soft_delete: false })
      }
    );
    if (response.ok) return response;
  }
  return response;
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

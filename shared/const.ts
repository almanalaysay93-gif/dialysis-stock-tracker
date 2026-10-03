export const COOKIE_NAME = "app_session_id";
// One nursing shift. Shared workstations should not stay signed in for longer.
export const SESSION_MS = 1000 * 60 * 60 * 12;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

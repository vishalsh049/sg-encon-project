export function getStoredSession() {
  try {
    const raw = localStorage.getItem("sessionUser");
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

export function setStoredSession(user) {
  localStorage.setItem("sessionUser", JSON.stringify(user));
  if (user?.roleName) {
    localStorage.setItem("role", user.roleName);
  }
}

export function clearStoredSession() {
  localStorage.removeItem("sessionUser");
  localStorage.removeItem("role");
}

export function hasPermission(permissionKey) {
  const session = getStoredSession();
  return Boolean(session?.permissions?.includes(permissionKey));
}

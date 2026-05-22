import { getPageDisplayName } from "../lib/pageMap";

/**
 * Check if a user has access to a specific page
 * @param {string} page - Page display name
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const hasAccess = (page, user) => {
  if (!user) {
    return false;
  }

  const normalizedPage = String(page || "").trim().toLowerCase();

  const pageAccessIds =
    Array.isArray(user.pageAccess) && user.pageAccess.length > 0
      ? user.pageAccess
      : Array.isArray(user.pagePermissions) && user.pagePermissions.length > 0
      ? user.pagePermissions
          .filter((permission) => permission.view)
          .map((permission) => permission.page)
      : [];

  // Admin or no restriction
  if (pageAccessIds.length === 0) {
    return true;
  }

  return pageAccessIds.some((pageId) => {
    const pageDisplayName = getPageDisplayName(pageId);
    const normalizedAccessPage = String(pageDisplayName || pageId || "").trim().toLowerCase();
    const normalizedRawPage = String(pageId || "").trim().toLowerCase();

    return (
      normalizedAccessPage === normalizedPage ||
      normalizedRawPage === normalizedPage
    );
  });
};
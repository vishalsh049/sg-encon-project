import { getPageDisplayName } from "../lib/pageMap";

const isAdminUser = (user) =>
  String(user?.roleName || "").trim().toLowerCase() === "admin";

const getAllowedPageIds = (user) => {
  if (Array.isArray(user?.pageAccess) && user.pageAccess.length > 0) {
    return user.pageAccess;
  }
  if (Array.isArray(user?.pagePermissions) && user.pagePermissions.length > 0) {
    return user.pagePermissions
      .filter((permission) => permission.view)
      .map((permission) => permission.page);
  }
  return [];
};

const pageIdMatches = (pageId, normalizedPage) => {
  const pageDisplayName = getPageDisplayName(pageId);
  const normalizedAccessPage = String(pageDisplayName || pageId || "").trim().toLowerCase();
  const normalizedRawPage = String(pageId || "").trim().toLowerCase();

  return (
    normalizedAccessPage === normalizedPage ||
    normalizedRawPage === normalizedPage
  );
};

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
  const pageAccessIds = getAllowedPageIds(user);

  // Admins with no page_permissions row configured get unrestricted access.
  // Non-admins with zero permissions assigned get NO access (deny by default).
  if (pageAccessIds.length === 0) {
    return isAdminUser(user);
  }

  return pageAccessIds.some((pageId) => pageIdMatches(pageId, normalizedPage));
};

/**
 * Get the view/edit/delete/download permission flags a user has for a page.
 * Admins always get every action. Non-admins with no matching entry get all-false.
 * @param {Object} user - User object
 * @param {string} pageId - Page id as stored in page_permissions (e.g. "tower-reports")
 * @returns {{view: boolean, edit: boolean, delete: boolean, download: boolean}}
 */
export const getPagePermission = (user, pageId) => {
  const allFalse = { view: false, edit: false, delete: false, download: false };
  if (!user) return allFalse;

  if (isAdminUser(user)) {
    return { view: true, edit: true, delete: true, download: true };
  }

  const normalizedPageId = String(pageId || "").trim().toLowerCase();
  const entry = Array.isArray(user.pagePermissions)
    ? user.pagePermissions.find((permission) =>
        pageIdMatches(permission.page, normalizedPageId)
      )
    : null;

  return {
    view: Boolean(entry?.view),
    edit: Boolean(entry?.edit),
    delete: Boolean(entry?.delete),
    download: Boolean(entry?.download),
  };
};
function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isAdmin(authUser) {
  return normalize(authUser?.roleName) === "admin";
}

function hasPagePermission(authUser, pageId, action) {
  if (isAdmin(authUser)) return true;

  const pagePermissions = Array.isArray(authUser?.pagePermissions)
    ? authUser.pagePermissions
    : [];

  const normalizedPageId = normalize(pageId);
  const entry = pagePermissions.find(
    (permission) => normalize(permission?.page) === normalizedPageId
  );

  return Boolean(entry?.[action]);
}

function requirePagePermission(pageId, action) {
  return (req, res, next) => {
    if (hasPagePermission(req.authUser, pageId, action)) {
      return next();
    }

    return res.status(403).json({
      message: `You do not have ${action} permission for ${pageId}.`,
    });
  };
}

module.exports = {
  hasPagePermission,
  isAdmin,
  requirePagePermission,
};

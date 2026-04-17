export const hasAccess = (user, page) => {
  if (!user || !user.pageAccess) return false;
  return user.pageAccess.includes(page);
};
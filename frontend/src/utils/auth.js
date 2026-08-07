export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem("sessionUser")) || {};
  } catch {
    return {};
  }
};

export const hasPermission = (name) => {
  const user = getUser();
  return user?.permissions?.includes(name);
};

export const getUserCircle = () => {
  const user = getUser();
  return user?.circle || "";
};
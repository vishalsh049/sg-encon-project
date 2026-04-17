export const getUser = () => {
  return JSON.parse(localStorage.getItem("user")) || {};
};

export const hasPermission = (name) => {
  const user = getUser();
  return user?.permissions?.includes(name);
};

export const getUserCircle = () => {
  const user = getUser();
  return user?.circle || "ALL";
};
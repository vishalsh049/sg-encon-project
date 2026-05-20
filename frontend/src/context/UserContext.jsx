import { createContext, useContext, useState, useEffect } from "react";
import { getStoredSession } from "../lib/session";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Initialize user from stored session when app loads
  useEffect(() => {
    const storedUser = getStoredSession();
    if (storedUser) {
      setUser(storedUser);
    }
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
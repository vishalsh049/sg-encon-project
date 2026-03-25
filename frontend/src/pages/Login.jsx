import { useState } from "react";
import axios from "axios";
import { buildApiUrl } from "../lib/api";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    try {
      const res = await axios.post(buildApiUrl("/api/auth/login"), {
        email: username, // change if needed
        password,
      });

      localStorage.setItem("token", res.data.token);

      // Redirect
      window.location.href = "/dashboard";

    } catch (err) {
      setErrorMessage(
        "Login failed. Check whether the backend API URL is correct and the server is running."
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        
        {/* Title */}
        <h2 className="text-center text-2xl font-semibold text-purple-600 mb-8">
          S G Encon Pvt. Ltd.
        </h2>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
          
          {/* Username */}
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full border-b border-gray-300 focus:border-purple-600 outline-none py-2 bg-transparent"
            />
          </div>

          {/* Password */}
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border-b border-gray-300 focus:border-purple-600 outline-none py-2 bg-transparent"
            />
          </div>

          {/* Button */}
          <button
            type="submit"
            className="w-full py-2 rounded-md text-white font-medium bg-gradient-to-r from-purple-500 to-indigo-500 hover:opacity-90 transition"
          >
            Login
          </button>
        </form>

        {/* Forgot Password */}
        <p className="text-center text-sm text-purple-600 mt-4 cursor-pointer">
          Forgot Your Password?
        </p>

      </div>
    </div>
  );
}

export default Login;

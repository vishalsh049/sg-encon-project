import { useEffect, useState } from "react";
import { buildApiUrl } from "../lib/api";
import { useUser } from "../context/UserContext";

function AddData() {
  const [data, setData] = useState([]);
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const { user } = useUser();
  const userPermissions = user?.permissions || [];
const userCircle = user?.circle || "ALL";

  useEffect(() => {
    fetch(buildApiUrl("/api/manpower"))
      .then((res) => res.json())
      .then((result) => setData(result))
      .catch((err) => console.error(err));
  }, []);

  const handleAdd = () => {
    if (!role || !status) {
      alert("Please fill all fields");
      return;
    }

    fetch(buildApiUrl("/api/manpower"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, status }),
    })
      .then((res) => res.json())
      .then(() => {
        fetch(buildApiUrl("/api/manpower"))
          .then((res) => res.json())
          .then((nextData) => setData(nextData));

        setRole("");
        setStatus("");
      })
      .catch((err) => console.error(err));
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-text-primary">Manpower Data</h2>
        <p className="mt-1 text-sm text-text-secondary">Add and manage manpower records.</p>
      </div>

      <div className="app-surface p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <input
            type="text"
            placeholder="Enter Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="app-input"
          />

          <input
            type="text"
            placeholder="Enter Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="app-input"
          />

          <button onClick={handleAdd} className="app-button-primary w-full">
            Add Data
          </button>
        </div>
      </div>

      <div className="app-table-wrap">
        <table className="app-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data && data.length > 0 ? (
              data.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td className="text-text-primary">{item.role || "N/A"}</td>
                  <td>{item.status || "N/A"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" className="text-center text-text-secondary">
                  No Data Found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AddData;

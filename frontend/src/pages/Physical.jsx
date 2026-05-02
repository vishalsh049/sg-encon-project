import React, { useState } from "react";

export default function Physical() {
  const [form, setForm] = useState({
    type: "",
    quantity: "",
    rate: "",
    total: "",
  });

  const [data, setData] = useState([]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    let updated = { ...form, [name]: value };

    if (name === "quantity" || name === "rate") {
      const qty = name === "quantity" ? value : form.quantity;
      const rate = name === "rate" ? value : form.rate;
      updated.total = qty && rate ? qty * rate : "";
    }

    setForm(updated);
  };

  const handleAdd = () => {
    if (!form.type || !form.quantity || !form.rate) {
      alert("Please fill all fields");
      return;
    }

    setData([...data, form]);

    setForm({
      type: "",
      quantity: "",
      rate: "",
      total: "",
    });
  };

  return (
    <div className="p-6">
      {/* Title */}
      <h1 className="text-2xl font-semibold mb-6">Manpower - Physical</h1>

      {/* Form Card */}
      <div className="bg-white rounded-2xl shadow p-6 mb-6">
        <h2 className="text-lg font-medium mb-4">Add Entry</h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          
          <input
            name="type"
            placeholder="Type (Technician)"
            value={form.type}
            onChange={handleChange}
            className="border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            name="quantity"
            type="number"
            placeholder="Quantity"
            value={form.quantity}
            onChange={handleChange}
            className="border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            name="rate"
            type="number"
            placeholder="Rate"
            value={form.rate}
            onChange={handleChange}
            className="border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            name="total"
            placeholder="Total"
            value={form.total}
            readOnly
            className="border rounded-xl px-3 py-2 bg-gray-100"
          />

          <button
            onClick={handleAdd}
            className="bg-blue-600 text-white rounded-xl px-4 py-2 hover:bg-blue-700 transition"
          >
            Add
          </button>

        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="text-lg font-medium mb-4">Records</h2>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-3">Type</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Total</th>
              </tr>
            </thead>

            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-6 text-gray-400">
                    No data added yet
                  </td>
                </tr>
              ) : (
                data.map((item, index) => (
                  <tr
                    key={index}
                    className="border-b hover:bg-gray-50 transition"
                  >
                    <td className="py-3">{item.type}</td>
                    <td>{item.quantity}</td>
                    <td>₹{item.rate}</td>
                    <td className="font-medium">₹{item.total}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
